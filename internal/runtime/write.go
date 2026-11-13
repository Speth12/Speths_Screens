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
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Write results.
const (
	WriteConfirmed    = "confirmed"     // the device holds the written value
	WriteNotConfirmed = "not_confirmed" // the device accepted it but holds something else
	WriteSent         = "sent"          // handed over; the device gives no read-back (MQTT)
	WriteFailed       = "failed"
)

// WriteRequest is one write, from the HTTP API, a WebSocket, a recipe or a
// runtime script. The caller checks the user's role. Callers build it in
// code; nothing decodes a client's JSON into it, so a client cannot set the
// Recipe or Script flags.
type WriteRequest struct {
	Binding  string // "ds:path" or "ns:path"
	Value    any
	WidgetID string // optional: the widget writing; its min/max apply
	Recipe   bool   // a recipe write: the recipe itself names the tag
	Script   bool   // a runtime script's write, which its writes list has already allowed: no writable widget is needed
	// Role is the writing user's role. A tag written by widgets that ask for a role (their page's,
	// custom widget's or own access) may be written only by a role one of them allows; an empty
	// role counts as the lowest, operator. Recipe and script writes have their own checks.
	Role project.Role
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
	if len(writers) == 0 && !nsTag && !req.Recipe && !req.Script && !inRecipe(p, key, r.resolveBinding) {
		return writeFailed(404, "%s is not writable in this project", req.Binding)
	}
	if res, refused := accessCheck(writers, req); refused {
		return res
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

// writer is a widget that writes a tag, with its limits and the lowest role rank that may operate it.
type writer struct {
	widgetID string
	min, max *float64
	need     int
}

// accessCheck refuses a write the user's role may not make. When the request names a widget that
// writes the tag, that widget decides; otherwise one widget that writes the tag must allow the role,
// so a role cannot get past a protected widget by naming none or another. A tag no widget asks a role
// for (or written only as a namespace tag or by a recipe) is left to the role's own permissions.
func accessCheck(writers []writer, req WriteRequest) (WriteResult, bool) {
	if req.Recipe || req.Script || len(writers) == 0 {
		return WriteResult{}, false
	}
	rank := project.RoleRank(req.Role)
	if rank == 0 {
		rank = project.RoleRank(project.Operator)
	}
	if req.WidgetID != "" {
		for _, w := range writers {
			if w.widgetID == req.WidgetID {
				if rank < w.need {
					return writeFailed(403, "widget %s may be operated by %s and above", w.widgetID, project.RoleOfRank(w.need)), true
				}
				return WriteResult{}, false
			}
		}
	}
	lowest := writers[0].need
	for _, w := range writers[1:] {
		lowest = min(lowest, w.need)
	}
	if rank < lowest {
		return writeFailed(403, "%s may be written by %s and above", req.Binding, project.RoleOfRank(lowest)), true
	}
	return WriteResult{}, false
}

// writableBy returns the widgets that write key (a resolved "ds:path"),
// directly or through a custom widget parameter, and whether key is a
// namespace tag. A widget writes its value tag when it is an input (numeric
// input, text input, setpoint), and the tags its actions write.
func writableBy(p *project.Project, key string, resolve func(string) (string, string, bool)) (ws []writer, nsTag bool) {
	if p == nil {
		return nil, false
	}
	is := func(b string) bool {
		ds, path, ok := resolve(b)
		return ok && ds+":"+path == key
	}
	add := func(v project.WidgetView, need int) {
		w := writer{widgetID: v.ID, need: need}
		w.min, w.max = v.Limits()
		ws = append(ws, w)
	}

	// What the widgets inside each custom widget write: a parameter ({name}), filled in where the
	// custom widget is placed, or a tag of its own.
	type inner struct {
		view   project.WidgetView
		access *project.Access
	}
	writtenParams := map[string]map[string]inner{} // custom widget id → param → inner widget
	writtenTags := map[string][]inner{}             // custom widget id → inner widgets writing a tag of their own
	for _, fp := range p.CustomWidgets {
		for _, fw := range fp.Widgets {
			v := fw.View()
			for _, b := range v.WriteTargets() {
				if param, ok := strings.CutPrefix(b, "{"); ok && strings.HasSuffix(param, "}") {
					if writtenParams[fp.ID] == nil {
						writtenParams[fp.ID] = map[string]inner{}
					}
					writtenParams[fp.ID][strings.TrimSuffix(param, "}")] = inner{v, fw.Access}
				} else if is(b) {
					writtenTags[fp.ID] = append(writtenTags[fp.ID], inner{v, fw.Access})
				}
			}
		}
	}
	// A custom widget placed somewhere (id) writes what its parts write, with the parts' limits.
	placed := func(id, cwID string, params map[string]string, outer ...*project.Access) {
		for param, in := range writtenParams[cwID] {
			if b, ok := params[param]; ok && is(b) {
				v := in.view
				v.ID = id // the instance writes, with the inner widget's limits
				add(v, project.Need(append(outer, in.access)...))
			}
		}
		for _, in := range writtenTags[cwID] {
			v := in.view
			v.ID = id
			add(v, project.Need(append(outer, in.access)...))
		}
	}

	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			v := w.View()
			for _, b := range v.WriteTargets() {
				if is(b) {
					add(v, project.Need(pg.Access, w.Access))
				}
			}
			if w.Type == project.CustomWidget && w.Props != nil && w.Props.CustomWidgetID != nil {
				placed(w.ID, *w.Props.CustomWidgetID, w.Props.Params, pg.Access, w.Access)
			}
		}
	}
	// Custom widgets pinned to the screen edges (a header's buttons) write too.
	if p.Shell != nil {
		for _, slot := range p.Shell.Frame {
			placed(slot.ID, slot.CustomWidgetID, slot.Params)
		}
	}

	// A popup is a custom widget too: what it writes is written by the widget that opens it, with
	// that widget's access. A part that opens one passes on what its own placement was given.
	byID := map[string]*project.CustomWidgetElement{}
	for i := range p.CustomWidgets {
		byID[p.CustomWidgets[i].ID] = &p.CustomWidgets[i]
	}
	opens := func(id string, e *project.WidgetEvents, given map[string]string, outer ...*project.Access) {
		if e == nil {
			return
		}
		for _, list := range [][]project.Action{e.OnClick, e.OnPress, e.OnRelease} {
			for _, a := range list {
				if a.Type != project.OpenPopup || a.CustomWidgetID == nil {
					continue
				}
				params := map[string]string{}
				for name, v := range a.Params {
					params[name] = fillParams(v, given)
				}
				placed(id, *a.CustomWidgetID, params, outer...)
			}
		}
	}
	partsOpen := func(id, cwID string, given map[string]string, outer ...*project.Access) {
		cw := byID[cwID]
		if cw == nil {
			return
		}
		for _, part := range cw.Widgets {
			opens(id, part.Events, given, append(outer, part.Access)...)
		}
	}
	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			opens(w.ID, w.Events, nil, pg.Access, w.Access)
			if w.Type == project.CustomWidget && w.Props != nil && w.Props.CustomWidgetID != nil {
				partsOpen(w.ID, *w.Props.CustomWidgetID, w.Props.Params, pg.Access, w.Access)
			}
		}
	}
	if p.Shell != nil {
		for _, slot := range p.Shell.Frame {
			partsOpen(slot.ID, slot.CustomWidgetID, slot.Params)
		}
	}
	for _, n := range p.Namespace {
		if n.Type == project.Tag && n.DriverID != nil && n.DriverAddr != nil && *n.DriverID+":"+*n.DriverAddr == key {
			nsTag = true
		}
	}
	return ws, nsTag
}

// fillParams turns "{name}" into what a custom widget's placement gave for name; anything else is
// returned as it is.
func fillParams(v string, given map[string]string) string {
	if name, ok := strings.CutPrefix(v, "{"); ok && strings.HasSuffix(name, "}") {
		if got, ok := given[strings.TrimSuffix(name, "}")]; ok {
			return got
		}
	}
	return v
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
// inside a custom widget carry their own ids): a side is bounded only if every
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

// number reads v as a float64: numbers and numeric strings (not bools,
// which a limit should not accept as 0 or 1).
func number(v any) (float64, bool) {
	switch x := v.(type) {
	case bool:
		return 0, false
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil
	}
	return tagstore.Number(v)
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
