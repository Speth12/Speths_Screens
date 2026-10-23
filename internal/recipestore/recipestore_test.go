package recipestore

import (
	"context"
	"testing"
	"time"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestRecordAndListRuns(t *testing.T) {
	s := open(t)
	ctx := context.Background()

	id, err := s.RecordRun(ctx, Run{
		RecipeID:     "r1",
		RecipeName:   "Startup",
		AppliedBy:    "admin",
		AppliedAt:    time.Now(),
		Entries:      []Entry{{Binding: "opc1:Pump.Run", Value: true}},
		AppliedCount: 1,
	})
	if err != nil || id == 0 {
		t.Fatalf("RecordRun: %v (id=%d)", err, id)
	}

	runs, err := s.ListRuns(ctx, "r1", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 {
		t.Fatalf("want 1 run, got %d", len(runs))
	}
	if runs[0].AppliedBy != "admin" {
		t.Errorf("appliedBy: %q", runs[0].AppliedBy)
	}
	if len(runs[0].Entries) != 1 {
		t.Errorf("entries not persisted: %v", runs[0].Entries)
	}
}

func TestRunErrors(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	_, err := s.RecordRun(ctx, Run{
		RecipeID:   "r2",
		RecipeName: "Test",
		AppliedBy:  "eng",
		AppliedAt:  time.Now(),
		Errors:     []string{"opc1:Tag: write failed"},
	})
	if err != nil {
		t.Fatal(err)
	}
	runs, _ := s.ListRuns(ctx, "r2", 5)
	if len(runs[0].Errors) != 1 {
		t.Errorf("errors not persisted: %v", runs[0].Errors)
	}
}

func TestPendingApprovalFlow(t *testing.T) {
	s := open(t)
	ctx := context.Background()

	pendingID, err := s.CreatePending(ctx, PendingRequest{
		RecipeID:    "r3",
		RecipeName:  "Shutdown",
		RequestedBy: "operator1",
		RequestedAt: time.Now(),
		Entries:     []Entry{{Binding: "opc1:Motor.Stop", Value: true}},
	})
	if err != nil || pendingID == 0 {
		t.Fatalf("CreatePending: %v", err)
	}

	req, err := s.GetPending(ctx, pendingID)
	if err != nil || req == nil {
		t.Fatalf("GetPending: %v", err)
	}
	if req.Status != StatusPending {
		t.Errorf("status: %q", req.Status)
	}

	list, _ := s.ListPending(ctx, StatusPending, 10)
	if len(list) != 1 {
		t.Errorf("want 1 pending, got %d", len(list))
	}

	approved, err := s.Approve(ctx, pendingID, "supervisor1", "looks good")
	if err != nil {
		t.Fatalf("Approve: %v", err)
	}
	if approved.Status != StatusApproved {
		t.Errorf("status after approve: %q", approved.Status)
	}
	if approved.ReviewedBy != "supervisor1" {
		t.Errorf("reviewedBy: %q", approved.ReviewedBy)
	}
}

func TestRejectPending(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	id, _ := s.CreatePending(ctx, PendingRequest{
		RecipeID: "r4", RecipeName: "N", RequestedBy: "op", RequestedAt: time.Now(),
	})
	_, err := s.Reject(ctx, id, "eng1", "not safe")
	if err != nil {
		t.Fatal(err)
	}
	req, _ := s.GetPending(ctx, id)
	if req.Status != StatusRejected {
		t.Errorf("status: %q", req.Status)
	}
}

func TestDoubleReviewError(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	id, _ := s.CreatePending(ctx, PendingRequest{
		RecipeID: "r5", RecipeName: "N", RequestedBy: "op", RequestedAt: time.Now(),
	})
	s.Approve(ctx, id, "eng", "")
	_, err := s.Approve(ctx, id, "eng", "again")
	if err == nil {
		t.Error("expected error on double review")
	}
}

func TestListRunsAllRecipes(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	s.RecordRun(ctx, Run{RecipeID: "r1", RecipeName: "A", AppliedBy: "u", AppliedAt: time.Now()})
	s.RecordRun(ctx, Run{RecipeID: "r2", RecipeName: "B", AppliedBy: "u", AppliedAt: time.Now()})
	all, _ := s.ListRuns(ctx, "", 10)
	if len(all) != 2 {
		t.Errorf("want 2 runs, got %d", len(all))
	}
}
