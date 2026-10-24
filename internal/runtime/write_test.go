package runtime

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// plcDriver is a fake controller: it reports the tags it is asked to poll
// every few milliseconds, stores writes, and can act like a PLC program
// that forces a value (hold), refuse writes (writeErr) or never report.
type plcDriver struct {
	mu       sync.Mutex
	vals     map[string]any
	hold     map[string]any
	tags     []string
	writeErr error
	silent   bool
	out      chan<- tagstore.TagUpdate
	stop     chan struct{}
}

func newPLC() *plcDriver {
	return &plcDriver{vals: map[string]any{}, hold: map[string]any{}, stop: make(chan struct{})}
}

func (p *plcDriver) ID() string { return "plc" }
func (p *plcDriver) Connect(_ context.Context, _ drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	p.out = out
	go func() {
		t := time.NewTicker(5 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-p.stop:
				return
			case <-t.C:
				p.mu.Lock()
				tags, silent := append([]string(nil), p.tags...), p.silent
				var ups []tagstore.TagUpdate
				for _, tag := range tags {
					v, ok := p.hold[tag]
					if !ok {
						v = p.vals[tag]
					}
					ups = append(ups, tagstore.TagUpdate{Path: tag, State: tagstore.TagState{Value: v, Quality: "Good"}})
				}
				p.mu.Unlock()
				if silent {
					continue
				}
				for _, u := range ups {
					select {
					case out <- u:
					case <-p.stop:
						return
					}
				}
			}
		}
	}()
	return nil
}
func (p *plcDriver) Disconnect() error {
	select {
	case <-p.stop:
	default:
		close(p.stop)
	}
	return nil
}
func (p *plcDriver) Browse(context.Context) ([]drivers.TagDefinition, error) { return nil, nil }
func (p *plcDriver) SetTags(paths []string) error {
	p.mu.Lock()
	p.tags = drivers.NormalizePaths(paths)
	p.mu.Unlock()
	return nil
}
func (p *plcDriver) Write(_ context.Context, path string, v any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.writeErr != nil {
		return p.writeErr
	}
	p.vals[path] = v
	return nil
}
func (p *plcDriver) Status() drivers.DriverStatus { return drivers.DriverStatus{Connected: true} }

func f64(v float64) *float64 { return &v }
func str(s string) *string   { return &s }

// writeProject has one datasource "plc" and these writers:
//
//	SP     numeric input 0..100 (widget sp) and setpoint 0..10 (widget small)
//	FREE   text input, no limits
//	SHOWN  only a numeric display: not writable
//	NS1    a namespace tag
//	DYN    written by a dynamic's writeTo
//	FP_SP  faceplate parameter written by a 0..10 numeric input
//	RCP    named by a recipe only
func writeProject() *project.Project {
	fpType := project.Faceplate
	return &project.Project{
		Version:     "0.1.0",
		Datasources: []project.Datasource{{ID: "plc", Label: "plc", Type: project.REST}, {ID: "broker", Label: "broker", Type: project.Mqtt}},
		Pages: []project.Page{{ID: "p1", Name: "Main", Widgets: []project.Widget{
			{ID: "sp", Type: project.NumericInput, W: 1, H: 1, Binding: str("plc:SP"), Config: &project.WidgetConfig{Min: f64(0), Max: f64(100)}},
			{ID: "small", Type: project.Setpoint, W: 1, H: 1, Binding: str("plc:SP"), Config: &project.WidgetConfig{Min: f64(0), Max: f64(10)}},
			{ID: "free", Type: project.TextInput, W: 1, H: 1, Binding: str("plc:FREE")},
			{ID: "shown", Type: project.NumericDisplay, W: 1, H: 1, Binding: str("plc:SHOWN")},
			{ID: "sym", Type: project.Symbol, W: 1, H: 1, Dynamics: []project.DynamicElement{{ID: "d1", Kind: "action", WriteTo: str("plc:DYN")}}},
			{ID: "fp", Type: fpType, W: 1, H: 1, Config: &project.WidgetConfig{FaceplateID: str("fp1"), Params: map[string]string{"sp": "plc:FP_SP"}}},
			{ID: "mq", Type: project.Button, W: 1, H: 1, Binding: str("broker:cmd/start")},
		}}},
		Faceplates: []project.FaceplateElement{{ID: "fp1", Name: "Pump", Widgets: []project.FaceplateWidget{
			{LocalID: "in", Type: project.NumericInput, W: 1, H: 1, Binding: str("{sp}"), Config: &project.WidgetConfig{Min: f64(0), Max: f64(10)}},
		}}},
		Namespace: []project.NamespaceNode{{Path: "plant.ns1", Type: project.Tag, DriverID: str("plc"), DriverAddr: str("NS1")}},
		Recipes:   []project.Recipe{{ID: "r1", Name: "R1", Entries: []project.RecipeEntry{{Binding: "plc:RCP", Value: 1.0}}}},
	}
}

func startWriteRuntime(t *testing.T) (*Runtime, *plcDriver) {
	t.Helper()
	plc := newPLC()
	r := New(nil, nil)
	r.writeConfirm = 300 * time.Millisecond
	r.newDriver = func(typ project.DatasourceType) (drivers.ProtocolDriver, error) {
		if typ == project.Mqtt {
			return &fakeDriver{}, nil
		}
		return plc, nil
	}
	r.Start(context.Background())
	t.Cleanup(r.Stop)
	load(t, r, writeProject())
	return r, plc
}

func TestWriteTag(t *testing.T) {
	tests := []struct {
		name       string
		req        WriteRequest
		setup      func(*plcDriver)
		wantStatus string
		wantCode   int
		wantReason string // substring
	}{
		{"confirmed", WriteRequest{Binding: "plc:SP", Value: 50.0}, nil, WriteConfirmed, 200, ""},
		{"float the PLC stores as REAL", WriteRequest{Binding: "plc:SP", Value: 1.23}, func(p *plcDriver) { p.hold["SP"] = float64(float32(1.23)) }, WriteConfirmed, 200, ""},
		{"not writable in the project", WriteRequest{Binding: "plc:SHOWN", Value: 1.0}, nil, WriteFailed, 404, "not writable"},
		{"unknown binding", WriteRequest{Binding: "nonsense", Value: 1.0}, nil, WriteFailed, 404, "does not name a tag"},
		{"namespace tag", WriteRequest{Binding: "plc:NS1", Value: 3.0}, nil, WriteConfirmed, 200, ""},
		{"namespace tag by ns path", WriteRequest{Binding: "ns:plant.ns1", Value: 4.0}, nil, WriteConfirmed, 200, ""},
		{"dynamic writeTo", WriteRequest{Binding: "plc:DYN", Value: true}, nil, WriteConfirmed, 200, ""},
		{"faceplate parameter", WriteRequest{Binding: "plc:FP_SP", Value: 5.0}, nil, WriteConfirmed, 200, ""},
		{"faceplate parameter above its max", WriteRequest{Binding: "plc:FP_SP", Value: 50.0}, nil, WriteFailed, 400, "above the maximum 10"},
		{"recipe-only tag, not polled otherwise", WriteRequest{Binding: "plc:RCP", Value: 2.0}, nil, WriteConfirmed, 200, ""},
		{"recipe write of any tag", WriteRequest{Binding: "plc:ELSEWHERE", Value: 2.0, Recipe: true}, nil, WriteConfirmed, 200, ""},
		{"text input, no limits", WriteRequest{Binding: "plc:FREE", Value: "hello"}, nil, WriteConfirmed, 200, ""},
		{"below the widest minimum", WriteRequest{Binding: "plc:SP", Value: -1.0}, nil, WriteFailed, 400, "below the minimum 0"},
		{"above the widest maximum", WriteRequest{Binding: "plc:SP", Value: 101.0}, nil, WriteFailed, 400, "above the maximum 100"},
		{"inside the widest, outside the named widget", WriteRequest{Binding: "plc:SP", Value: 50.0, WidgetID: "small"}, nil, WriteFailed, 400, "above the maximum 10"},
		{"inside the named widget", WriteRequest{Binding: "plc:SP", Value: 50.0, WidgetID: "sp"}, nil, WriteConfirmed, 200, ""},
		{"widget that does not write the tag: widest limits", WriteRequest{Binding: "plc:SP", Value: 50.0, WidgetID: "free"}, nil, WriteConfirmed, 200, ""},
		{"unknown widget, outside the widest limits", WriteRequest{Binding: "plc:SP", Value: 500.0, WidgetID: "fp/in"}, nil, WriteFailed, 400, "above the maximum 100"},
		{"text where limits need a number", WriteRequest{Binding: "plc:SP", Value: "abc"}, nil, WriteFailed, 400, "not a number"},
		{"PLC program overwrites the value", WriteRequest{Binding: "plc:SP", Value: 76.0}, func(p *plcDriver) { p.hold["SP"] = 75.0 }, WriteNotConfirmed, 409, "the device holds 75"},
		{"device never reports", WriteRequest{Binding: "plc:SP", Value: 7.0}, func(p *plcDriver) { p.silent = true }, WriteNotConfirmed, 409, "no new value"},
		{"bad value", WriteRequest{Binding: "plc:SP", Value: 7.0}, func(p *plcDriver) { p.writeErr = drivers.Mark(errText("TypeMismatch"), drivers.ErrBadValue) }, WriteFailed, 400, "TypeMismatch"},
		{"datasource offline", WriteRequest{Binding: "plc:SP", Value: 7.0}, func(p *plcDriver) { p.writeErr = drivers.Mark(errText("no answer"), drivers.ErrNotConnected) }, WriteFailed, 503, "no answer"},
		{"device has no such tag", WriteRequest{Binding: "plc:SP", Value: 7.0}, func(p *plcDriver) { p.writeErr = drivers.Mark(errText("NotExists"), drivers.ErrUnknownTag) }, WriteFailed, 404, "NotExists"},
		{"device refuses", WriteRequest{Binding: "plc:SP", Value: 7.0}, func(p *plcDriver) { p.writeErr = drivers.Mark(errText("access denied"), drivers.ErrRejected) }, WriteFailed, 502, "access denied"},
		{"MQTT topic nothing subscribes: sent", WriteRequest{Binding: "broker:cmd/other", Value: true, Recipe: true}, nil, WriteSent, 200, ""},
		{"MQTT topic on a screen waits for the echo", WriteRequest{Binding: "broker:cmd/start", Value: true}, nil, WriteNotConfirmed, 409, "no new value"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, plc := startWriteRuntime(t)
			if tc.setup != nil {
				plc.mu.Lock()
				tc.setup(plc)
				plc.mu.Unlock()
			}
			got := r.WriteTag(context.Background(), tc.req)
			if got.Status != tc.wantStatus || got.Code != tc.wantCode || !strings.Contains(got.Reason, tc.wantReason) {
				t.Errorf("got %+v, want status %s, code %d, reason containing %q", got, tc.wantStatus, tc.wantCode, tc.wantReason)
			}
		})
	}
}

// The temporary poll for a write is released afterwards.
func TestWriteReleasesItsDemand(t *testing.T) {
	r, _ := startWriteRuntime(t)
	if res := r.WriteTag(context.Background(), WriteRequest{Binding: "plc:RCP", Value: 2.0}); res.Status != WriteConfirmed {
		t.Fatalf("write: %+v", res)
	}
	for _, d := range r.Demand() {
		if d.Binding == "plc:RCP" {
			t.Errorf("plc:RCP still demanded by %v after the write", d.Sources)
		}
	}
}

type errText string

func (e errText) Error() string { return string(e) }
