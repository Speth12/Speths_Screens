package runtime

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
)

func role(r project.Role) *project.Role { return &r }

// accessProject has one datasource "plc" and widgets that ask for roles:
//
//	OPEN     numeric input anyone may use
//	SUP      numeric input on a page only supervisors and above may see
//	ENG      numeric input an engineer and above may operate, on an open page
//	TWO      written by an admin-only widget (adm) and an open one (any)
//	NSPROT   a namespace tag, also written by an admin-only widget
//	CWP      written through a custom widget parameter; the part asks for supervisor, the placement for engineer
//	HDR      written by a button in a header pinned to the screen edge; the button asks for supervisor
//	POP      written inside a popup (the pump custom widget) a page button opens; the part asks for supervisor
func accessProject() *project.Project {
	input := func(id, tag string, a *project.Access) project.Widget {
		return project.Widget{ID: id, Type: project.NumericInput, W: 1, H: 1, Bindings: &project.WidgetBindings{Value: str("plc:" + tag)}, Access: a}
	}
	return &project.Project{
		Version:     "0.1.0",
		Datasources: []project.Datasource{{ID: "plc", Label: "plc", Type: project.REST}},
		Pages: []project.Page{
			{ID: "p1", Name: "Main", Widgets: []project.Widget{
				input("open", "OPEN", nil),
				input("eng", "ENG", &project.Access{Operate: role(project.Engineer)}),
				input("adm", "TWO", &project.Access{Operate: role(project.Admin)}),
				input("any", "TWO", nil),
				input("nsadm", "NSPROT", &project.Access{Operate: role(project.Admin)}),
				{ID: "opener", Type: project.Button, W: 1, H: 1,
					Events: &project.WidgetEvents{OnClick: []project.Action{{Type: project.OpenPopup, CustomWidgetID: str("pump"), Params: map[string]string{"sp": "plc:POP"}}}}},
				{ID: "cw1", Type: project.CustomWidget, W: 1, H: 1, Access: &project.Access{View: role(project.Engineer)},
					Props: &project.WidgetProps{CustomWidgetID: str("pump"), Params: map[string]string{"sp": "plc:CWP"}}},
			}},
			{ID: "p2", Name: "Supervisors", Access: &project.Access{View: role(project.Supervisor)}, Widgets: []project.Widget{
				input("sup", "SUP", nil),
			}},
		},
		CustomWidgets: []project.CustomWidgetElement{
			{ID: "pump", Name: "Pump", Widgets: []project.CustomWidgetPart{
				{LocalID: "in", Type: project.NumericInput, W: 1, H: 1, Bindings: &project.WidgetBindings{Value: str("{sp}")}, Access: &project.Access{Operate: role(project.Supervisor)}},
			}},
			{ID: "hdr", Name: "Header", Widgets: []project.CustomWidgetPart{
				{LocalID: "reset", Type: project.Button, W: 1, H: 1, Access: &project.Access{Operate: role(project.Supervisor)},
					Events: &project.WidgetEvents{OnClick: []project.Action{{Type: project.Write, Tag: str("plc:HDR"), Value: 1.0}}}},
			}},
		},
		Shell:     &project.Shell{Frame: []project.FrameSlot{{ID: "top", CustomWidgetID: "hdr", Edge: project.FrameEdgeTop, Size: 60}}},
		Namespace: []project.NamespaceNode{{Path: "plant.prot", Type: project.Tag, DriverID: str("plc"), DriverAddr: str("NSPROT")}},
		Recipes:   []project.Recipe{{ID: "r1", Name: "R1", Entries: []project.RecipeEntry{{Binding: "plc:ENG", Value: 1.0}}}},
	}
}

func startAccessRuntime(t *testing.T) *Runtime {
	t.Helper()
	plc := newPLC()
	r := New(nil, nil)
	r.writeConfirm = 300 * time.Millisecond
	r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) { return plc, nil }
	r.Start(context.Background())
	t.Cleanup(r.Stop)
	load(t, r, accessProject())
	return r
}

func TestWriteAccess(t *testing.T) {
	const op, sup, eng, adm = project.Operator, project.Supervisor, project.Engineer, project.Admin
	tests := []struct {
		name       string
		req        WriteRequest
		wantCode   int
		wantReason string // substring
	}{
		{"an open widget: anyone", WriteRequest{Binding: "plc:OPEN", Value: 1.0, Role: op}, 200, ""},
		{"no role given counts as an operator", WriteRequest{Binding: "plc:ENG", Value: 1.0}, 403, "may be written by engineer and above"},
		{"a page only supervisors see: an operator is refused", WriteRequest{Binding: "plc:SUP", Value: 1.0, Role: op}, 403, "supervisor and above"},
		{"a page only supervisors see: a supervisor writes", WriteRequest{Binding: "plc:SUP", Value: 1.0, Role: sup}, 200, ""},
		{"operate engineer: a supervisor naming the widget is refused", WriteRequest{Binding: "plc:ENG", Value: 1.0, Role: sup, WidgetID: "eng"}, 403, "widget eng may be operated by engineer and above"},
		{"operate engineer: an engineer writes", WriteRequest{Binding: "plc:ENG", Value: 1.0, Role: eng, WidgetID: "eng"}, 200, ""},
		{"naming a widget that does not write the tag does not get past it", WriteRequest{Binding: "plc:ENG", Value: 1.0, Role: op, WidgetID: "open"}, 403, "engineer and above"},
		{"two writers: the protected one named is refused", WriteRequest{Binding: "plc:TWO", Value: 1.0, Role: op, WidgetID: "adm"}, 403, "widget adm may be operated by admin"},
		{"two writers: the open one is used", WriteRequest{Binding: "plc:TWO", Value: 1.0, Role: op, WidgetID: "any"}, 200, ""},
		{"two writers: naming none, the open one allows it", WriteRequest{Binding: "plc:TWO", Value: 1.0, Role: op}, 200, ""},
		{"a namespace tag a protected widget writes is not open by its ns path", WriteRequest{Binding: "ns:plant.prot", Value: 1.0, Role: eng}, 403, "admin and above"},
		{"... nor by its datasource path", WriteRequest{Binding: "plc:NSPROT", Value: 1.0, Role: eng}, 403, "admin and above"},
		{"... an admin writes it", WriteRequest{Binding: "ns:plant.prot", Value: 1.0, Role: adm}, 200, ""},
		{"a custom widget: the placement's role and the part's both count", WriteRequest{Binding: "plc:CWP", Value: 1.0, Role: sup, WidgetID: "cw1"}, 403, "engineer and above"},
		{"a custom widget: an engineer writes", WriteRequest{Binding: "plc:CWP", Value: 1.0, Role: eng, WidgetID: "cw1"}, 200, ""},
		{"a header button's own tag is writable, and asks for its role", WriteRequest{Binding: "plc:HDR", Value: 1.0, Role: op, WidgetID: "top"}, 403, "widget top may be operated by supervisor"},
		{"a header button: a supervisor writes", WriteRequest{Binding: "plc:HDR", Value: 1.0, Role: sup, WidgetID: "top"}, 200, ""},
		{"a popup's widget writes, with the role its part asks for", WriteRequest{Binding: "plc:POP", Value: 1.0, Role: op, WidgetID: "opener"}, 403, "widget opener may be operated by supervisor"},
		{"a popup's widget: a supervisor writes", WriteRequest{Binding: "plc:POP", Value: 1.0, Role: sup, WidgetID: "opener"}, 200, ""},
		{"a recipe write has its own permission", WriteRequest{Binding: "plc:ENG", Value: 1.0, Role: op, Recipe: true}, 200, ""},
		{"a script write has its writes list", WriteRequest{Binding: "plc:ENG", Value: 1.0, Script: true}, 200, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := startAccessRuntime(t)
			got := r.WriteTag(context.Background(), tc.req)
			if got.Code != tc.wantCode || !strings.Contains(got.Reason, tc.wantReason) {
				t.Errorf("got %+v, want code %d, reason containing %q", got, tc.wantCode, tc.wantReason)
			}
		})
	}
}

func TestNeed(t *testing.T) {
	tests := []struct {
		name string
		in   []*project.Access
		want int
	}{
		{"nothing asked", []*project.Access{nil, {}}, 0},
		{"operate", []*project.Access{{Operate: role(project.Engineer)}}, 3},
		{"view counts: what a role may not see it may not use", []*project.Access{{View: role(project.Admin), Operate: role(project.Supervisor)}}, 4},
		{"the highest of a page, a placement and a part", []*project.Access{{View: role(project.Supervisor)}, nil, {Operate: role(project.Engineer)}}, 3},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := project.Need(tc.in...); got != tc.want {
				t.Errorf("Need = %d, want %d", got, tc.want)
			}
		})
	}
}
