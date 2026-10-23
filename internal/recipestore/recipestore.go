// Package recipestore tracks recipe application history and pending approvals.
//
// Every recipe apply is logged as an immutable run record. Operators may also
// submit a pending request that a Supervisor/Engineer must approve before the
// recipe is executed.
package recipestore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Status of a pending recipe request.
type Status string

const (
	StatusPending  Status = "pending"
	StatusApproved Status = "approved"
	StatusRejected Status = "rejected"
)

// Entry is one tag write within a recipe.
type Entry struct {
	Binding string `json:"binding"`
	Value   any    `json:"value"`
}

// Run is an immutable record of a completed recipe application.
type Run struct {
	ID          int64     `json:"id"`
	RecipeID    string    `json:"recipeId"`
	RecipeName  string    `json:"recipeName"`
	AppliedBy   string    `json:"appliedBy"`
	AppliedAt   time.Time `json:"appliedAt"`
	Entries     []Entry   `json:"entries"`
	AppliedCount int      `json:"appliedCount"`
	Errors      []string  `json:"errors,omitempty"`
}

// PendingRequest is a recipe application waiting for approval.
type PendingRequest struct {
	ID          int64     `json:"id"`
	RecipeID    string    `json:"recipeId"`
	RecipeName  string    `json:"recipeName"`
	RequestedBy string    `json:"requestedBy"`
	RequestedAt time.Time `json:"requestedAt"`
	Entries     []Entry   `json:"entries"`
	Status      Status    `json:"status"`
	ReviewedBy  string    `json:"reviewedBy,omitempty"`
	ReviewedAt  *time.Time `json:"reviewedAt,omitempty"`
	Note        string    `json:"note,omitempty"`
}

// Store persists recipe runs and pending approvals in SQLite.
type Store struct {
	db *sql.DB
}

// Open opens (or creates) a recipe store at path.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	return s, s.migrate()
}

// Close releases the database connection.
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS recipe_runs (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id     TEXT    NOT NULL,
		recipe_name   TEXT    NOT NULL,
		applied_by    TEXT    NOT NULL,
		applied_at    TEXT    NOT NULL,
		entries       TEXT    NOT NULL,
		applied_count INTEGER NOT NULL DEFAULT 0,
		errors        TEXT
	);
	CREATE TABLE IF NOT EXISTS recipe_pending (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		recipe_id     TEXT    NOT NULL,
		recipe_name   TEXT    NOT NULL,
		requested_by  TEXT    NOT NULL,
		requested_at  TEXT    NOT NULL,
		entries       TEXT    NOT NULL,
		status        TEXT    NOT NULL DEFAULT 'pending',
		reviewed_by   TEXT,
		reviewed_at   TEXT,
		note          TEXT
	);`)
	return err
}

// RecordRun appends an immutable run record.
func (s *Store) RecordRun(ctx context.Context, run Run) (int64, error) {
	entriesJSON, _ := json.Marshal(run.Entries)
	var errorsJSON *string
	if len(run.Errors) > 0 {
		b, _ := json.Marshal(run.Errors)
		v := string(b)
		errorsJSON = &v
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO recipe_runs (recipe_id, recipe_name, applied_by, applied_at, entries, applied_count, errors)
		 VALUES (?,?,?,?,?,?,?)`,
		run.RecipeID, run.RecipeName, run.AppliedBy,
		run.AppliedAt.UTC().Format(time.RFC3339),
		string(entriesJSON), run.AppliedCount, errorsJSON,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ListRuns returns recipe runs, newest first.
func (s *Store) ListRuns(ctx context.Context, recipeID string, limit int) ([]*Run, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows *sql.Rows
	var err error
	if recipeID != "" {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, recipe_id, recipe_name, applied_by, applied_at, entries, applied_count, errors
			 FROM recipe_runs WHERE recipe_id=? ORDER BY id DESC LIMIT ?`, recipeID, limit)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, recipe_id, recipe_name, applied_by, applied_at, entries, applied_count, errors
			 FROM recipe_runs ORDER BY id DESC LIMIT ?`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRuns(rows)
}

// CreatePending creates a pending approval request and returns its ID.
func (s *Store) CreatePending(ctx context.Context, req PendingRequest) (int64, error) {
	entriesJSON, _ := json.Marshal(req.Entries)
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO recipe_pending (recipe_id, recipe_name, requested_by, requested_at, entries, status)
		 VALUES (?,?,?,?,?,?)`,
		req.RecipeID, req.RecipeName, req.RequestedBy,
		req.RequestedAt.UTC().Format(time.RFC3339),
		string(entriesJSON), string(StatusPending),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// GetPending returns a pending request by ID.
func (s *Store) GetPending(ctx context.Context, id int64) (*PendingRequest, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, recipe_id, recipe_name, requested_by, requested_at, entries, status, reviewed_by, reviewed_at, note
		 FROM recipe_pending WHERE id=?`, id)
	return scanPending(row)
}

// ListPending returns pending requests filtered by status (empty = all).
func (s *Store) ListPending(ctx context.Context, status Status, limit int) ([]*PendingRequest, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, recipe_id, recipe_name, requested_by, requested_at, entries, status, reviewed_by, reviewed_at, note
			 FROM recipe_pending WHERE status=? ORDER BY id DESC LIMIT ?`, string(status), limit)
	} else {
		rows, err = s.db.QueryContext(ctx,
			`SELECT id, recipe_id, recipe_name, requested_by, requested_at, entries, status, reviewed_by, reviewed_at, note
			 FROM recipe_pending ORDER BY id DESC LIMIT ?`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*PendingRequest
	for rows.Next() {
		p, err := scanPending(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Approve marks a pending request as approved, returns the request for execution.
func (s *Store) Approve(ctx context.Context, id int64, reviewedBy, note string) (*PendingRequest, error) {
	return s.review(ctx, id, StatusApproved, reviewedBy, note)
}

// Reject marks a pending request as rejected.
func (s *Store) Reject(ctx context.Context, id int64, reviewedBy, note string) (*PendingRequest, error) {
	return s.review(ctx, id, StatusRejected, reviewedBy, note)
}

func (s *Store) review(ctx context.Context, id int64, status Status, reviewedBy, note string) (*PendingRequest, error) {
	req, err := s.GetPending(ctx, id)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, fmt.Errorf("recipestore: pending request %d not found", id)
	}
	if req.Status != StatusPending {
		return nil, errors.New("recipestore: request already reviewed")
	}
	now := time.Now().UTC()
	_, err = s.db.ExecContext(ctx,
		`UPDATE recipe_pending SET status=?, reviewed_by=?, reviewed_at=?, note=? WHERE id=?`,
		string(status), reviewedBy, now.Format(time.RFC3339), note, id,
	)
	if err != nil {
		return nil, err
	}
	req.Status = status
	req.ReviewedBy = reviewedBy
	req.ReviewedAt = &now
	req.Note = note
	return req, nil
}

// ── helpers ────────────────────────────────────────────────────────────────

type scanner interface {
	Scan(...any) error
}

func scanRuns(rows *sql.Rows) ([]*Run, error) {
	var out []*Run
	for rows.Next() {
		var r Run
		var at, entriesStr string
		var errorsStr *string
		if err := rows.Scan(&r.ID, &r.RecipeID, &r.RecipeName, &r.AppliedBy, &at, &entriesStr, &r.AppliedCount, &errorsStr); err != nil {
			return nil, err
		}
		r.AppliedAt, _ = time.Parse(time.RFC3339, at)
		_ = json.Unmarshal([]byte(entriesStr), &r.Entries)
		if errorsStr != nil {
			_ = json.Unmarshal([]byte(*errorsStr), &r.Errors)
		}
		out = append(out, &r)
	}
	return out, rows.Err()
}

func scanPending(row scanner) (*PendingRequest, error) {
	var p PendingRequest
	var at, entriesStr, status string
	var reviewedBy, reviewedAt, note *string
	err := row.Scan(&p.ID, &p.RecipeID, &p.RecipeName, &p.RequestedBy, &at, &entriesStr, &status, &reviewedBy, &reviewedAt, &note)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.RequestedAt, _ = time.Parse(time.RFC3339, at)
	_ = json.Unmarshal([]byte(entriesStr), &p.Entries)
	p.Status = Status(status)
	if reviewedBy != nil {
		p.ReviewedBy = *reviewedBy
	}
	if reviewedAt != nil {
		t, _ := time.Parse(time.RFC3339, *reviewedAt)
		p.ReviewedAt = &t
	}
	if note != nil {
		p.Note = *note
	}
	return &p, nil
}
