package runtime

import (
	"fmt"
	"slices"
	"sync"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/project"
)

func strp(s string) *string { return &s }

func TestProjectDemandFindsEveryBinding(t *testing.T) {
	tests := []struct {
		name   string
		p      project.Project
		source string
		want   string
	}{
		{
			name:   "widget binding",
			p:      project.Project{Pages: []project.Page{{Widgets: []project.Widget{{Bindings: &project.WidgetBindings{Value: strp("plc:A")}}}}}},
			source: SourceScreens, want: "plc:A",
		},
		{
			name:   "visible binding",
			p:      project.Project{Pages: []project.Page{{Widgets: []project.Widget{{Bindings: &project.WidgetBindings{Visible: strp("plc:V")}}}}}},
			source: SourceScreens, want: "plc:V",
		},
		{
			name: "color binding",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Bindings: &project.WidgetBindings{Color: strp("plc:C")},
			}}}}},
			source: SourceScreens, want: "plc:C",
		},
		{
			name: "trend pen",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Props: &project.WidgetProps{Tags: []project.TrendSeries{{Binding: "plc:T", Color: "#fff"}}},
			}}}}},
			source: SourceScreens, want: "plc:T",
		},
		{
			name: "table row",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Props: &project.WidgetProps{Rows: []project.TableRow{{Label: "r", Binding: "plc:R"}}},
			}}}}},
			source: SourceScreens, want: "plc:R",
		},
		{
			name: "faceplate instance param",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Props: &project.WidgetProps{Params: map[string]string{"state": "plc:P"}},
			}}}}},
			source: SourceScreens, want: "plc:P",
		},
		{
			name: "dynamic binding",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Dynamics: []project.DynamicElement{{ID: "d", Kind: project.Blink, Binding: strp("plc:D")}},
			}}}}},
			source: SourceScreens, want: "plc:D",
		},
		{
			name: "action tag",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Events: &project.WidgetEvents{OnClick: []project.Action{{Type: project.Write, Tag: strp("plc:W")}}},
			}}}}},
			source: SourceScreens, want: "plc:W",
		},
		{
			name: "action on the widget's own tag",
			p: project.Project{Pages: []project.Page{{Widgets: []project.Widget{{
				Type: project.Button, Bindings: &project.WidgetBindings{Value: strp("plc:B")},
				Events: &project.WidgetEvents{OnPress: []project.Action{{Type: project.Write}}},
			}}}}},
			source: SourceScreens, want: "plc:B",
		},
		{
			name: "fixed binding inside a faceplate",
			p: project.Project{Faceplates: []project.FaceplateElement{{
				Widgets: []project.FaceplateWidget{{Bindings: &project.WidgetBindings{Value: strp("plc:F")}}},
			}}},
			source: SourceScreens, want: "plc:F",
		},
		{
			name:   "alarm rule",
			p:      project.Project{AlarmRules: []project.AlarmRule{{Binding: "plc:AL"}}},
			source: SourceAlarms, want: "plc:AL",
		},
		{
			name: "calculated tag input",
			p: project.Project{Datasources: []project.Datasource{{
				ID: "calc", Type: project.DatasourceTypeVirtual,
				Config: project.DatasourceConfig{Tags: strp(`[{"path":"f","formula":"{plc:IN} * 9/5 + 32"}]`)},
			}}},
			source: SourceCalculated, want: "plc:IN",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := projectDemand(&tc.p)[tc.source]
			if !slices.Contains(got, tc.want) {
				t.Errorf("%s = %v, want it to contain %q", tc.source, got, tc.want)
			}
		})
	}
}

func TestResolveBinding(t *testing.T) {
	r := New(nil, nil)
	if _, err := r.Namespace.PublishDriverTag("plant.pump.run", "plc", "Arp.Plc.Eclr/Pump.Run", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Namespace.CreateNode("plant.folder", "folder"); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		binding    string
		wantDriver string
		wantPath   string
		wantOK     bool
	}{
		{"plc:Arp.Plc.Eclr/A", "plc", "Arp.Plc.Eclr/A", true},
		{"opcua:ns=6;s=Arp.Plc.Eclr/A", "opcua", "ns=6;s=Arp.Plc.Eclr/A", true},
		{"ns:plant.pump.run", "plc", "Arp.Plc.Eclr/Pump.Run", true},
		{"ns:plant.folder", "", "", false},  // node without a driver
		{"ns:plant.missing", "", "", false}, // no such node
		{"{state}", "", "", false},          // faceplate template
		{"nocolon", "", "", false},
		{":path", "", "", false},
		{"plc:", "", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.binding, func(t *testing.T) {
			d, p, ok := r.resolveBinding(tc.binding)
			if d != tc.wantDriver || p != tc.wantPath || ok != tc.wantOK {
				t.Errorf("got (%q, %q, %v), want (%q, %q, %v)", d, p, ok, tc.wantDriver, tc.wantPath, tc.wantOK)
			}
		})
	}
}

func TestDemandIsCountedPerSource(t *testing.T) {
	type step struct {
		do   func(r *Runtime)
		want []string
	}
	tests := []struct {
		name  string
		steps []step
	}{
		{
			name: "tag kept until the last source releases it",
			steps: []step{
				{func(r *Runtime) { r.AddDemand("ws:1", "plc:X") }, []string{"A", "X"}},
				{func(r *Runtime) { r.AddDemand("ws:2", "plc:X") }, []string{"A", "X"}},
				{func(r *Runtime) { r.ReleaseDemand("ws:1") }, []string{"A", "X"}},
				{func(r *Runtime) { r.ReleaseDemand("ws:2") }, []string{"A"}},
			},
		},
		{
			name: "screen client asks for a project tag",
			steps: []step{
				{func(r *Runtime) { r.AddDemand("ws:1", "plc:A") }, []string{"A"}},
				{func(r *Runtime) { r.ReleaseDemand("ws:1") }, []string{"A"}}, // project still needs it
			},
		},
		{
			name: "remove one binding of several",
			steps: []step{
				{func(r *Runtime) { r.AddDemand("ws:1", "plc:X", "plc:Y") }, []string{"A", "X", "Y"}},
				{func(r *Runtime) { r.RemoveDemand("ws:1", "plc:X") }, []string{"A", "Y"}},
			},
		},
		{
			name: "unresolvable bindings are ignored",
			steps: []step{
				{func(r *Runtime) { r.AddDemand("ws:1", "ns:nowhere", "other:Z", "{p}") }, []string{"A"}},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, built := newTestRuntime(t)
			load(t, r, testProject(t, []string{"plc"}, "A"))
			for i, s := range tc.steps {
				s.do(r)
				if got := built()[0].lastSet(); !slices.Equal(got, s.want) {
					t.Fatalf("step %d: tag set = %v, want %v", i, got, s.want)
				}
			}
		})
	}
}

func TestDemandListsSources(t *testing.T) {
	r, _ := newTestRuntime(t)
	load(t, r, testProject(t, []string{"plc"}, "A"))
	r.AddDemand("ws:7", "plc:A")

	var got *TagDemand
	for _, d := range r.Demand() {
		if d.Binding == "plc:A" {
			got = &d
		}
	}
	if got == nil {
		t.Fatal("plc:A missing from Demand()")
	}
	if got.Driver != "plc" || got.Path != "A" {
		t.Errorf("resolved to %s/%s, want plc/A", got.Driver, got.Path)
	}
	if !slices.Equal(got.Sources, []string{SourceScreens, "ws:7"}) {
		t.Errorf("sources = %v", got.Sources)
	}
}

// Many sources changing at once must leave the driver with the final union.
func TestConcurrentDemandEndsWithFinalUnion(t *testing.T) {
	r, built := newTestRuntime(t)
	load(t, r, testProject(t, []string{"plc"}, "A"))

	const clients = 20
	var wg sync.WaitGroup
	for i := 0; i < clients; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			src := fmt.Sprintf("ws:%d", i)
			r.AddDemand(src, fmt.Sprintf("plc:T%d", i), "plc:shared")
			if i%2 == 0 {
				r.ReleaseDemand(src)
			}
		}(i)
	}
	wg.Wait()

	want := []string{"A", "shared"}
	for i := 1; i < clients; i += 2 {
		want = append(want, fmt.Sprintf("T%d", i))
	}
	slices.Sort(want)
	if got := built()[0].lastSet(); !slices.Equal(got, want) {
		t.Errorf("tag set = %v\nwant %v", got, want)
	}
}

func TestDemoProjectDemand(t *testing.T) {
	p, err := project.Load("../../demo.xhmi.json")
	if err != nil {
		t.Fatal(err)
	}
	got := projectDemand(p)
	tests := []struct {
		source string
		want   string
	}{
		{SourceScreens, "sim:fault_active"},      // dynamics on the fault widget
		{SourceScreens, "sim:pump1_running"},     // faceplate instance param
		{SourceScreens, "ns:plant.process.flow"}, // table row
	}
	for _, tc := range tests {
		if !slices.Contains(got[tc.source], tc.want) {
			t.Errorf("%s does not contain %q", tc.source, tc.want)
		}
	}
}

// Presets are design-time copies: their bindings are polled by no one and
// make no tag writable until a preset is inserted on a page.
func TestPresetsCreateNoDemandOrWrites(t *testing.T) {
	button := project.Widget{ID: "b", Type: project.Button, Bindings: &project.WidgetBindings{Value: strp("plc:FromPreset")}}
	p := project.Project{
		Pages:   []project.Page{{ID: "p1", Name: "Main"}},
		Presets: []project.Preset{{ID: "ps", Name: "Start", Widgets: []project.Widget{button}}},
	}
	for source, tags := range projectDemand(&p) {
		if slices.Contains(tags, "plc:FromPreset") {
			t.Errorf("source %s polls a preset's tag: %v", source, tags)
		}
	}
	resolve := func(b string) (string, string, bool) { return "plc", "FromPreset", true }
	if ws, ns := writableBy(&p, "plc:FromPreset", resolve); len(ws) != 0 || ns {
		t.Errorf("a preset's tag is writable: %v, namespace %v", ws, ns)
	}
}
