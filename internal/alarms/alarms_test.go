package alarms

import (
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func good(v any) tagstore.TagState { return tagstore.TagState{Value: v, Quality: "Good"} }

// highTemp raises at value > 100 on "plc:T".
func highTemp() *Engine {
	e := New()
	e.SetRules([]Rule{{ID: "r1", Name: "High temp", Expr: "{plc:T} > 100", Severity: SeverityWarning}})
	return e
}

func TestSubscriptionDeliversChangesInOrder(t *testing.T) {
	e := highTemp()
	s := e.SubscribeN(10)
	defer s.Close()
	for _, v := range []float64{105, 95, 110} { // raise, normal, raise again
		e.Evaluate("plc:T", good(v))
	}
	<-s.C()
	changes, resync := s.Next()
	if resync {
		t.Fatal("resync without an overflow")
	}
	want := []struct {
		active bool
		value  float64
	}{{true, 105}, {false, 95}, {true, 110}}
	if len(changes) != len(want) {
		t.Fatalf("got %d changes, want %d: %+v", len(changes), len(want), changes)
	}
	for i, w := range want {
		if changes[i].Active != w.active || changes[i].Value != w.value {
			t.Errorf("change %d = active %v value %v, want %v %v", i, changes[i].Active, changes[i].Value, w.active, w.value)
		}
	}
}

func TestOverflowAsksForResync(t *testing.T) {
	e := highTemp()
	s := e.SubscribeN(2)
	defer s.Close()
	for _, v := range []float64{105, 95, 110, 90} { // four changes into a queue of two
		e.Evaluate("plc:T", good(v))
	}
	changes, resync := s.Next()
	if !resync || len(changes) != 0 {
		t.Fatalf("got %d changes, resync %v; want a resync and no partial changes", len(changes), resync)
	}
	// The snapshot gives the current state.
	if evs := e.Events(); len(evs) != 1 || evs[0].Active || evs[0].Value != 90 {
		t.Errorf("snapshot = %+v, want one inactive event at 90", evs)
	}
	// After the resync, changes flow again.
	e.Evaluate("plc:T", good(120.0))
	changes, resync = s.Next()
	if resync || len(changes) != 1 || !changes[0].Active {
		t.Errorf("after resync: %+v, resync %v", changes, resync)
	}
}

// Evaluate runs in the runtime pump: a subscriber nobody reads must never
// slow it down.
func TestStalledSubscriberDoesNotBlockEvaluate(t *testing.T) {
	e := highTemp()
	s := e.SubscribeN(1)
	defer s.Close()
	start := time.Now()
	for i := range 10000 {
		e.Evaluate("plc:T", tagstore.TagState{Value: float64(90 + 20*(i%2)), Quality: "Good"}) // a change on every call
	}
	if el := time.Since(start); el > 500*time.Millisecond {
		t.Errorf("10000 evaluations took %v with a stalled subscriber", el)
	}
}

func TestSubscribeBeforeSnapshotMissesNothing(t *testing.T) {
	e := highTemp()
	e.Evaluate("plc:T", good(105.0))
	s := e.Subscribe()
	defer s.Close()
	snapshot := e.Events()
	e.Evaluate("plc:T", good(95.0)) // a change right after the snapshot
	changes, _ := s.Next()
	if len(snapshot) != 1 || !snapshot[0].Active || len(changes) != 1 || changes[0].Active {
		t.Errorf("snapshot %+v, changes %+v", snapshot, changes)
	}
}

func TestClosedSubscriptionGetsNothing(t *testing.T) {
	e := highTemp()
	s := e.Subscribe()
	s.Close()
	e.Evaluate("plc:T", good(105.0))
	if changes, resync := s.Next(); len(changes) != 0 || resync {
		t.Errorf("after Close: %+v %v", changes, resync)
	}
	e.mu.RLock()
	n := len(e.subs)
	e.mu.RUnlock()
	if n != 0 {
		t.Errorf("%d subscriptions left after Close", n)
	}
}

// Alarms fire on every number type a driver delivers; OPC UA gives PLC
// integers in their own sizes (INT as int16, WORD as uint16, ...).
func TestAlarmOnEveryNumberType(t *testing.T) {
	tests := []struct {
		name  string
		value any
		fires bool
	}{
		{"LREAL float64", float64(150), true},
		{"REAL float32", float32(150), true},
		{"SINT int8", int8(120), true},
		{"INT int16", int16(150), true},
		{"DINT int32", int32(150), true},
		{"LINT int64", int64(150), true},
		{"BYTE uint8", uint8(150), true},
		{"WORD uint16", uint16(150), true},
		{"DWORD uint32", uint32(150), true},
		{"ULINT uint64", uint64(150), true},
		{"int", 150, true},
		{"uint", uint(150), true},
		{"INT below the threshold", int16(50), false},
		{"text is not evaluated", "150", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := highTemp()
			e.Evaluate("plc:T", good(tc.value))
			evs := e.Events()
			if fired := len(evs) == 1 && evs[0].Active; fired != tc.fires {
				t.Errorf("value %v (%T): fired %v, want %v", tc.value, tc.value, fired, tc.fires)
			}
		})
	}
}

func bad(v any) tagstore.TagState {
	return tagstore.TagState{Value: v, Quality: "Bad", Reason: "no answer"}
}

// A Bad input neither raises nor clears an alarm: the alarm keeps its state
// and says why, until the input is back.
func TestBadInputKeepsTheState(t *testing.T) {
	type step struct {
		state  tagstore.TagState
		active bool
		reason string
	}
	tests := []struct {
		name  string
		steps []step
	}{
		{"Bad while active stays active", []step{
			{good(150.0), true, ""},
			{bad(150.0), true, "input {plc:T} is Bad"},
			{bad(50.0), true, "input {plc:T} is Bad"},
			{good(150.0), true, ""},
		}},
		{"Bad while active, back below", []step{
			{good(150.0), true, ""},
			{bad(150.0), true, "input {plc:T} is Bad"},
			{good(50.0), false, ""},
		}},
		{"Bad before any alarm raises nothing", []step{
			{bad(150.0), false, ""},
			{good(150.0), true, ""},
		}},
		{"Bad while normal stays normal", []step{
			{good(150.0), true, ""},
			{good(50.0), false, ""},
			{bad(150.0), false, "input {plc:T} is Bad"},
			{good(60.0), false, ""},
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := highTemp()
			for i, s := range tc.steps {
				e.Evaluate("plc:T", s.state)
				evs := e.Events()
				active, reason := false, ""
				if len(evs) == 1 {
					active, reason = evs[0].Active, evs[0].Reason
				}
				if active != s.active || reason != s.reason {
					t.Errorf("step %d: active %v reason %q, want %v %q", i, active, reason, s.active, s.reason)
				}
			}
		})
	}
}

func TestReasonChangesAreSent(t *testing.T) {
	e := highTemp()
	s := e.SubscribeN(10)
	defer s.Close()
	e.Evaluate("plc:T", good(150.0))
	e.Evaluate("plc:T", bad(150.0))
	e.Evaluate("plc:T", bad(140.0)) // same reason: nothing new
	e.Evaluate("plc:T", good(150.0))
	changes, _ := s.Next()
	var got []string
	for _, c := range changes {
		got = append(got, c.Reason)
	}
	if len(got) != 3 || got[0] != "" || got[1] != "input {plc:T} is Bad" || got[2] != "" {
		t.Errorf("reasons sent: %q", got)
	}
}

func TestExpressionOverSeveralTags(t *testing.T) {
	e := New()
	e.SetRules([]Rule{{ID: "r", Name: "Tank high, inlet open", Expr: "{ns:Tank1/Level} > 95 && {plc:Inlet}", Severity: SeverityCritical, Message: "m"}})
	e.Evaluate("ns:Tank1/Level", good(97.0))
	if len(e.Events()) != 0 {
		t.Fatal("raised before the inlet tag arrived")
	}
	e.Evaluate("plc:Inlet", good(true))
	evs := e.Events()
	if len(evs) != 1 || !evs[0].Active {
		t.Fatalf("events %+v, want one active", evs)
	}
	ev := evs[0]
	if ev.Binding != "ns:Tank1/Level" || ev.Value != 97 || ev.Expr != "{ns:Tank1/Level} > 95 && {plc:Inlet}" || ev.Condition != "" {
		t.Errorf("event %+v", ev)
	}
	e.Evaluate("plc:Inlet", good(false))
	if e.Events()[0].Active {
		t.Error("still active with the inlet closed")
	}
	// Tags no rule reads are ignored.
	e.Evaluate("plc:Other", good(1.0))
	e.mu.RLock()
	_, kept := e.tags["plc:Other"]
	e.mu.RUnlock()
	if kept {
		t.Error("kept a tag no rule reads")
	}
}

func TestRuleThatDoesNotCompileIsSkipped(t *testing.T) {
	e := New()
	e.SetRules([]Rule{{ID: "broken", Expr: "{plc:T} >"}, {ID: "ok", Expr: "{plc:T} > 1"}})
	e.Evaluate("plc:T", good(5.0))
	evs := e.Events()
	if len(evs) != 1 || evs[0].RuleID != "ok" {
		t.Errorf("events %+v, want only rule ok", evs)
	}
	if n := len(e.Rules()); n != 2 {
		t.Errorf("Rules() = %d, want both", n)
	}
}
