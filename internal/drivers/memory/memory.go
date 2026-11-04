// Package memory implements the memory datasource (Phase 4): typed values the
// runtime holds itself, for scripts and screens to share. A write of the
// wrong type is refused with a reason, as a PLC refuses one. Retained tags
// keep their value across a restart: each is saved on change, at most once a
// second, so a busy counter does not wear out a controller's flash.
//
// Configuration (from the project's datasource config):
//
//	cfg.Extra["memoryTags"]   = JSON array of {path, type, initial, retain}
//	cfg.Extra["datasourceId"] = the datasource id, the key for retained values
package memory

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

// SaveInterval is how often retained values are saved at most, per tag.
// Tests lower it.
var SaveInterval = time.Second

// Spec is one memory tag, as the project's MemoryTag.
type Spec struct {
	Path    string `json:"path"`
	Type    string `json:"type"` // bool, int, real, string
	Initial any    `json:"initial,omitempty"`
	Retain  bool   `json:"retain,omitempty"`
}

// Driver implements drivers.ProtocolDriver.
type Driver struct {
	retain drivers.Retainer

	mu      sync.Mutex
	ds      string
	specs   map[string]Spec
	order   []string
	values  map[string]any
	pending map[string]any // retained values changed since the last save
	out     chan<- tagstore.TagUpdate
	stop    chan struct{}
	wg      sync.WaitGroup

	connected atomic.Bool
	lastErr   atomic.Pointer[string]
}

// New creates a memory driver; retain may be nil (nothing is kept).
func New(retain drivers.Retainer) *Driver { return &Driver{retain: retain} }

func (d *Driver) ID() string { return "memory" }

// Connect sets every tag to its retained value, if it keeps one of the right
// type, else to its initial value, and sends them all.
func (d *Driver) Connect(_ context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	var list []Spec
	if raw := cfg.Extra["memoryTags"]; raw != "" {
		if err := json.Unmarshal([]byte(raw), &list); err != nil {
			return fmt.Errorf("memory: invalid memoryTags JSON: %w", err)
		}
	}
	ds := cfg.Extra["datasourceId"]
	var stored map[string]any
	if d.retain != nil {
		var err error
		if stored, err = d.retain.Load(ds); err != nil {
			msg := fmt.Sprintf("retained values not read: %v", err)
			d.lastErr.Store(&msg)
			log.Printf("[DRIVER] memory %s: %s", ds, msg)
		}
	}
	d.mu.Lock()
	d.ds, d.out, d.stop = ds, out, make(chan struct{})
	d.specs, d.values, d.pending, d.order = map[string]Spec{}, map[string]any{}, map[string]any{}, nil
	for _, s := range list {
		d.specs[s.Path] = s
		d.order = append(d.order, s.Path)
		v, err := convert(s.Type, s.Initial)
		if s.Initial == nil || err != nil {
			v = zero(s.Type)
		}
		if old, ok := stored[s.Path]; ok && s.Retain {
			if kept, err := convert(s.Type, old); err == nil {
				v = kept
			}
		}
		d.values[s.Path] = v
	}
	d.mu.Unlock()
	d.connected.Store(true)
	log.Printf("[DRIVER] memory %s: %d tags", ds, len(list))
	now := time.Now().UnixNano()
	for _, p := range d.order {
		d.send(tagstore.TagUpdate{Path: p, State: tagstore.TagState{Value: d.value(p), Quality: "Good", TS: now}})
	}
	if d.retain != nil {
		d.mu.Lock()
		stop := d.stop
		d.mu.Unlock()
		d.wg.Add(1)
		go d.saveLoop(stop)
	}
	return nil
}

// saveLoop saves the retained values that changed, every SaveInterval,
// until stop closes (Disconnect clears d.stop before closing it).
func (d *Driver) saveLoop(stop <-chan struct{}) {
	defer d.wg.Done()
	tick := time.NewTicker(SaveInterval)
	defer tick.Stop()
	for {
		select {
		case <-stop:
			d.flush()
			return
		case <-tick.C:
			d.flush()
		}
	}
}

func (d *Driver) flush() {
	d.mu.Lock()
	pending, ds := d.pending, d.ds
	d.pending = map[string]any{}
	d.mu.Unlock()
	if err := d.retain.Save(ds, pending); err != nil {
		msg := fmt.Sprintf("retained values not saved: %v", err)
		d.lastErr.Store(&msg)
		log.Printf("[DRIVER] memory %s: %s", ds, msg)
		d.mu.Lock() // keep them for the next try, unless newer values came in
		for p, v := range pending {
			if _, newer := d.pending[p]; !newer {
				d.pending[p] = v
			}
		}
		d.mu.Unlock()
	}
}

// Disconnect saves what is pending and stops.
func (d *Driver) Disconnect() error {
	d.mu.Lock()
	stop := d.stop
	d.stop = nil
	d.mu.Unlock()
	if stop != nil {
		close(stop)
	}
	d.wg.Wait()
	d.connected.Store(false)
	return nil
}

// Browse lists the tags with their types.
func (d *Driver) Browse(context.Context) ([]drivers.TagDefinition, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := make([]drivers.TagDefinition, 0, len(d.order))
	for _, p := range d.order {
		s := d.specs[p]
		out = append(out, drivers.TagDefinition{Path: p, DataType: s.Type, Writable: true})
	}
	return out, nil
}

// SetTags does nothing: every memory tag is always held.
func (d *Driver) SetTags([]string) error { return nil }

// Write sets a tag after checking its type, and sends the new value.
func (d *Driver) Write(_ context.Context, path string, value any) error {
	d.mu.Lock()
	s, ok := d.specs[path]
	if !ok {
		d.mu.Unlock()
		return drivers.Mark(fmt.Errorf("memory: no tag %q", path), drivers.ErrUnknownTag)
	}
	v, err := convert(s.Type, value)
	if err != nil {
		d.mu.Unlock()
		return drivers.Mark(fmt.Errorf("memory tag %s %v", path, err), drivers.ErrBadValue)
	}
	d.values[path] = v
	if s.Retain {
		d.pending[path] = v
	}
	d.mu.Unlock()
	d.send(tagstore.TagUpdate{Path: path, State: tagstore.TagState{Value: v, Quality: "Good", TS: time.Now().UnixNano()}})
	return nil
}

func (d *Driver) Status() drivers.DriverStatus {
	st := drivers.DriverStatus{Connected: d.connected.Load()}
	d.mu.Lock()
	st.TagCount = len(d.order)
	d.mu.Unlock()
	if p := d.lastErr.Load(); p != nil {
		st.LastError = *p
	}
	return st
}

func (d *Driver) value(path string) any {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.values[path]
}

// send delivers u, waiting if the runtime is busy; it gives up when the
// driver is disconnected.
func (d *Driver) send(u tagstore.TagUpdate) {
	d.mu.Lock()
	out, stop := d.out, d.stop
	d.mu.Unlock()
	if out == nil || stop == nil {
		return
	}
	select {
	case out <- u:
	case <-stop:
	}
}

func zero(t string) any {
	switch t {
	case "bool":
		return false
	case "string":
		return ""
	case "int":
		return int64(0)
	}
	return 0.0
}

// convert reads v as type t: bool from a flag (or 0 and 1), int from a whole
// number, real from any number, string from text. Anything else is refused,
// with the reason as the error.
func convert(t string, v any) (any, error) {
	f, isNum := tagstore.Number(v)
	if _, isBool := v.(bool); isBool {
		isNum = false // tagstore.Number reads a flag as 0 or 1; a number tag must not
	}
	switch t {
	case "bool":
		if b, ok := v.(bool); ok {
			return b, nil
		}
		if isNum && (f == 0 || f == 1) {
			return f == 1, nil
		}
		return nil, fmt.Errorf("is a bool, not %s", describe(v))
	case "int":
		if isNum && f == math.Trunc(f) && math.Abs(f) <= 1<<53 {
			return int64(f), nil
		}
		return nil, fmt.Errorf("is an int, not %s", describe(v))
	case "real":
		if isNum && !math.IsNaN(f) && !math.IsInf(f, 0) {
			return f, nil
		}
		return nil, fmt.Errorf("is a real, not %s", describe(v))
	case "string":
		if s, ok := v.(string); ok {
			return s, nil
		}
		return nil, fmt.Errorf("is a string, not %s", describe(v))
	}
	return nil, fmt.Errorf("has an unknown type %q", t)
}

func describe(v any) string {
	switch x := v.(type) {
	case nil:
		return "nothing"
	case string:
		return fmt.Sprintf("the text %q", x)
	case bool:
		return fmt.Sprintf("the flag %v", x)
	}
	if f, ok := tagstore.Number(v); ok {
		return fmt.Sprintf("%v", f)
	}
	return fmt.Sprintf("a %T", v)
}

func init() {
	drivers.Register("memory", func(ctx drivers.BuildCtx) drivers.ProtocolDriver { return New(ctx.Retain) })
}
