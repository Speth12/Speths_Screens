// Package alarmstore persists alarm events to SQLite so alarm history survives
// restarts. Each event is upserted on every state transition (triggered,
// normal, acked), so the row always reflects the latest state.
package alarmstore

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/Speth12/speths-screens/internal/alarms"
	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS alarm_events (
	id           TEXT PRIMARY KEY,
	rule_id      TEXT NOT NULL,
	rule_name    TEXT NOT NULL,
	binding      TEXT NOT NULL,
	condition    TEXT NOT NULL,
	threshold    REAL NOT NULL,
	severity     TEXT NOT NULL,
	message      TEXT NOT NULL,
	value        REAL NOT NULL,
	active       INTEGER NOT NULL DEFAULT 1,
	acked        INTEGER NOT NULL DEFAULT 0,
	triggered_at INTEGER NOT NULL,
	normal_at    INTEGER,
	acked_at     INTEGER
);
CREATE INDEX IF NOT EXISTS ae_triggered ON alarm_events(triggered_at);
CREATE INDEX IF NOT EXISTS ae_severity  ON alarm_events(severity);
`

// AlarmStore is a SQLite-backed log of alarm events.
type AlarmStore struct {
	db   *sql.DB
	mu   sync.Mutex
	stmt *sql.Stmt
}

// Open opens (or creates) an alarm event database at path.
func Open(path string) (*AlarmStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, p := range []string{"PRAGMA journal_mode=WAL", "PRAGMA synchronous=NORMAL"} {
		if _, err := db.Exec(p); err != nil {
			return nil, err
		}
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	stmt, err := db.Prepare(`
		INSERT INTO alarm_events
			(id, rule_id, rule_name, binding, condition, threshold, severity,
			 message, value, active, acked, triggered_at, normal_at, acked_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			value        = excluded.value,
			active       = excluded.active,
			acked        = excluded.acked,
			normal_at    = excluded.normal_at,
			acked_at     = excluded.acked_at
	`)
	if err != nil {
		return nil, err
	}
	return &AlarmStore{db: db, stmt: stmt}, nil
}

// Record upserts an alarm event. Call on every state transition.
func (s *AlarmStore) Record(ev alarms.Event) error {
	var normalAt, ackedAt *int64
	if ev.NormalAt != nil {
		v := ev.NormalAt.UnixNano()
		normalAt = &v
	}
	if ev.AckedAt != nil {
		v := ev.AckedAt.UnixNano()
		ackedAt = &v
	}
	active := 0
	if ev.Active {
		active = 1
	}
	acked := 0
	if ev.Acked {
		acked = 1
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.stmt.Exec(
		ev.ID, ev.RuleID, ev.RuleName, ev.Binding,
		string(ev.Condition), ev.Threshold,
		string(ev.Severity), ev.Message,
		ev.Value, active, acked,
		ev.TriggeredAt.UnixNano(), normalAt, ackedAt,
	)
	return err
}

// QueryOptions filters for Query.
type QueryOptions struct {
	From     int64  // Unix nanos, 0 = no lower bound
	To       int64  // Unix nanos, 0 = now
	Severity string // "" = all
	Limit    int    // 0 = 500
}

// Query returns alarm events ordered by triggered_at DESC (newest first).
func (s *AlarmStore) Query(ctx context.Context, opts QueryOptions) ([]alarms.Event, error) {
	if opts.To == 0 {
		opts.To = time.Now().UnixNano()
	}
	limit := opts.Limit
	if limit <= 0 {
		limit = 500
	}

	args := []any{opts.To}
	where := "triggered_at <= ?"
	if opts.From > 0 {
		where += " AND triggered_at >= ?"
		args = append(args, opts.From)
	}
	if opts.Severity != "" {
		where += " AND severity = ?"
		args = append(args, opts.Severity)
	}
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, rule_id, rule_name, binding, condition, threshold, severity,
		        message, value, active, acked, triggered_at, normal_at, acked_at
		 FROM alarm_events WHERE `+where+
			` ORDER BY triggered_at DESC LIMIT ?`,
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []alarms.Event
	for rows.Next() {
		var ev alarms.Event
		var active, acked int
		var triggeredNs int64
		var normalNs, ackedNs sql.NullInt64
		if err := rows.Scan(
			&ev.ID, &ev.RuleID, &ev.RuleName, &ev.Binding,
			&ev.Condition, &ev.Threshold,
			&ev.Severity, &ev.Message,
			&ev.Value, &active, &acked,
			&triggeredNs, &normalNs, &ackedNs,
		); err != nil {
			return nil, err
		}
		ev.Active = active != 0
		ev.Acked = acked != 0
		ev.TriggeredAt = time.Unix(0, triggeredNs)
		if normalNs.Valid {
			t := time.Unix(0, normalNs.Int64)
			ev.NormalAt = &t
		}
		if ackedNs.Valid {
			t := time.Unix(0, ackedNs.Int64)
			ev.AckedAt = &t
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

// Close shuts down the database.
func (s *AlarmStore) Close() error {
	if s.stmt != nil {
		_ = s.stmt.Close()
	}
	return s.db.Close()
}
