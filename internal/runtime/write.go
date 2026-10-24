package runtime

import (
	"context"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
)

// Write results.
const (
	WriteConfirmed    = "confirmed"     // the device holds the written value
	WriteNotConfirmed = "not_confirmed" // the device accepted it but holds something else
	WriteSent         = "sent"          // handed over; the device gives no read-back (MQTT)
	WriteFailed       = "failed"
)

// WriteRequest is one write, from the HTTP API, a WebSocket or a recipe.
// The caller checks the user's role.
type WriteRequest struct {
	Binding  string // "ds:path" or "ns:path"
	Value    any
	WidgetID string // optional: the widget writing; its min/max apply
	Recipe   bool   // a recipe write: the recipe itself names the tag
}

// WriteResult says what happened. Code is the HTTP status to answer with.
type WriteResult struct {
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
	Value  any    `json:"value,omitempty"` // what the device holds, when not confirmed
	Code   int    `json:"-"`
}

func writeFailed(code int, format string, args ...any) WriteResult {
	return WriteResult{Status: WriteFailed, Reason: fmt.Sprintf(format, args...), Code: code}
}

// writeSeq numbers writes; each one is its own demand source while it waits.
var writeSeq atomic.Uint64

// WriteTag runs the write pipeline: the tag must be writable in the project,
// the value inside the writing widget's limits; then the driver writes it
// and the pipeline waits up to writeConfirm for the value to come back.
func (r *Runtime) WriteTag(ctx context.Context, req WriteRequest) WriteResult {
	dsID, path, ok := r.resolveBinding(req.Binding)
	if !ok {
		return writeFailed(404, "%s does not name a tag", req.Binding)
	}
	key := dsID + ":" + path

	r.mu.RLock()
	p := r.project
	r.mu.RUnlock()
	writers, nsTag := writableBy(p, key, r.resolveBinding)
	if len(writers) == 0 && !nsTag && !req.Recipe && !inRecipe(p, key, r.resolveBinding) {
		return writeFailed(404, "%s is not writable in this project", req.Binding)
	}
	if err := limitsFor(writers, req.WidgetID).check(req.Value); err != nil {
		return writeFailed(400, "%v", err)
	}

	drv := r.Driver(dsID)
	if drv == nil {
		return writeFailed(404, "datasource %s not found", dsID)
	}

	// MQTT gives no read-back unless the topic is subscribed anyway.
	waitForEcho := true
	if dsType(p, dsID) == project.Mqtt {
		waitForEcho = r.demanded(req.Binding)
	} else {
		src := fmt.Sprintf("write:%d", writeSeq.Add(1))
		r.AddDemand(src, req.Binding)
		defer r.ReleaseDemand(src)
	}
	w := r.Store.Watch()
	defer w.Close()
	w.Add(key)
	select { // drop the value from before the write
	case <-w.C():
		w.Drain()
	default:
	}

	if err := drv.Write(ctx, path, req.Value); err != nil {
		return writeError(err)
	}
	if !waitForEcho {
		return WriteResult{Status: WriteSent, Code: 200}
	}

	timer := time.NewTimer(r.writeConfirm)
	defer timer.Stop()
	var last *WriteResult
	for {
		select {
		case <-w.C():
			for _, u := range w.Drain() {
				if u.State.Quality == "Good" && valuesEqual(req.Value, u.State.Value) {
					return WriteResult{Status: WriteConfirmed, Code: 200}
				}
				reason := fmt.Sprintf("the device holds %v", u.State.Value)
				if u.State.Quality != "Good" {
					reason = fmt.Sprintf("the tag is %s: %s", u.State.Quality, u.State.Reason)
				}
				last = &WriteResult{Status: WriteNotConfirmed, Reason: reason, Value: u.State.Value, Code: 409}
			}
		case <-timer.C:
			if last != nil {
				return *last
			}
			return WriteResult{Status: WriteNotConfirmed, Code: 409,
				Reason: fmt.Sprintf("no new value from the device within %v", r.writeConfirm)}
		case <-ctx.Done():
			return writeFailed(503, "cancelled while waiting for the device: %v", ctx.Err())
		}
	}
}

// writeError turns a driver error into a result by its kind.
func writeError(err error) WriteResult {
	switch {
	case errors.Is(err, drivers.ErrBadValue):
		return writeFailed(400, "%v", err)
	case errors.Is(err, drivers.ErrUnknownTag):
		return writeFailed(404, "%v", err)
	case errors.Is(err, drivers.ErrNotConnected):
		return writeFailed(503, "%v", err)
	}
	return writeFailed(502, "%v", err)
}

// writer is a widget that writes a tag, with its limits.
type writer struct {
	widgetID string
	min, max *float64
}

// writableTypes write their bound tag.
var writableTypes = map[project.WidgetType]bool{
	project.Button:       true,
	project.NumericInput: true,
	project.TextInput:    true,
	project.Setpoint:     true,
}

// writableBy returns the widgets that write key (a resolved "ds:path"),
// directly or through a faceplate parameter, and whether key is a
// namespace tag.
func writableBy(p *project.Project, key string, resolve func(string) (string, string, bool)) (ws []writer, nsTag bool) {
	if p == nil {
		return nil, false
	}
	is := func(b string) bool {
		ds, path, ok := resolve(b)
		return ok && ds+":"+path == key
	}
	add := func(id string, cfg *project.WidgetConfig) {
		w := writer{widgetID: id}
		if cfg != nil {
			w.min, w.max = cfg.Min, cfg.Max
		}
		ws = append(ws, w)
	}
	// writeTargets lists the bindings a widget writes.
	writeTargets := func(typ project.WidgetType, binding *string, dyns []project.DynamicElement) []string {
		var out []string
		if binding != nil && writableTypes[typ] {
			out = append(out, *binding)
		}
		for _, d := range dyns {
			if d.WriteTo != nil {
				out = append(out, *d.WriteTo)
			}
		}
		return out
	}

	// Faceplate parameters written by a widget inside the faceplate.
	writtenParams := map[string]map[string]*project.WidgetConfig{} // faceplate id → param → config
	for _, fp := range p.Faceplates {
		for _, w := range fp.Widgets {
			for _, b := range writeTargets(w.Type, w.Binding, w.Dynamics) {
				if param, ok := strings.CutPrefix(b, "{"); ok && strings.HasSuffix(param, "}") {
					if writtenParams[fp.ID] == nil {
						writtenParams[fp.ID] = map[string]*project.WidgetConfig{}
					}
					writtenParams[fp.ID][strings.TrimSuffix(param, "}")] = w.Config
				}
			}
		}
	}

	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			for _, b := range writeTargets(w.Type, w.Binding, w.Dynamics) {
				if is(b) {
					add(w.ID, w.Config)
				}
			}
			if w.Type == project.Faceplate && w.Config != nil && w.Config.FaceplateID != nil {
				for param, cfg := range writtenParams[*w.Config.FaceplateID] {
					if b, ok := w.Config.Params[param]; ok && is(b) {
						add(w.ID, cfg)
					}
				}
			}
		}
	}
	for _, n := range p.Namespace {
		if n.Type == project.Tag && n.DriverID != nil && n.DriverAddr != nil && *n.DriverID+":"+*n.DriverAddr == key {
			nsTag = true
		}
	}
	return ws, nsTag
}

// inRecipe reports whether a project recipe names key.
func inRecipe(p *project.Project, key string, resolve func(string) (string, string, bool)) bool {
	if p == nil {
		return false
	}
	for _, rc := range p.Recipes {
		for _, e := range rc.Entries {
			if ds, path, ok := resolve(e.Binding); ok && ds+":"+path == key {
				return true
			}
		}
	}
	return false
}

// limits bounds a numeric write; nil means no bound.
type limits struct{ min, max *float64 }

// limitsFor gives the named widget's limits, or the widest limits of all
// writers when no widget is named or the name is not one of them (widgets
// inside a faceplate carry their own ids): a side is bounded only if every
// writer bounds it.
func limitsFor(ws []writer, widgetID string) limits {
	for _, w := range ws {
		if widgetID != "" && w.widgetID == widgetID {
			return limits{w.min, w.max}
		}
	}
	if len(ws) == 0 {
		return limits{}
	}
	l := limits{ws[0].min, ws[0].max}
	for _, w := range ws[1:] {
		if l.min == nil || w.min == nil {
			l.min = nil
		} else if *w.min < *l.min {
			l.min = w.min
		}
		if l.max == nil || w.max == nil {
			l.max = nil
		} else if *w.max > *l.max {
			l.max = w.max
		}
	}
	return l
}

func (l limits) check(v any) error {
	if l.min == nil && l.max == nil {
		return nil
	}
	f, ok := number(v)
	if !ok {
		return fmt.Errorf("%v is not a number", v)
	}
	if l.min != nil && f < *l.min {
		return fmt.Errorf("%v is below the minimum %v", v, *l.min)
	}
	if l.max != nil && f > *l.max {
		return fmt.Errorf("%v is above the maximum %v", v, *l.max)
	}
	return nil
}

// number reads v as a float64: numbers and numeric strings.
func number(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8:
		return float64(x), true
	case int16:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint8:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint64:
		return float64(x), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil
	}
	return 0, false
}

// valuesEqual compares a written value with what the device reports.
// Numbers compare with a small tolerance, since a PLC REAL holds a float32.
func valuesEqual(written, got any) bool {
	if wb, ok := written.(bool); ok {
		if gb, ok := got.(bool); ok {
			return wb == gb
		}
	}
	if ws, ok := written.(string); ok {
		if gs, ok := got.(string); ok {
			return ws == gs
		}
	}
	a, okA := number(written)
	b, okB := number(got)
	if okA && okB {
		return math.Abs(a-b) <= 1e-6*math.Max(1, math.Abs(a))
	}
	return reflect.DeepEqual(written, got)
}

// dsType returns a datasource's type.
func dsType(p *project.Project, id string) project.DatasourceType {
	if p == nil {
		return ""
	}
	for _, ds := range p.Datasources {
		if ds.ID == id {
			return ds.Type
		}
	}
	return ""
}

// demanded reports whether some source already needs binding.
func (r *Runtime) demanded(binding string) bool {
	for _, d := range r.Demand() {
		if d.Binding == binding {
			return true
		}
	}
	return false
}
