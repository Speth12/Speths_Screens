// Package virtual implements a computed-tag datasource.
//
// Each calculated tag has a path (name) and an expression in the Speth's
// Screens expression language (internal/expr), for example
//
//	{opcua:Temp} * 9/5 + 32
//	clamp(map({mb:AI0}, 0, 4095, 0, 100), 0, 100)
//
// Configuration (in the project datasource config):
//
//	cfg.Extra["tags"] = JSON array of {path, expr} objects
//
// Connect() compiles the tag list, then watches every referenced upstream
// tag in the tagstore. When any of them changes, every expression is
// evaluated again and the results are pushed to the output channel. A tag
// whose expression needs a Bad or missing input, or does not compile, is
// Bad with the reason and keeps its last value. A tag that reads itself
// must say how it starts: (good({sim:x}) ? {sim:x} : 0) + 1.
package virtual

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"reflect"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/expr"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

const driverID = "virtual"

// TagSpec describes one computed tag, as the project's CalculatedTag.
type TagSpec struct {
	Path string `json:"path"`
	Expr string `json:"expr"`
}

// calcTag is a TagSpec with its compiled expression (nil when it does not
// compile; err says why) and its last good value.
type calcTag struct {
	TagSpec
	expr *expr.Expr
	err  error
	last any
}

// Driver implements drivers.ProtocolDriver.
type Driver struct {
	mu        sync.RWMutex
	specs     []*calcTag
	vals      map[string]tagstore.TagState // current upstream tag states keyed by "ds:path"
	overrides map[string]float64           // manually written values that suppress formula evaluation
	store     *tagstore.TagStore           // upstream tagstore for live reads
	outCh     chan<- tagstore.TagUpdate
	stopCh    chan struct{}
	wg        sync.WaitGroup
	tagCount  atomic.Int32
	lastErr   atomic.Pointer[string]
	connected atomic.Bool
}

// New creates an unconnected virtual driver.
// The tagstore must be provided so the driver can read upstream values.
func New(store *tagstore.TagStore) *Driver {
	return &Driver{store: store}
}

func (d *Driver) ID() string { return driverID }

// Connect compiles the tag list and starts watching upstream tags.
//
// cfg.Extra["tags"] must be a JSON-encoded []TagSpec:
//
//	[{"path":"tempF","expr":"{opcua:Temp}*9/5+32"},...]
//
// A tag whose expression does not compile is Bad with the reason; the
// others run.
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	tagsJSON := cfg.Extra["tags"]
	if tagsJSON == "" {
		return fmt.Errorf("virtual: cfg.Extra['tags'] is required")
	}

	var list []TagSpec
	if err := json.Unmarshal([]byte(tagsJSON), &list); err != nil {
		return fmt.Errorf("virtual: invalid tags JSON: %w", err)
	}
	if len(list) == 0 {
		return fmt.Errorf("virtual: at least one tag spec is required")
	}
	specs := make([]*calcTag, len(list))
	for i, s := range list {
		e, err := expr.Compile(s.Expr)
		specs[i] = &calcTag{TagSpec: s, expr: e, err: err}
		if err != nil {
			msg := fmt.Sprintf("calculated tag %s: %v", s.Path, err)
			d.lastErr.Store(&msg)
			log.Printf("[DRIVER] virtual: %s", msg)
		}
	}

	d.mu.Lock()
	d.specs = specs
	d.vals = make(map[string]tagstore.TagState)
	d.overrides = make(map[string]float64)
	d.stopCh = make(chan struct{})
	d.outCh = out
	d.mu.Unlock()

	d.tagCount.Store(int32(len(specs)))
	d.connected.Store(true)
	log.Printf("[DRIVER] virtual: connected with %d computed tags", len(specs))
	refMap := refsOf(specs)
	d.refreshUpstream(refMap) // read the inputs first, so the first values are not Bad
	d.evaluateAll(specs)      // push initial values
	d.startLoop(specs, refMap)
	return nil
}

// refsOf maps each upstream key to the indices of the specs that use it.
func refsOf(specs []*calcTag) map[string][]int {
	refMap := map[string][]int{}
	for i, s := range specs {
		if s.expr == nil {
			continue
		}
		for _, ref := range s.expr.Refs {
			refMap[ref] = append(refMap[ref], i)
		}
	}
	return refMap
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	if d.stopCh != nil {
		close(d.stopCh)
		d.stopCh = nil
	}
	d.mu.Unlock()
	d.wg.Wait()
	d.connected.Store(false)
	return nil
}

// Browse returns all configured computed tags.
func (d *Driver) Browse(_ context.Context) ([]drivers.TagDefinition, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]drivers.TagDefinition, len(d.specs))
	for i, s := range d.specs {
		out[i] = drivers.TagDefinition{
			Path:        s.Path,
			Description: s.Expr,
			Writable:    true, // overrides are supported via Write()
		}
	}
	return out, nil
}

// SetTags does nothing: a virtual driver always computes every configured
// tag. It exists so the driver satisfies the same contract as the others.
func (d *Driver) SetTags(_ []string) error { return nil }

// startLoop starts the driver's only evaluation goroutine. It polls the
// referenced upstream tags (the tagstore has no external pub/sub) and
// re-evaluates every formula when one of them changes.
func (d *Driver) startLoop(specs []*calcTag, refMap map[string][]int) {
	d.mu.RLock()
	stopCh := d.stopCh
	d.mu.RUnlock()

	d.wg.Add(1)
	go func() {
		defer d.wg.Done()
		tick := time.NewTicker(200 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-stopCh:
				return
			case <-tick.C:
				if !d.refreshUpstream(refMap) {
					continue
				}
				d.evaluateAll(specs)
			}
		}
	}()
}

// refreshUpstream reads all referenced tags from the store and returns true if
// any value changed or if any manual overrides are active (so overridden values
// are re-emitted every tick).
func (d *Driver) refreshUpstream(refMap map[string][]int) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	changed := len(d.overrides) > 0 // always re-emit when overrides are present
	if d.store != nil {
		for key := range refMap {
			state, ok := d.store.Get(key)
			if !ok {
				continue
			}
			old, seen := d.vals[key]
			if !seen || old.Quality != state.Quality || !reflect.DeepEqual(old.Value, state.Value) {
				d.vals[key] = state
				changed = true
			}
		}
	}
	return changed
}

// evaluateAll computes all formulas and sends their results.
// If a tag has been written via Write(), the override value is used instead
// of the formula result — this lets Setpoint widgets and recipes actually
// change virtual tag values during a demo.
func (d *Driver) evaluateAll(specs []*calcTag) {
	d.mu.RLock()
	vals := make(map[string]tagstore.TagState, len(d.vals))
	for k, v := range d.vals {
		vals[k] = v
	}
	overrides := make(map[string]float64, len(d.overrides))
	for k, v := range d.overrides {
		overrides[k] = v
	}
	d.mu.RUnlock()

	env := expr.Env{Tag: func(ref string) (expr.Input, bool) {
		s, ok := vals[ref]
		return expr.Input{Value: s.Value, Quality: s.Quality}, ok
	}}
	now := time.Now().UnixNano()
	for _, s := range specs {
		state := tagstore.TagState{Quality: "Good", TS: now}
		switch ov, ok := overrides[s.Path]; {
		case ok:
			// Manual write takes precedence over the expression.
			state.Value = ov
		case s.expr == nil:
			state.Value, state.Quality, state.Reason = s.last, "Bad", s.err.Error()
		default:
			v, why := s.expr.Eval(env)
			if why != "" {
				// Bad keeps the last good value, as a driver going offline does.
				state.Value, state.Quality, state.Reason = s.last, "Bad", why
			} else {
				state.Value = v
				s.last = v
			}
		}
		d.send(tagstore.TagUpdate{Path: s.Path, State: state})
	}
}

// Write overrides a computed tag's value.
// The override persists until the driver is reconnected, allowing Setpoint
// widgets and recipes to write to virtual tags for demo/testing purposes.
// Dependent tags that reference the overridden tag via their formula will
// continue to update normally (using the stored override value as input).
func (d *Driver) Write(_ context.Context, path string, val any) error {
	f := toFloat(val)
	d.mu.Lock()
	// Check the tag exists.
	found := false
	for _, s := range d.specs {
		if s.Path == path {
			found = true
			break
		}
	}
	if !found {
		d.mu.Unlock()
		return fmt.Errorf("virtual: tag %q not found", path)
	}
	d.overrides[path] = f
	d.mu.Unlock()

	// Immediately push the new value without waiting for the next tick.
	d.send(tagstore.TagUpdate{
		Path:  path,
		State: tagstore.TagState{Value: f, Quality: "Good", TS: time.Now().UnixNano()},
	})
	return nil
}

// send delivers u to the output channel, waiting if the runtime is busy.
// It gives up when the driver is disconnected and does nothing before
// Connect or without an output channel.
func (d *Driver) send(u tagstore.TagUpdate) {
	d.mu.RLock()
	ch, stop := d.outCh, d.stopCh
	d.mu.RUnlock()
	if ch == nil || stop == nil {
		return
	}
	select {
	case ch <- u:
	case <-stop:
	}
}

func (d *Driver) Status() drivers.DriverStatus {
	last := ""
	if p := d.lastErr.Load(); p != nil {
		last = *p
	}
	return drivers.DriverStatus{
		Connected: d.connected.Load(),
		LastError: last,
		TagCount:  int(d.tagCount.Load()),
	}
}

// toFloat reads an input as a number; text and missing values count as 0.
func toFloat(v any) float64 {
	f, _ := tagstore.Number(v)
	return f
}

func init() {
	drivers.Register("virtual", func(ctx drivers.BuildCtx) drivers.ProtocolDriver { return New(ctx.Store) })
}
