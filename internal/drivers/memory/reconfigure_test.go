package memory

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func cfgOf(t *testing.T, specs []Spec) drivers.DriverConfig {
	t.Helper()
	b, err := json.Marshal(specs)
	if err != nil {
		t.Fatal(err)
	}
	return drivers.DriverConfig{Extra: map[string]string{"memoryTags": string(b), "datasourceId": "mem"}}
}

// states drains ch and returns the newest state per path.
func states(ch chan tagstore.TagUpdate) map[string]tagstore.TagState {
	out := map[string]tagstore.TagState{}
	for {
		select {
		case u := <-ch:
			out[u.Path] = u.State
		default:
			return out
		}
	}
}

func TestDriverIsAReconfigurer(t *testing.T) {
	var _ drivers.Reconfigurer = (*Driver)(nil)
}

func TestReconfigure(t *testing.T) {
	tests := []struct {
		name string
		// before is connected, written to, and then reconfigured to after.
		before []Spec
		writes map[string]any
		after  []Spec
		// sent is what the reconfigure sends on the channel (the values of new or retyped tags).
		sent map[string]any
		// held is what the driver holds afterwards, read back through Write's Browse.
		held []string
		// gone are the tags that are sent Bad.
		gone []string
		// values are written afterwards and must be accepted (true) or refused (false).
		accepts map[string]bool
	}{
		{
			name:    "a new tag is added and starts from its initial value",
			before:  []Spec{{Path: "Count", Type: "int"}},
			after:   []Spec{{Path: "Count", Type: "int"}, {Path: "Virtual_INT", Type: "int", Initial: 7.0}},
			sent:    map[string]any{"Virtual_INT": int64(7)},
			held:    []string{"Count", "Virtual_INT"},
			accepts: map[string]bool{"Virtual_INT": true, "Count": true},
		},
		{
			name:   "a tag that stays keeps the value it has, so a deploy does not reset a counter",
			before: []Spec{{Path: "Count", Type: "int", Initial: 1.0}},
			writes: map[string]any{"Count": 41.0},
			after:  []Spec{{Path: "Count", Type: "int", Initial: 1.0}, {Path: "Other", Type: "bool"}},
			sent:   map[string]any{"Other": false}, // Count is not sent again: it did not change
			held:   []string{"Count", "Other"},
		},
		{
			name:   "a changed initial value does not touch a tag that stays",
			before: []Spec{{Path: "Count", Type: "int", Initial: 1.0}},
			writes: map[string]any{"Count": 5.0},
			after:  []Spec{{Path: "Count", Type: "int", Initial: 99.0}},
			sent:   map[string]any{},
			held:   []string{"Count"},
		},
		{
			name:    "a tag whose type changed starts again from its initial value",
			before:  []Spec{{Path: "Level", Type: "int"}},
			writes:  map[string]any{"Level": 12.0},
			after:   []Spec{{Path: "Level", Type: "real", Initial: 2.5}},
			sent:    map[string]any{"Level": 2.5},
			held:    []string{"Level"},
			accepts: map[string]bool{"Level": true},
		},
		{
			name:    "a removed tag goes Bad and is refused",
			before:  []Spec{{Path: "Keep", Type: "int"}, {Path: "Drop", Type: "int"}},
			after:   []Spec{{Path: "Keep", Type: "int"}},
			sent:    map[string]any{},
			held:    []string{"Keep"},
			gone:    []string{"Drop"},
			accepts: map[string]bool{"Keep": true, "Drop": false},
		},
		{
			name:   "tags in a new order and a repeated name",
			before: []Spec{{Path: "A", Type: "int"}},
			after:  []Spec{{Path: "B", Type: "int"}, {Path: "A", Type: "int"}, {Path: "B", Type: "real"}},
			sent:   map[string]any{"B": int64(0)}, // the first B wins
			held:   []string{"B", "A"},
		},
		{
			name:   "no tags left",
			before: []Spec{{Path: "A", Type: "int"}},
			after:  nil,
			sent:   map[string]any{},
			held:   nil,
			gone:   []string{"A"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d, ch := connect(t, nil, tc.before)
			states(ch) // the start values are not what is tested
			for p, v := range tc.writes {
				if err := d.Write(context.Background(), p, v); err != nil {
					t.Fatalf("Write %s: %v", p, err)
				}
			}
			states(ch)

			if err := d.Reconfigure(cfgOf(t, tc.after)); err != nil {
				t.Fatalf("Reconfigure: %v", err)
			}
			got := states(ch)
			for p, want := range tc.sent {
				if s, ok := got[p]; !ok || s.Quality != "Good" || s.Value != want {
					t.Errorf("sent %s = %+v (sent at all: %v), want Good %#v", p, s, ok, want)
				}
			}
			for p := range got {
				if _, expected := tc.sent[p]; expected {
					continue
				}
				isGone := false
				for _, g := range tc.gone {
					isGone = isGone || g == p
				}
				if !isGone {
					t.Errorf("sent %s = %+v, which did not change", p, got[p])
				}
			}
			for _, p := range tc.gone {
				if s, ok := got[p]; !ok || s.Quality != "Bad" || s.Reason == "" {
					t.Errorf("removed %s was sent %+v (sent at all: %v), want Bad with a reason", p, s, ok)
				}
			}

			defs, _ := d.Browse(context.Background())
			var order []string
			for _, def := range defs {
				order = append(order, def.Path)
			}
			if len(order) != len(tc.held) {
				t.Fatalf("holds %v, want %v", order, tc.held)
			}
			for i := range order {
				if order[i] != tc.held[i] {
					t.Fatalf("holds %v, want %v", order, tc.held)
				}
			}
			if st := d.Status(); st.TagCount != len(tc.held) || !st.Connected {
				t.Errorf("status %+v, want %d tags and connected", st, len(tc.held))
			}
			for p, ok := range tc.accepts {
				err := d.Write(context.Background(), p, 1.0)
				if (err == nil) != ok {
					t.Errorf("Write %s after the change: error %v, want accepted=%v", p, err, ok)
				}
			}
		})
	}
}

func TestReconfigureKeepsTheValueOfAStayingTag(t *testing.T) {
	d, ch := connect(t, nil, []Spec{{Path: "Count", Type: "int"}})
	_ = d.Write(context.Background(), "Count", 41.0)
	states(ch)
	if err := d.Reconfigure(cfgOf(t, []Spec{{Path: "Count", Type: "int"}, {Path: "New", Type: "int"}})); err != nil {
		t.Fatal(err)
	}
	if v := d.value("Count"); v != int64(41) {
		t.Errorf("Count = %#v after a deploy that added another tag, want 41", v)
	}
}

func TestReconfigureRefusesAListItCannotRead(t *testing.T) {
	d, ch := connect(t, nil, []Spec{{Path: "Count", Type: "int"}})
	_ = d.Write(context.Background(), "Count", 3.0)
	states(ch)
	err := d.Reconfigure(drivers.DriverConfig{Extra: map[string]string{"memoryTags": "{not json", "datasourceId": "mem"}})
	if err == nil {
		t.Fatal("a tag list that is not JSON was accepted")
	}
	if v := d.value("Count"); v != int64(3) {
		t.Errorf("Count = %#v after a refused change, want the 3 it had", v)
	}
	if n := d.Status().TagCount; n != 1 {
		t.Errorf("%d tags after a refused change, want 1", n)
	}
	if got := states(ch); len(got) != 0 {
		t.Errorf("a refused change sent %v", got)
	}
}

func TestReconfigureBeforeConnectIsRefused(t *testing.T) {
	d := New(nil)
	if err := d.Reconfigure(cfgOf(t, []Spec{{Path: "A", Type: "int"}})); err == nil {
		t.Error("a driver that is not connected took a change")
	}
}

func TestReconfigureRetainedTags(t *testing.T) {
	t.Run("a new retained tag starts from its stored value", func(t *testing.T) {
		r := newFake(map[string]any{"Later": 8.0})
		d, ch := connect(t, r, []Spec{{Path: "A", Type: "int"}})
		states(ch)
		if err := d.Reconfigure(cfgOf(t, []Spec{{Path: "A", Type: "int"}, {Path: "Later", Type: "int", Initial: 1.0, Retain: true}})); err != nil {
			t.Fatal(err)
		}
		if got := states(ch)["Later"].Value; got != int64(8) {
			t.Errorf("Later = %#v, want the stored 8", got)
		}
	})

	t.Run("a tag that becomes retained is saved with the value it holds", func(t *testing.T) {
		SaveInterval = 10 * 1e6 // 10 ms
		t.Cleanup(func() { SaveInterval = 1e9 })
		r := newFake(map[string]any{})
		d, ch := connect(t, r, []Spec{{Path: "A", Type: "int"}})
		_ = d.Write(context.Background(), "A", 5.0)
		states(ch)
		if err := d.Reconfigure(cfgOf(t, []Spec{{Path: "A", Type: "int", Retain: true}})); err != nil {
			t.Fatal(err)
		}
		_ = d.Disconnect() // saves what is pending
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.values["A"] != int64(5) {
			t.Errorf("saved %#v, want 5", r.values["A"])
		}
	})
}
