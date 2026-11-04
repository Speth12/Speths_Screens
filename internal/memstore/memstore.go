// Package memstore keeps retained memory-tag values across a runtime restart
// (Phase 4): one SQLite row per datasource and tag, the value as JSON. The
// memory driver decides when to save; this package only stores.
package memstore

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS memory_values (
	datasource TEXT NOT NULL,
	path       TEXT NOT NULL,
	value      TEXT NOT NULL,
	saved_at   INTEGER NOT NULL,
	PRIMARY KEY (datasource, path)
);
`

// Store is a SQLite file of retained values. It implements drivers.Retainer.
type Store struct {
	db *sql.DB
	mu sync.Mutex
}

// Open opens (or creates) the store at path.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, p := range []string{"PRAGMA journal_mode=WAL", "PRAGMA synchronous=NORMAL"} {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, err
		}
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Load returns the retained values of one datasource, by tag path.
func (s *Store) Load(datasource string) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows, err := s.db.Query(`SELECT path, value FROM memory_values WHERE datasource = ?`, datasource)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]any{}
	for rows.Next() {
		var path, raw string
		if err := rows.Scan(&path, &raw); err != nil {
			return nil, err
		}
		var v any
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			continue // a value this build cannot read is left for its initial
		}
		out[path] = v
	}
	return out, rows.Err()
}

// Save stores values for one datasource in one transaction.
func (s *Store) Save(datasource string, values map[string]any) error {
	if len(values) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO memory_values (datasource, path, value, saved_at) VALUES (?,?,?,?)
		ON CONFLICT(datasource, path) DO UPDATE SET value = excluded.value, saved_at = excluded.saved_at`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()
	now := time.Now().UnixNano()
	for path, v := range values {
		raw, err := json.Marshal(v)
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", path, err)
		}
		if _, err := stmt.Exec(datasource, path, string(raw), now); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// Close closes the file.
func (s *Store) Close() error { return s.db.Close() }
