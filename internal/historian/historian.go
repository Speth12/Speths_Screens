// Package historian persists tag updates to SQLite (modernc.org/sqlite, pure Go, no CGO).
//
// Schema:
//
//	CREATE TABLE history (path TEXT, ts INTEGER, value TEXT, quality TEXT);
//	CREATE INDEX history_path_ts ON history(path, ts);
//
// Retention is time-based: samples older than the configured duration are
// deleted every trimInterval. Default retention is 7 days.
package historian

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
	_ "modernc.org/sqlite"
)

const (
	defaultRetention = 7 * 24 * time.Hour
	trimInterval     = 30 * time.Second
)

// Sample is one raw row from the history table.
type Sample struct {
	TS      int64  `json:"ts"`
	Value   any    `json:"value"`
	Quality string `json:"quality"`
}

// AggSample is one time-bucketed aggregate. Min/Avg/Max are nil for
// non-numeric tags (booleans are treated as 0/1).
type AggSample struct {
	TS    int64    `json:"ts"`
	Min   *float64 `json:"min"`
	Avg   *float64 `json:"avg"`
	Max   *float64 `json:"max"`
	Count int      `json:"count"`
}

// Historian persists tag updates and serves time-range queries.
type Historian struct {
	db         *sql.DB
	retention  atomic.Int64 // time.Duration; see retentionNow
	rules      atomic.Pointer[ruleSet]
	mu         sync.Mutex // one writer at a time
	stop       chan struct{}
	wg         sync.WaitGroup
	insertStmt *sql.Stmt

	// Enqueue and recordLoop (see recorder.go).
	queue    chan tagstore.TagUpdate
	flushReq chan chan struct{}
	dropped  atomic.Int64
	batches  atomic.Int64     // transactions written; for tests
	now      func() time.Time // replaced in tests
}

// Open initialises a SQLite database at path (use ":memory:" for tests).
func Open(path string) (*Historian, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // sqlite + WAL — single writer
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA temp_store=MEMORY",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			return nil, fmt.Errorf("pragma %s: %w", p, err)
		}
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS history (
		path TEXT NOT NULL,
		ts   INTEGER NOT NULL,
		value TEXT NOT NULL,
		quality TEXT NOT NULL
	)`); err != nil {
		return nil, fmt.Errorf("create table: %w", err)
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS history_path_ts ON history(path, ts)`); err != nil {
		return nil, err
	}
	stmt, err := db.Prepare(`INSERT INTO history (path, ts, value, quality) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return nil, err
	}
	h := &Historian{
		db:         db,
		stop:       make(chan struct{}),
		insertStmt: stmt,
		queue:      make(chan tagstore.TagUpdate, queueSize),
		flushReq:   make(chan chan struct{}),
		now:        time.Now,
	}
	h.retention.Store(int64(defaultRetention))
	h.rules.Store(compile(Rules{}))
	h.wg.Add(2)
	go h.trimLoop()
	go h.recordLoop()
	return h, nil
}

// SetRetention configures how far back history is kept, unless the
// project's rules set their own retention.
func (h *Historian) SetRetention(d time.Duration) { h.retention.Store(int64(d)) }

// Record stores one tag update at once, unfiltered. The runtime pump uses
// Enqueue instead, which never blocks and stores changes only.
func (h *Historian) Record(u tagstore.TagUpdate) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.insertStmt.Exec(u.Path, u.State.TS, encodeValue(u.State.Value), u.State.Quality)
	return err
}

// RecordWrite stores a manually-written value with quality "Write" for audit purposes.
func (h *Historian) RecordWrite(path string, value any) error {
	val, err := json.Marshal(value)
	if err != nil {
		val = []byte(fmt.Sprintf("%q", fmt.Sprint(value)))
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err = h.insertStmt.Exec(path, time.Now().UnixNano(), string(val), "Write")
	return err
}

// Query returns raw samples for path within [from, to] (Unix nanos), oldest first.
// limit caps the number of returned samples (0 = no limit).
func (h *Historian) Query(ctx context.Context, path string, from, to int64, limit int) ([]Sample, error) {
	q := `SELECT ts, value, quality FROM history
	      WHERE path = ? AND ts BETWEEN ? AND ?
	      ORDER BY ts ASC`
	args := []any{path, from, to}
	if limit > 0 {
		q += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := h.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Sample
	for rows.Next() {
		var s Sample
		var raw string
		if err := rows.Scan(&s.TS, &raw, &s.Quality); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(raw), &s.Value)
		out = append(out, s)
	}
	return out, rows.Err()
}

// QueryAggregated returns time-bucketed MIN/AVG/MAX/COUNT for path within
// [from, to] (Unix nanos). bucketSize sets the width of each bucket.
// For non-numeric tags (strings) Min/Avg/Max are nil; Count is always set.
func (h *Historian) QueryAggregated(ctx context.Context, path string, from, to int64, bucketSize time.Duration, limit int) ([]AggSample, error) {
	bucketNanos := bucketSize.Nanoseconds()
	if bucketNanos <= 0 {
		return nil, fmt.Errorf("bucketSize must be positive")
	}
	q := `
		SELECT
			(ts / ?) * ? AS bucket,
			MIN(CAST(json_extract(value, '$') AS REAL)),
			AVG(CAST(json_extract(value, '$') AS REAL)),
			MAX(CAST(json_extract(value, '$') AS REAL)),
			COUNT(*)
		FROM history
		WHERE path = ? AND ts BETWEEN ? AND ?
		GROUP BY bucket
		ORDER BY bucket ASC`
	args := []any{bucketNanos, bucketNanos, path, from, to}
	if limit > 0 {
		q += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := h.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AggSample
	for rows.Next() {
		var s AggSample
		var mn, avg, mx sql.NullFloat64
		if err := rows.Scan(&s.TS, &mn, &avg, &mx, &s.Count); err != nil {
			return nil, err
		}
		if mn.Valid {
			s.Min = &mn.Float64
			s.Avg = &avg.Float64
			s.Max = &mx.Float64
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// QueryMulti returns raw samples for each path in paths. The result map is
// keyed by path; a path with no data gets an empty (non-nil) slice.
func (h *Historian) QueryMulti(ctx context.Context, paths []string, from, to int64, limit int) (map[string][]Sample, error) {
	out := make(map[string][]Sample, len(paths))
	for _, p := range paths {
		samples, err := h.Query(ctx, p, from, to, limit)
		if err != nil {
			return out, fmt.Errorf("path %s: %w", p, err)
		}
		if samples == nil {
			samples = []Sample{}
		}
		out[p] = samples
	}
	return out, nil
}

// QueryMultiAggregated returns bucketed aggregates for each path in paths.
func (h *Historian) QueryMultiAggregated(ctx context.Context, paths []string, from, to int64, bucketSize time.Duration, limit int) (map[string][]AggSample, error) {
	out := make(map[string][]AggSample, len(paths))
	for _, p := range paths {
		aggs, err := h.QueryAggregated(ctx, p, from, to, bucketSize, limit)
		if err != nil {
			return out, fmt.Errorf("path %s: %w", p, err)
		}
		if aggs == nil {
			aggs = []AggSample{}
		}
		out[p] = aggs
	}
	return out, nil
}

// Close writes the updates still queued and shuts down.
func (h *Historian) Close() error {
	close(h.stop)
	h.wg.Wait()
	if h.insertStmt != nil {
		_ = h.insertStmt.Close()
	}
	return h.db.Close()
}

func (h *Historian) trimLoop() {
	defer h.wg.Done()
	tick := time.NewTicker(trimInterval)
	defer tick.Stop()
	for {
		select {
		case <-h.stop:
			return
		case <-tick.C:
			_ = h.trim()
		}
	}
}

// trim deletes samples older than the configured retention window.
func (h *Historian) trim() error {
	cutoff := time.Now().Add(-h.retentionNow()).UnixNano()
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.db.Exec(`DELETE FROM history WHERE ts < ?`, cutoff)
	return err
}

// DeleteBefore satisfies the Provider interface.
func (h *Historian) DeleteBefore(ctx context.Context, cutoff int64) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.db.ExecContext(ctx, `DELETE FROM history WHERE ts < ?`, cutoff)
	return err
}

// Write satisfies the Provider interface (single-sample write without TagUpdate wrapper).
func (h *Historian) Write(ctx context.Context, path string, ts int64, value any, quality string) error {
	b, _ := json.Marshal(value)
	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := h.insertStmt.ExecContext(ctx, path, ts, string(b), quality)
	return err
}
