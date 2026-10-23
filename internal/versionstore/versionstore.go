// Package versionstore keeps an append-only log of project snapshots in
// SQLite. Every deploy writes a new row; rows are never modified or deleted.
// The store returns the N most-recent versions and can restore any of them.
package versionstore

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS project_versions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	saved_at   INTEGER NOT NULL,
	label      TEXT    NOT NULL DEFAULT '',
	project    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS pv_saved ON project_versions(saved_at);
`

// Version is a stored project snapshot.
type Version struct {
	ID      int64           `json:"id"`
	SavedAt time.Time       `json:"savedAt"`
	Label   string          `json:"label"`
	Project json.RawMessage `json:"project"`
}

// VersionMeta is a Version without the full project JSON (for list responses).
type VersionMeta struct {
	ID      int64     `json:"id"`
	SavedAt time.Time `json:"savedAt"`
	Label   string    `json:"label"`
}

// Store is a SQLite-backed project version log.
type Store struct {
	db   *sql.DB
	mu   sync.Mutex
	ins  *sql.Stmt
}

// Open opens (or creates) the database at path.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, pragma := range []string{"PRAGMA journal_mode=WAL", "PRAGMA synchronous=NORMAL"} {
		if _, err := db.Exec(pragma); err != nil {
			return nil, err
		}
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	ins, err := db.Prepare(`INSERT INTO project_versions (saved_at, label, project) VALUES (?,?,?)`)
	if err != nil {
		return nil, err
	}
	return &Store{db: db, ins: ins}, nil
}

// Save appends a new version. label is optional (e.g. "manual save" or "").
func (s *Store) Save(ctx context.Context, project json.RawMessage, label string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	res, err := s.ins.ExecContext(ctx, time.Now().UnixNano(), label, string(project))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// List returns the N most-recent version metadata rows (no project JSON).
func (s *Store) List(ctx context.Context, limit int) ([]VersionMeta, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, saved_at, label FROM project_versions ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []VersionMeta
	for rows.Next() {
		var v VersionMeta
		var ns int64
		if err := rows.Scan(&v.ID, &ns, &v.Label); err != nil {
			return nil, err
		}
		v.SavedAt = time.Unix(0, ns)
		out = append(out, v)
	}
	return out, rows.Err()
}

// Get returns a single version including its full project JSON.
func (s *Store) Get(ctx context.Context, id int64) (*Version, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, saved_at, label, project FROM project_versions WHERE id = ?`, id)
	var v Version
	var ns int64
	var raw string
	if err := row.Scan(&v.ID, &ns, &v.Label, &raw); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	v.SavedAt = time.Unix(0, ns)
	v.Project = json.RawMessage(raw)
	return &v, nil
}

// Close shuts down the database.
func (s *Store) Close() error {
	if s.ins != nil {
		_ = s.ins.Close()
	}
	return s.db.Close()
}
