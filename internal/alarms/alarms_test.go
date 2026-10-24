package alarms

import (
	"testing"
	"time"
)

// highTemp raises at value > 100 on "plc:T".
func highTemp() *Engine {
	e := New()
	e.SetRules([]Rule{{ID: "r1", Name: "High temp", Binding: "plc:T", Condition: CondGT, Threshold: 100, Severity: SeverityWarning}})
	return e
}

func TestSubscriptionDeliversChangesInOrder(t *testing.T) {
	e := highTemp()
	s := e.SubscribeN(10)
	defer s.Close()
	for _, v := range []float64{105, 95, 110} { // raise, normal, raise again
		e.Evaluate("plc:T", v)
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
		e.Evaluate("plc:T", v)
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
	e.Evaluate("plc:T", 120)
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
		e.Evaluate("plc:T", float64(90+20*(i%2))) // a change on every call
	}
	if el := time.Since(start); el > 500*time.Millisecond {
		t.Errorf("10000 evaluations took %v with a stalled subscriber", el)
	}
}

func TestSubscribeBeforeSnapshotMissesNothing(t *testing.T) {
	e := highTemp()
	e.Evaluate("plc:T", 105)
	s := e.Subscribe()
	defer s.Close()
	snapshot := e.Events()
	e.Evaluate("plc:T", 95) // a change right after the snapshot
	changes, _ := s.Next()
	if len(snapshot) != 1 || !snapshot[0].Active || len(changes) != 1 || changes[0].Active {
		t.Errorf("snapshot %+v, changes %+v", snapshot, changes)
	}
}

func TestClosedSubscriptionGetsNothing(t *testing.T) {
	e := highTemp()
	s := e.Subscribe()
	s.Close()
	e.Evaluate("plc:T", 105)
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
			e.Evaluate("plc:T", tc.value)
			evs := e.Events()
			if fired := len(evs) == 1 && evs[0].Active; fired != tc.fires {
				t.Errorf("value %v (%T): fired %v, want %v", tc.value, tc.value, fired, tc.fires)
			}
		})
	}
}
