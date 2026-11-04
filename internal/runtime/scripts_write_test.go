package runtime

import (
	"context"
	"strings"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// A script writes what its writes list names, through the same pipeline as a
// widget: no list writes nothing, a listed tag needs no widget, an unlisted
// one is refused even when a widget could write it, and the limits of the
// tag's widgets still hold.
func TestScriptWritesFollowTheWritesList(t *testing.T) {
	r, plc := startWriteRuntime(t)
	p := writeProject()
	p.Scripts = []project.RuntimeScript{
		{ID: "sp-only", Name: "A", Writes: []string{"plc:SP"}},
		{ID: "no-list", Name: "B"},
		{ID: "display", Name: "C", Writes: []string{"plc:SHOWN", "plc:AREA/*"}},
		{ID: "alias", Name: "D", Writes: []string{"plc:NS1"}},
		{ID: "ns-entry", Name: "E", Writes: []string{"ns:plant.ns1"}},
		{ID: "whole-plc", Name: "F", Writes: []string{"plc:*"}},
		{ID: "empty-list", Name: "G", Writes: []string{}},
	}
	load(t, r, p)
	host := scriptHost{r}

	tests := []struct {
		name    string
		script  string
		path    string
		value   any
		want    string // the status
		reason  string // a part of the reason
		wantVal any    // what the PLC holds afterwards, when confirmed
	}{
		{"a listed tag with a widget", "sp-only", "plc:SP", 42.0, WriteConfirmed, "", 42.0},
		{"an unlisted tag is refused even though a widget writes it", "sp-only", "plc:FREE", "x", WriteFailed, "script sp-only may not write plc:FREE (not in its writes list)", nil},
		{"no list writes nothing", "no-list", "plc:SP", 1.0, WriteFailed, "not in its writes list", nil},
		{"an empty list writes nothing", "empty-list", "plc:SP", 1.0, WriteFailed, "not in its writes list", nil},
		{"a script that is not in the project writes nothing", "ghost", "plc:SP", 1.0, WriteFailed, "not in its writes list", nil},
		{"a listed tag needs no widget (a display only one)", "display", "plc:SHOWN", 7.0, WriteConfirmed, "", 7.0},
		{"a prefix covers a tag no widget names", "display", "plc:AREA/Valve/Open", true, WriteConfirmed, "", true},
		{"a prefix does not cover its neighbour", "display", "plc:AREA2/Valve", true, WriteFailed, "not in its writes list", nil},
		{"the datasource path an ns: tag resolves to is listed", "alias", "ns:plant.ns1", 5.0, WriteConfirmed, "", 5.0},
		{"an ns: entry covers the ns: tag as the script writes it", "ns-entry", "ns:plant.ns1", 6.0, WriteConfirmed, "", 6.0},
		{"an ns: entry does not cover the datasource path", "ns-entry", "plc:NS1", 6.0, WriteFailed, "not in its writes list", nil},
		{"a whole datasource", "whole-plc", "plc:RCP", 3.0, WriteConfirmed, "", 3.0},
		{"a whole datasource does not cover another", "whole-plc", "broker:cmd/start", 1.0, WriteFailed, "not in its writes list", nil},
		{"the widgets' limits still hold: out of range", "whole-plc", "plc:SP", 150.0, WriteFailed, "maximum", nil},
		{"the widgets' limits still hold: in range", "whole-plc", "plc:SP", 50.0, WriteConfirmed, "", 50.0},
		{"a tag that names no datasource is not listed", "whole-plc", "nonsense", 1.0, WriteFailed, "not in its writes list", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := host.Write(context.Background(), tt.script, tt.path, tt.value)
			if got.Status != tt.want || !strings.Contains(got.Reason, tt.reason) {
				t.Fatalf("%s writes %s = %v: %s %q, want %s with a reason containing %q", tt.script, tt.path, tt.value, got.Status, got.Reason, tt.want, tt.reason)
			}
			if tt.want != WriteConfirmed {
				return
			}
			_, path, _ := r.resolveBinding(tt.path)
			plc.mu.Lock()
			held := plc.vals[path]
			plc.mu.Unlock()
			if held != tt.wantVal {
				t.Errorf("the PLC holds %v at %s, want %v", held, path, tt.wantVal)
			}
		})
	}
}

// A listed tag no widget writes is refused over HTTP and WebSocket as before:
// the list belongs to the script, not to the tag.
func TestAWritesListDoesNotOpenTheTagToOthers(t *testing.T) {
	r, _ := startWriteRuntime(t)
	p := writeProject()
	p.Scripts = []project.RuntimeScript{{ID: "display", Name: "C", Writes: []string{"plc:SHOWN"}}}
	load(t, r, p)

	if got := r.WriteTag(context.Background(), WriteRequest{Binding: "plc:SHOWN", Value: 1.0}); got.Status != WriteFailed || got.Code != 404 {
		t.Errorf("a client write to SHOWN: %+v, want failed with 404", got)
	}
	if got := (scriptHost{r}).Write(context.Background(), "display", "plc:SHOWN", 1.0); got.Status != WriteConfirmed {
		t.Errorf("the script's write to SHOWN: %+v, want confirmed", got)
	}
}
