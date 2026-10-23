// Package virtual implements a computed-tag datasource.
//
// Each virtual tag has a path (name) and a formula string.
// Formula syntax:
//
//	{dsId:tagPath}           → current live value of a tag from another datasource
//	Arithmetic operators     → +  -  *  /  %
//	Math functions           → abs(), floor(), ceil(), round(), sqrt(), min(), max(), clamp(), pow()
//	Parentheses and literals → (expr), 3.14
//
// Example formula: "{opcua:Temp} * 9/5 + 32"
// Example formula: "clamp({mb:AI0} / 4095 * 100, 0, 100)"
//
// Configuration (in the project datasource config):
//
//	cfg.Extra["tags"] = JSON array of {path,formula} objects
//
// Connect() parses the tag list, then subscribes to all referenced upstream
// tags via the tagstore. When any upstream tag changes the affected formulae
// are re-evaluated and pushed to the output channel.
package virtual

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

const driverID = "virtual"

// TagSpec describes one computed tag.
type TagSpec struct {
	Path    string `json:"path"`
	Formula string `json:"formula"`
}

// Driver implements drivers.ProtocolDriver.
type Driver struct {
	mu        sync.RWMutex
	specs     []TagSpec
	vals      map[string]float64 // current upstream tag values keyed by "ds:path"
	overrides map[string]float64 // manually written values that suppress formula evaluation
	store     *tagstore.TagStore // upstream tagstore for live reads
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

// Connect parses the tag list and subscribes to upstream tag changes.
//
// cfg.Extra["tags"] must be a JSON-encoded []TagSpec:
//
//	[{"path":"tempF","formula":"{opcua:Temp}*9/5+32"},...]
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	tagsJSON := cfg.Extra["tags"]
	if tagsJSON == "" {
		return fmt.Errorf("virtual: cfg.Extra['tags'] is required")
	}

	var specs []TagSpec
	if err := json.Unmarshal([]byte(tagsJSON), &specs); err != nil {
		return fmt.Errorf("virtual: invalid tags JSON: %w", err)
	}
	if len(specs) == 0 {
		return fmt.Errorf("virtual: at least one tag spec is required")
	}

	d.mu.Lock()
	d.specs = specs
	d.vals = make(map[string]float64)
	d.overrides = make(map[string]float64)
	d.stopCh = make(chan struct{})
	d.outCh = out
	d.mu.Unlock()

	d.tagCount.Store(int32(len(specs)))
	d.connected.Store(true)
	log.Printf("[DRIVER] virtual: connected with %d computed tags", len(specs))
	if out != nil {
		d.evaluateAll(specs, out) // push initial values
	}
	d.startLoop(specs)
	return nil
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
			Description: s.Formula,
			Writable:    true, // overrides are supported via Write()
		}
	}
	return out, nil
}

// SetTags does nothing: a virtual driver always computes every configured
// tag. It exists so the driver satisfies the same contract as the others.
func (d *Driver) SetTags(_ []string) error { return nil }

func (d *Driver) output() chan<- tagstore.TagUpdate {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.outCh
}

// startLoop starts the driver's only evaluation goroutine. It polls the
// referenced upstream tags (the tagstore has no external pub/sub) and
// re-evaluates every formula when one of them changes.
func (d *Driver) startLoop(specs []TagSpec) {
	// refMap: upstream key → list of spec indices that use it.
	refMap := map[string][]int{}
	for i, s := range specs {
		for _, ref := range ParseRefs(s.Formula) {
			refMap[ref.Key] = append(refMap[ref.Key], i)
		}
	}
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
				if ch := d.output(); ch != nil {
					d.evaluateAll(specs, ch)
				}
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
			newVal := toFloat(state.Value)
			if d.vals[key] != newVal {
				d.vals[key] = newVal
				changed = true
			}
		}
	}
	return changed
}

// evaluateAll computes all formulas and pushes their results to ch.
// If a tag has been written via Write(), the override value is used instead
// of the formula result — this lets Setpoint widgets and recipes actually
// change virtual tag values during a demo.
func (d *Driver) evaluateAll(specs []TagSpec, ch chan<- tagstore.TagUpdate) {
	d.mu.RLock()
	vals := make(map[string]float64, len(d.vals))
	for k, v := range d.vals {
		vals[k] = v
	}
	overrides := make(map[string]float64, len(d.overrides))
	for k, v := range d.overrides {
		overrides[k] = v
	}
	d.mu.RUnlock()

	now := time.Now().UnixNano()
	for _, s := range specs {
		var result float64
		quality := "Good"

		if ov, ok := overrides[s.Path]; ok {
			// Manual write takes precedence over the formula.
			result = ov
		} else {
			var err error
			result, err = Eval(s.Formula, vals)
			if err != nil || math.IsNaN(result) || math.IsInf(result, 0) {
				quality = "Bad"
				result = 0
				if err != nil {
					errStr := err.Error()
					d.lastErr.Store(&errStr)
				}
			}
		}
		select {
		case ch <- tagstore.TagUpdate{
			Path:  s.Path,
			State: tagstore.TagState{Value: result, Quality: quality, TS: now},
		}:
		default:
		}
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
	if d.outCh != nil {
		select {
		case d.outCh <- tagstore.TagUpdate{
			Path:  path,
			State: tagstore.TagState{Value: f, Quality: "Good", TS: time.Now().UnixNano()},
		}:
		default:
		}
	}
	return nil
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

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	default:
		return 0
	}
}

func init() {
	drivers.Register("virtual", func(ctx drivers.BuildCtx) drivers.ProtocolDriver { return New(ctx.Store) })
}
