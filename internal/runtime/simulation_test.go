package runtime

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers/sim"
	"github.com/Speth12/Speths_Screens/internal/project"
)

func simProject(on bool) *project.Project {
	p := &project.Project{
		Version: "1",
		Datasources: []project.Datasource{
			{ID: "plc", Label: "PLC", Type: project.REST, Config: project.DatasourceConfig{Host: str("192.0.2.1")}}, // TEST-NET: reaches nothing
			{ID: "mem", Label: "mem", Type: project.Memory, Config: project.DatasourceConfig{MemoryTags: []project.MemoryTag{{Path: "x", Type: "int"}}}},
		},
		Pages: []project.Page{{ID: "p1", Name: "Main", Widgets: []project.Widget{
			{ID: "sp", Type: project.NumericInput, W: 1, H: 1, Bindings: &project.WidgetBindings{Value: str("plc:SP")}},
		}}},
	}
	if on {
		p.Simulation = &on
	}
	return p
}

func TestSimulation(t *testing.T) {
	t.Run("refused where it is not allowed, and the project running keeps running", func(t *testing.T) {
		r := New(nil, nil)
		r.Start(context.Background())
		t.Cleanup(r.Stop)
		load(t, r, &project.Project{Version: "1", Name: str("running"), Pages: []project.Page{{ID: "p1", Name: "Main"}}})
		err := r.LoadProject(context.Background(), simProject(true))
		if !errors.Is(err, ErrSimulationNotAllowed) {
			t.Fatalf("err %v, want ErrSimulationNotAllowed", err)
		}
		if p := r.Project(); p == nil || p.Name == nil || *p.Name != "running" {
			t.Errorf("the running project was replaced: %+v", p)
		}
		if len(r.drivers) != 0 {
			t.Errorf("drivers were built: %v", r.drivers)
		}
	})

	t.Run("allowed: a PLC datasource shows made-up values, memory stays memory, and a write confirms", func(t *testing.T) {
		r := New(nil, nil)
		r.AllowSimulation = true
		r.writeConfirm = 2 * time.Second
		r.Start(context.Background())
		t.Cleanup(r.Stop)
		load(t, r, simProject(true))
		if _, ok := r.Driver("plc").(*sim.Driver); !ok {
			t.Fatalf("plc is %T, want the simulated driver", r.Driver("plc"))
		}
		if _, ok := r.Driver("mem").(*sim.Driver); ok {
			t.Error("a memory datasource was simulated")
		}
		if res := r.WriteTag(context.Background(), WriteRequest{Binding: "plc:SP", Value: 42.0, Role: project.Admin}); res.Status != WriteConfirmed {
			t.Errorf("write: %+v", res)
		}
	})

	t.Run("turning it off builds the real driver again", func(t *testing.T) {
		r := New(nil, nil)
		r.AllowSimulation = true
		r.Start(context.Background())
		t.Cleanup(r.Stop)
		load(t, r, simProject(true))
		load(t, r, simProject(false))
		if _, ok := r.Driver("plc").(*sim.Driver); ok {
			t.Error("still simulated after the setting was turned off")
		}
	})
}
