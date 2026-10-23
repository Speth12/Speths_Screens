// Package audit provides an append-only tamper-resistant audit trail for Speth's Screens.
//
// Every significant action — tag writes, alarm acks, recipe applies, logins,
// config changes — is recorded with a full before/after snapshot.  The
// underlying store is SQLite with no UPDATE or DELETE statements so rows
// cannot be modified after insertion.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	_ "modernc.org/sqlite"
)

// Action classifies what happened.
type Action string

const (
	ActionLogin         Action = "login"
	ActionLogout        Action = "logout"
	ActionTagWrite      Action = "tag.write"
	ActionAlarmAck      Action = "alarm.ack"
	ActionRecipeApply   Action = "recipe.apply"
	ActionProjectDeploy Action = "project.deploy"
	ActionUserCreate    Action = "user.create"
	ActionUserDelete    Action = "user.delete"
	ActionUserDisable   Action = "user.disable"
	ActionConfigChange  Action = "config.change"
)

// Entry is one immutable audit record.
type Entry struct {
	ID        int64           `json:"id"`
	Timestamp time.Time       `json:"timestamp"`
	User      string          `json:"user"`
	Action    Action          `json:"action"`
	Target    string          `json:"target"`
	Before    json.RawMessage `json:"before,omitempty"`
	After     json.RawMessage `json:"after,omitempty"`
	Meta      string          `json:"meta,omitempty"`
}

// QueryOptions filters audit log queries.
type QueryOptions struct {
	From   int64  // unix nano; 0 = no lower bound
	To     int64  // unix nano; 0 = no upper bound
	User   string // filter by username
	Action Action // filter by action
	Limit  int    // 0 = default 500
}

// Store is the append-only audit log.
type Store struct {
	db *sql.DB
}

// Open opens (or creates) an audit store at path.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	return s, s.migrate()
}

// Close releases the database.
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS audit_log (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		ts         INTEGER NOT NULL,
		user       TEXT    NOT NULL,
		action     TEXT    NOT NULL,
		target     TEXT    NOT NULL DEFAULT '',
		before_val TEXT,
		after_val  TEXT,
		meta       TEXT    NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(ts);
	CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user);
	CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);`)
	return err
}

// Record appends a new audit entry. before and after may be nil.
func (s *Store) Record(ctx context.Context, user string, action Action, target string, before, after any, meta string) error {
	bJSON, _ := json.Marshal(before)
	aJSON, _ := json.Marshal(after)
	if string(bJSON) == "null" {
		bJSON = nil
	}
	if string(aJSON) == "null" {
		aJSON = nil
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO audit_log (ts, user, action, target, before_val, after_val, meta)
		 VALUES (?,?,?,?,?,?,?)`,
		time.Now().UnixNano(), user, string(action), target,
		nullStr(bJSON), nullStr(aJSON), meta,
	)
	return err
}

// Query returns audit entries matching opts.
func (s *Store) Query(ctx context.Context, opts QueryOptions) ([]*Entry, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 500
	}

	q := `SELECT id, ts, user, action, target, before_val, after_val, meta
	      FROM audit_log WHERE 1=1`
	var args []any
	if opts.From > 0 {
		q += " AND ts >= ?"
		args = append(args, opts.From)
	}
	if opts.To > 0 {
		q += " AND ts <= ?"
		args = append(args, opts.To)
	}
	if opts.User != "" {
		q += " AND user = ?"
		args = append(args, opts.User)
	}
	if opts.Action != "" {
		q += " AND action = ?"
		args = append(args, string(opts.Action))
	}
	q += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Entry
	for rows.Next() {
		var e Entry
		var tsNano int64
		var beforeStr, afterStr sql.NullString
		if err := rows.Scan(&e.ID, &tsNano, &e.User, &e.Action, &e.Target, &beforeStr, &afterStr, &e.Meta); err != nil {
			return nil, err
		}
		e.Timestamp = time.Unix(0, tsNano)
		if beforeStr.Valid {
			e.Before = json.RawMessage(beforeStr.String)
		}
		if afterStr.Valid {
			e.After = json.RawMessage(afterStr.String)
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

func nullStr(b []byte) sql.NullString {
	if b == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: string(b), Valid: true}
}
