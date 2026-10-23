package assets

import (
	"encoding/json"
	"testing"
)

func TestBuiltinTemplates(t *testing.T) {
	r := New()
	for _, id := range []string{"motor", "vfd-motor", "pump", "valve", "tank"} {
		if r.GetTemplate(id) == nil {
			t.Errorf("builtin template %q missing", id)
		}
	}
}

func TestInheritance(t *testing.T) {
	r := New()
	tmpl, err := r.ResolveTemplate("vfd-motor")
	if err != nil {
		t.Fatal(err)
	}
	// vfd-motor inherits motor: should have RunStatus + Fault + Current + Speed + Frequency
	names := map[string]bool{}
	for _, p := range tmpl.Properties {
		names[p.Name] = true
	}
	for _, want := range []string{"RunStatus", "Fault", "Current", "Speed", "Frequency"} {
		if !names[want] {
			t.Errorf("property %q missing from vfd-motor (inherited from motor)", want)
		}
	}
	// Alarms should be inherited from motor
	if len(tmpl.Alarms) == 0 {
		t.Error("alarms not inherited")
	}
}

func TestCustomTemplate(t *testing.T) {
	r := New()
	err := r.RegisterTemplate(&Template{
		ID:       "abb-motor",
		Name:     "ABB Motor",
		ParentID: "vfd-motor",
		Properties: []PropertyDef{
			{Name: "DriveTemp", DataType: "float", Unit: "°C"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := r.ResolveTemplate("abb-motor")
	names := map[string]bool{}
	for _, p := range tmpl.Properties {
		names[p.Name] = true
	}
	for _, want := range []string{"RunStatus", "Speed", "DriveTemp"} {
		if !names[want] {
			t.Errorf("property %q missing", want)
		}
	}
}

func TestCycleDetection(t *testing.T) {
	r := New()
	r.RegisterTemplate(&Template{ID: "A", Name: "A"})
	r.RegisterTemplate(&Template{ID: "B", Name: "B", ParentID: "A"})
	err := r.RegisterTemplate(&Template{ID: "A", Name: "A", ParentID: "B"})
	if err == nil {
		t.Error("expected cycle error")
	}
}

func TestCreateAndResolveInstance(t *testing.T) {
	r := New()
	err := r.CreateInstance(&Instance{
		ID:         "pump-a",
		Name:       "Pump A",
		TemplateID: "pump",
		NSPath:     "Plant.Line1.PumpA",
		DriverID:   "opc1",
		TagMap: map[string]string{
			"RunStatus": "ns=2;s=Pump1.Run",
			"FlowRate":  "ns=2;s=Pump1.Flow",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	ri, err := r.Resolve("pump-a")
	if err != nil {
		t.Fatal(err)
	}
	if ri.Name != "Pump A" {
		t.Errorf("name: %q", ri.Name)
	}
	if len(ri.Properties) == 0 {
		t.Error("no properties resolved")
	}
}

func TestNSTagPaths(t *testing.T) {
	r := New()
	r.CreateInstance(&Instance{
		ID:         "tank-1",
		Name:       "Tank 1",
		TemplateID: "tank",
		NSPath:     "Plant.Tank101",
	})
	paths, err := r.NSTagPaths("tank-1")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range paths {
		if p == "Plant.Tank101.Level" {
			found = true
		}
	}
	if !found {
		t.Errorf("Plant.Tank101.Level not found in %v", paths)
	}
}

func TestJSONRoundTrip(t *testing.T) {
	r := New()
	r.RegisterTemplate(&Template{
		ID:   "custom",
		Name: "Custom",
		Properties: []PropertyDef{
			{Name: "Pressure", DataType: "float", Unit: "bar"},
		},
	})
	r.CreateInstance(&Instance{
		ID:         "inst-1",
		Name:       "Test",
		TemplateID: "custom",
		NSPath:     "X.Y",
	})

	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	r2 := New()
	if err := json.Unmarshal(b, r2); err != nil {
		t.Fatal(err)
	}
	if r2.GetTemplate("custom") == nil {
		t.Error("custom template missing after unmarshal")
	}
	if r2.GetInstance("inst-1") == nil {
		t.Error("instance missing after unmarshal")
	}
}
