package runtime

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarms"
	"github.com/Speth12/Speths_Screens/internal/alarmstore"
)

// When the alarm store falls behind and changes are dropped, history still
// ends on the current alarm state.
func TestAlarmHistoryCatchesUpAfterFallingBehind(t *testing.T) {
	old := alarmHistoryQueue
	alarmHistoryQueue = 1 // fall behind at once
	t.Cleanup(func() { alarmHistoryQueue = old })

	store, err := alarmstore.Open(filepath.Join(t.TempDir(), "alarms.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	r := New(nil, nil)
	r.AlarmStore = store
	r.Alarms.SetRules([]alarms.Rule{{ID: "r1", Name: "High", Binding: "plc:T", Condition: alarms.CondGT, Threshold: 100, Severity: alarms.SeverityWarning}})
	r.Start(context.Background())
	t.Cleanup(r.Stop)

	// Far more changes than SQLite can write one by one.
	for i := range 2000 {
		r.Alarms.Evaluate("plc:T", float64(90+20*(i%2)))
	}
	want := r.Alarms.Events()
	if len(want) != 1 {
		t.Fatalf("engine has %d events", len(want))
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		evs, err := store.Query(context.Background(), alarmstore.QueryOptions{})
		if err != nil {
			t.Fatal(err)
		}
		if len(evs) == 1 && evs[0].Active == want[0].Active && evs[0].Value == want[0].Value {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("history = %+v, want the engine's state %+v", evs, want[0])
		}
		time.Sleep(20 * time.Millisecond)
	}
}
