package alarmstore

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarms"
)

// A database made before format 3 gets the expr and reason columns; its
// rows read back with them empty, and new events store them.
func TestOldDatabaseGetsTheNewColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "alarms.db")
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`CREATE TABLE alarm_events (
		id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, rule_name TEXT NOT NULL, binding TEXT NOT NULL,
		condition TEXT NOT NULL, threshold REAL NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL,
		value REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0,
		triggered_at INTEGER NOT NULL, normal_at INTEGER, acked_at INTEGER);
		INSERT INTO alarm_events VALUES ('old-1','old','Old','plc:T','gt',100,'warning','m',150,1,0,1,NULL,NULL);`); err != nil {
		t.Fatal(err)
	}
	old.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	now := time.Now()
	tests := []alarms.Event{
		{ID: "new-1", RuleID: "new", RuleName: "New", Binding: "plc:T", Expr: "{plc:T} > 100", Severity: "critical", Message: "m",
			Value: 150, Active: true, Reason: "input {plc:T} is Bad", TriggeredAt: now},
		{ID: "new-2", RuleID: "new2", RuleName: "New 2", Binding: "plc:U", Expr: "{plc:U} > 1", Severity: "info", Message: "m",
			Value: 2, Active: true, TriggeredAt: now.Add(time.Second)},
	}
	for _, ev := range tests {
		if err := s.Record(ev); err != nil {
			t.Fatalf("Record %s: %v", ev.ID, err)
		}
	}
	// The reason is updated in place.
	cleared := tests[0]
	cleared.Reason = ""
	if err := s.Record(cleared); err != nil {
		t.Fatal(err)
	}
	got, err := s.Query(context.Background(), QueryOptions{To: now.Add(time.Hour).UnixNano()})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	byID := map[string]alarms.Event{}
	for _, ev := range got {
		byID[ev.ID] = ev
	}
	if ev := byID["old-1"]; ev.Expr != "" || ev.Reason != "" || ev.Condition != "gt" || ev.Threshold != 100 {
		t.Errorf("old row %+v", ev)
	}
	if ev := byID["new-1"]; ev.Expr != "{plc:T} > 100" || ev.Reason != "" || ev.Condition != "" {
		t.Errorf("new-1 %+v", ev)
	}
	if ev := byID["new-2"]; ev.Expr != "{plc:U} > 1" {
		t.Errorf("new-2 %+v", ev)
	}
	// Opening again does not add the columns twice.
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("second Open: %v", err)
	}
	s2.Close()
}
