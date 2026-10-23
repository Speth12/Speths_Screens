package faceplate

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/Speth12/speths-screens/internal/assets"
)

func makeRegistry() (*Registry, *assets.Registry) {
	ar := assets.New()
	return New(ar), ar
}

func TestRegisterAndListViews(t *testing.T) {
	r, _ := makeRegistry()
	v := &View{
		TemplateID:  "pump",
		ViewType:    ViewOverview,
		DisplayMode: ModeModal,
		Widgets:     []Widget{json.RawMessage(`{"type":"label","text":"{{.Name}}"}`)},
	}
	if err := r.Register(v); err != nil {
		t.Fatal(err)
	}
	views := r.ListViews("pump")
	if len(views) != 1 {
		t.Fatalf("want 1 view, got %d", len(views))
	}
	if views[0].ViewType != ViewOverview {
		t.Errorf("wrong view type: %q", views[0].ViewType)
	}
}

func TestRegisterReplacesExisting(t *testing.T) {
	r, _ := makeRegistry()
	r.Register(&View{TemplateID: "pump", ViewType: ViewOverview, Widgets: []Widget{json.RawMessage(`"v1"`)}})
	r.Register(&View{TemplateID: "pump", ViewType: ViewOverview, Widgets: []Widget{json.RawMessage(`"v2"`)}})
	views := r.ListViews("pump")
	if len(views) != 1 {
		t.Fatalf("replace should keep 1 view, got %d", len(views))
	}
	if string(views[0].Widgets[0]) != `"v2"` {
		t.Errorf("view not replaced: %s", views[0].Widgets[0])
	}
}

func TestRegisterDefaultsDisplayMode(t *testing.T) {
	r, _ := makeRegistry()
	v := &View{TemplateID: "pump", ViewType: ViewDiagnostics}
	r.Register(v)
	if v.DisplayMode != ModeModal {
		t.Errorf("expected modal default, got %q", v.DisplayMode)
	}
}

func TestRegisterValidation(t *testing.T) {
	r, _ := makeRegistry()
	if err := r.Register(&View{ViewType: ViewOverview}); err == nil {
		t.Error("expected error for missing templateId")
	}
	if err := r.Register(&View{TemplateID: "pump"}); err == nil {
		t.Error("expected error for missing viewType")
	}
	if err := r.Register(&View{TemplateID: "nonexistent", ViewType: ViewOverview}); err == nil {
		t.Error("expected error for unknown template")
	}
}

func TestResolve(t *testing.T) {
	r, ar := makeRegistry()
	ar.CreateInstance(&assets.Instance{
		ID:         "pump-a",
		Name:       "Pump A",
		TemplateID: "pump",
		NSPath:     "Plant.Line1.PumpA",
		DriverID:   "opc1",
		TagMap: map[string]string{
			"RunStatus": "ns=2;s=Pump1.Run",
		},
	})
	r.Register(&View{
		TemplateID: "pump",
		ViewType:   ViewOverview,
		Widgets: []Widget{
			json.RawMessage(`{"path":"{{.NSPath}}.RunStatus","bind":"{{.Bindings.RunStatus}}"}`),
		},
	})

	views, err := r.Resolve("pump-a")
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 {
		t.Fatalf("want 1 view, got %d", len(views))
	}
	w := string(views[0].Widgets[0])
	if !strings.Contains(w, "Plant.Line1.PumpA.RunStatus") {
		t.Errorf("NSPath not substituted: %s", w)
	}
	if !strings.Contains(w, "opc1:ns=2;s=Pump1.Run") {
		t.Errorf("Binding not substituted: %s", w)
	}
	if views[0].InstanceID != "pump-a" {
		t.Errorf("wrong instanceId: %q", views[0].InstanceID)
	}
}

func TestGetView(t *testing.T) {
	r, ar := makeRegistry()
	ar.CreateInstance(&assets.Instance{
		ID: "pump-b", Name: "Pump B", TemplateID: "pump", NSPath: "Plant.PumpB",
	})
	r.Register(&View{TemplateID: "pump", ViewType: ViewOverview})
	r.Register(&View{TemplateID: "pump", ViewType: ViewAlarms})

	v, err := r.GetView("pump-b", ViewAlarms)
	if err != nil {
		t.Fatal(err)
	}
	if v.ViewType != ViewAlarms {
		t.Errorf("wrong view type: %q", v.ViewType)
	}

	_, err = r.GetView("pump-b", ViewTrend)
	if err == nil {
		t.Error("expected error for missing view type")
	}
}

func TestInheritedViews(t *testing.T) {
	r, ar := makeRegistry()
	// vfd-motor inherits motor; register a view on motor, instance is vfd-motor
	ar.CreateInstance(&assets.Instance{
		ID: "motor-1", Name: "Motor 1", TemplateID: "vfd-motor", NSPath: "Plant.M1",
	})
	r.Register(&View{TemplateID: "motor", ViewType: ViewDiagnostics,
		Widgets: []Widget{json.RawMessage(`{"tag":"{{.NSPath}}.Fault"}`)}})

	views, err := r.Resolve("motor-1")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, v := range views {
		if v.ViewType == ViewDiagnostics {
			found = true
			w := string(v.Widgets[0])
			if !strings.Contains(w, "Plant.M1.Fault") {
				t.Errorf("NSPath not substituted in inherited view: %s", w)
			}
		}
	}
	if !found {
		t.Error("inherited view not found")
	}
}

func TestTagsSubstitution(t *testing.T) {
	r, ar := makeRegistry()
	ar.CreateInstance(&assets.Instance{
		ID: "valve-1", Name: "Valve 1", TemplateID: "valve", NSPath: "Plant.V1",
		DriverID: "opc1",
	})
	r.Register(&View{
		TemplateID: "valve",
		ViewType:   ViewOverview,
		Widgets:    []Widget{json.RawMessage(`{"tag":"{{.Tags.Position}}"}`)},
	})
	views, err := r.Resolve("valve-1")
	if err != nil {
		t.Fatal(err)
	}
	w := string(views[0].Widgets[0])
	if !strings.Contains(w, "Plant.V1.Position") {
		t.Errorf("Tags substitution failed: %s", w)
	}
}

func TestJSONRoundTrip(t *testing.T) {
	r, _ := makeRegistry()
	r.Register(&View{
		TemplateID:  "tank",
		ViewType:    ViewTrend,
		DisplayMode: ModeDocked,
		Width:       600,
		Height:      400,
		Widgets:     []Widget{json.RawMessage(`{"type":"trend"}`)},
	})

	b, err := r.MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}

	ar2 := assets.New()
	r2 := New(ar2)
	if err := r2.UnmarshalJSON(b); err != nil {
		t.Fatal(err)
	}
	views := r2.ListViews("tank")
	if len(views) != 1 {
		t.Fatalf("want 1 view after unmarshal, got %d", len(views))
	}
	if views[0].Width != 600 {
		t.Errorf("width not preserved: %d", views[0].Width)
	}
}
