package runtime

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/historian"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestHistorianRules(t *testing.T) {
	num := func(v float64) *float64 { return &v }
	days := func(v int64) *int64 { return &v }
	no := false
	tests := []struct {
		name    string
		section *project.HistorianSettings
		want    historian.Rules
	}{
		{"no section", nil, historian.Rules{}},
		{"default deadband and retention",
			&project.HistorianSettings{Deadband: num(0.5), RetentionDays: days(30)},
			historian.Rules{Deadband: 0.5, Retention: 30 * 24 * time.Hour}},
		{"exact, prefix and skipped tags",
			&project.HistorianSettings{Tags: []project.HistorianTagRule{
				{Path: "plc1:Arp.Plc.Eclr/rTemp", Deadband: num(0.2)},
				{Path: "plc1:Arp.Plc.Eclr/Diag*", Store: &no},
			}},
			historian.Rules{Tags: []historian.TagRule{
				{Path: "plc1:Arp.Plc.Eclr/rTemp", Deadband: num(0.2)},
				{Path: "plc1:Arp.Plc.Eclr/Diag", Prefix: true, Skip: true},
			}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := historianRules(&project.Project{Historian: tc.section})
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

// LoadProject hands the rules to the historian, and pump updates follow them.
func TestLoadProjectAppliesHistorianRules(t *testing.T) {
	h, err := historian.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
	r := New(nil, h)
	p := testProject(t, nil)
	no := false
	p.Historian = &project.HistorianSettings{Tags: []project.HistorianTagRule{{Path: "plc:Diag*", Store: &no}}}
	load(t, r, p)

	for i, path := range []string{"plc:Diag/Count", "plc:Temp"} {
		r.process(tagstore.TagUpdate{Path: path, State: tagstore.TagState{Value: float64(i), Quality: "Good", TS: 1}})
	}
	h.Flush()
	for path, want := range map[string]int{"plc:Diag/Count": 0, "plc:Temp": 1} {
		got, err := h.Query(context.Background(), path, 0, 1<<62, 0)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != want {
			t.Errorf("%s: %d rows, want %d", path, len(got), want)
		}
	}
}
