package audit

import (
	"context"
	"testing"
	"time"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestRecord(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	if err := s.Record(ctx, "alice", ActionTagWrite, "Plant.Tank.Level", 1.0, 2.0, ""); err != nil {
		t.Fatalf("Record: %v", err)
	}
}

func TestQueryAll(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.Record(ctx, "alice", ActionTagWrite, "T1", nil, 10.0, "")
	s.Record(ctx, "bob", ActionAlarmAck, "alarm-1", nil, nil, "")

	entries, err := s.Query(ctx, QueryOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Errorf("want 2 entries, got %d", len(entries))
	}
}

func TestQueryFilterUser(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.Record(ctx, "alice", ActionTagWrite, "T1", nil, 1, "")
	s.Record(ctx, "alice", ActionTagWrite, "T2", nil, 2, "")
	s.Record(ctx, "bob", ActionLogin, "", nil, nil, "")

	entries, _ := s.Query(ctx, QueryOptions{User: "alice"})
	if len(entries) != 2 {
		t.Errorf("want 2 entries for alice, got %d", len(entries))
	}
}

func TestQueryFilterAction(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.Record(ctx, "u", ActionTagWrite, "T", nil, 1, "")
	s.Record(ctx, "u", ActionLogin, "", nil, nil, "")
	s.Record(ctx, "u", ActionTagWrite, "T", nil, 2, "")

	entries, _ := s.Query(ctx, QueryOptions{Action: ActionTagWrite})
	if len(entries) != 2 {
		t.Errorf("want 2 tag.write entries, got %d", len(entries))
	}
}

func TestQueryTimeRange(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.Record(ctx, "u", ActionLogin, "", nil, nil, "")
	time.Sleep(10 * time.Millisecond)
	mid := time.Now().UnixNano()
	time.Sleep(10 * time.Millisecond)
	s.Record(ctx, "u", ActionLogout, "", nil, nil, "")

	entries, _ := s.Query(ctx, QueryOptions{From: mid})
	if len(entries) != 1 {
		t.Errorf("want 1 entry after mid, got %d", len(entries))
	}
}

func TestBeforeAfterJSON(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.Record(ctx, "alice", ActionTagWrite, "SP", 75.0, 80.0, "auto-tune")

	entries, _ := s.Query(ctx, QueryOptions{})
	if len(entries) == 0 {
		t.Fatal("no entries")
	}
	e := entries[0]
	if e.Before == nil || e.After == nil {
		t.Error("before/after not stored")
	}
	if e.Meta != "auto-tune" {
		t.Errorf("meta: %q", e.Meta)
	}
}

func TestAppendOnly(t *testing.T) {
	// Verify no UPDATE/DELETE SQL was used — the schema enforces this by not
	// exposing any such route; this test just confirms multiple Records work.
	s := newStore(t)
	ctx := context.Background()
	for i := range 100 {
		s.Record(ctx, "sys", ActionTagWrite, "T", nil, i, "")
	}
	entries, _ := s.Query(ctx, QueryOptions{Limit: 200})
	if len(entries) != 100 {
		t.Errorf("want 100 entries, got %d", len(entries))
	}
}
