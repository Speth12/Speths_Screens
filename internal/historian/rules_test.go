package historian

import (
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func f(v float64) *float64 { return &v }

func TestForPath(t *testing.T) {
	rules := Rules{Deadband: 0.1, Tags: []TagRule{
		{Path: "plc:Temp", Deadband: f(0.5)},
		{Path: "plc:Diag", Prefix: true, Skip: true},
		{Path: "plc:Diag/Keep", Prefix: true, Deadband: f(2)},
		{Path: "plc:", Prefix: true, Deadband: f(1)},
		{Path: "plc:DiagExact"}, // exact beats any prefix, uses the default
	}}
	tests := []struct {
		path string
		want policy
	}{
		{"plc:Temp", policy{deadband: 0.5}},
		{"plc:Diag/Count", policy{deadband: 0.1, skip: true}},
		{"plc:Diag/Keep/A", policy{deadband: 2}}, // longer prefix wins
		{"plc:DiagExact", policy{deadband: 0.1}},
		{"plc:Other", policy{deadband: 1}},
		{"mqtt:Temp", policy{deadband: 0.1}}, // no rule: the default
	}
	rs := compile(rules)
	for _, tc := range tests {
		if got := rs.forPath(tc.path); got != tc.want {
			t.Errorf("forPath(%q) = %+v, want %+v", tc.path, got, tc.want)
		}
	}
	if got := compile(Rules{}).forPath("plc:Temp"); got != (policy{}) {
		t.Errorf("no rules: %+v, want store every change", got)
	}
}

// The deadband through the real record loop: each step is enqueued and
// flushed, and the row count says whether it was stored.
func TestDeadband(t *testing.T) {
	type step struct {
		value   any
		quality string
		advance time.Duration
		stored  bool
	}
	g := func(v any, stored bool) step { return step{v, "Good", time.Second, stored} }
	tests := []struct {
		name  string
		rules Rules
		steps []step
	}{
		{"inside and outside", Rules{Deadband: 0.5}, []step{g(10.0, true), g(10.3, false), g(10.6, true)}},
		{"exactly the deadband is inside", Rules{Deadband: 0.5}, []step{g(10.0, true), g(10.5, false), g(9.5, false)}},
		{"slow drift is caught", Rules{Deadband: 0.5}, []step{g(10.0, true), g(10.2, false), g(10.4, false), g(10.6, true), g(10.8, false)}},
		{"quality change inside the deadband", Rules{Deadband: 0.5}, []step{g(10.0, true), {10.1, "Bad", time.Second, true}}},
		{"heartbeat inside the deadband", Rules{Deadband: 0.5}, []step{g(10.0, true), {10.1, "Good", 59 * time.Second, false}, {10.1, "Good", 2 * time.Second, true}}},
		{"PLC integers", Rules{Deadband: 2}, []step{g(int16(100), true), g(int16(102), false), g(int16(103), true)}},
		{"bools ignore it", Rules{Deadband: 5}, []step{g(true, true), g(false, true), g(false, false)}},
		{"text ignores it", Rules{Deadband: 5}, []step{g("1", true), g("2", true)}},
		{"no deadband: any change", Rules{}, []step{g(10.0, true), g(10.01, true)}},
		{"per-tag rule", Rules{Deadband: 5, Tags: []TagRule{{Path: "plc:A", Deadband: f(0.1)}}}, []step{g(10.0, true), g(10.2, true)}},
		{"skipped tag", Rules{Tags: []TagRule{{Path: "plc:", Prefix: true, Skip: true}}}, []step{g(1.0, false), g(2.0, false)}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := openMem(t)
			clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
			h.now = clock.now
			h.SetRules(tc.rules)
			want := 0
			for i, s := range tc.steps {
				clock.add(s.advance)
				h.Enqueue(tagstore.TagUpdate{Path: "plc:A", State: tagstore.TagState{Value: s.value, Quality: s.quality, TS: int64(i + 1)}})
				h.Flush()
				if s.stored {
					want++
				}
				if got := count(t, h, "plc:A"); got != want {
					t.Fatalf("after step %d (%v %s): %d rows, want %d", i, s.value, s.quality, got, want)
				}
			}
		})
	}
}

func TestRetentionFromRules(t *testing.T) {
	h := openMem(t)
	h.SetRetention(time.Hour)
	if got := h.retentionNow(); got != time.Hour {
		t.Errorf("retention = %v, want the runtime's 1h", got)
	}
	h.SetRules(Rules{Retention: 48 * time.Hour})
	if got := h.retentionNow(); got != 48*time.Hour {
		t.Errorf("retention = %v, want the project's 48h", got)
	}
	h.SetRules(Rules{})
	if got := h.retentionNow(); got != time.Hour {
		t.Errorf("retention = %v after the project drops it, want 1h again", got)
	}
}
