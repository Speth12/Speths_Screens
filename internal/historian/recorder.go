package historian

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// The runtime pump hands updates to the historian with Enqueue, which never
// blocks. One goroutine (recordLoop) filters them and writes in batches, so a
// slow disk never slows the pump.
const (
	queueSize  = 10000            // updates waiting to be filtered and written
	batchRows  = 500              // write when this many rows are waiting...
	batchEvery = time.Second      // ...or this often
	heartbeat  = 60 * time.Second // store an unchanged tag at least this often
	dropWarn   = time.Minute      // log dropped updates at most this often
)

// lastSample is what recordLoop last stored for a path.
type lastSample struct {
	value   string // JSON
	quality string
	at      time.Time // wall time it was stored
	num     float64   // the value as a number, when isNum
	isNum   bool
}

// row is one sample ready to insert.
type row struct {
	path    string
	ts      int64
	value   string
	quality string
}

// Enqueue hands one tag update to the historian. It never blocks: when the
// queue is full (the disk is far behind), the update is dropped and counted.
// The update is stored if its value or quality changed, if it is the first
// for its path, or if the path was last stored heartbeat ago. A number that
// stays within its deadband (see Rules) of the last stored value counts as
// unchanged; tags a rule skips are never stored.
func (h *Historian) Enqueue(u tagstore.TagUpdate) {
	select {
	case h.queue <- u:
	default:
		h.dropped.Add(1)
	}
}

// Dropped returns how many updates Enqueue dropped because the queue was full.
func (h *Historian) Dropped() int64 { return h.dropped.Load() }

// Flush waits until every update enqueued so far is filtered and written.
func (h *Historian) Flush() {
	done := make(chan struct{})
	select {
	case h.flushReq <- done:
		<-done
	case <-h.stop:
	}
}

// recordLoop is the only goroutine that filters and writes enqueued updates.
// On Close it writes everything still queued before it returns.
func (h *Historian) recordLoop() {
	defer h.wg.Done()
	last := map[string]lastSample{}
	var batch []row
	tick := time.NewTicker(batchEvery)
	defer tick.Stop()
	var warned time.Time
	var reported int64

	take := func(u tagstore.TagUpdate) {
		if r, ok := h.keep(last, u); ok {
			batch = append(batch, r)
		}
		if len(batch) >= batchRows {
			h.writeBatch(batch)
			batch = batch[:0]
		}
	}
	drain := func() {
		for {
			select {
			case u := <-h.queue:
				take(u)
			default:
				h.writeBatch(batch)
				batch = batch[:0]
				return
			}
		}
	}

	for {
		select {
		case u := <-h.queue:
			take(u)
		case <-tick.C:
			h.writeBatch(batch)
			batch = batch[:0]
			if d := h.dropped.Load(); d > reported && time.Since(warned) >= dropWarn {
				log.Printf("[HISTORIAN] queue full: %d updates dropped (%d in total)", d-reported, d)
				reported, warned = d, time.Now()
			}
		case done := <-h.flushReq:
			drain()
			close(done)
		case <-h.stop:
			drain()
			return
		}
	}
}

// keep decides whether u is stored and records it as the path's last sample.
// The deadband compares with the last stored value, not the last seen one,
// so a slow drift is stored once it adds up.
func (h *Historian) keep(last map[string]lastSample, u tagstore.TagUpdate) (row, bool) {
	pol := h.rules.Load().forPath(u.Path)
	if pol.skip {
		return row{}, false
	}
	val := encodeValue(u.State.Value)
	num, isNum := deadbandNumber(u.State.Value)
	now := h.now()
	prev, seen := last[u.Path]
	if seen && prev.quality == u.State.Quality && now.Sub(prev.at) < heartbeat {
		if prev.value == val {
			return row{}, false
		}
		if pol.deadband > 0 && isNum && prev.isNum && math.Abs(num-prev.num) <= pol.deadband {
			return row{}, false
		}
	}
	last[u.Path] = lastSample{value: val, quality: u.State.Quality, at: now, num: num, isNum: isNum}
	return row{path: u.Path, ts: u.State.TS, value: val, quality: u.State.Quality}, true
}

// writeBatch inserts rows in one transaction.
func (h *Historian) writeBatch(rows []row) {
	if len(rows) == 0 {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("[HISTORIAN] begin: %v (%d samples lost)", err, len(rows))
		return
	}
	stmt := tx.Stmt(h.insertStmt)
	for _, r := range rows {
		if _, err := stmt.Exec(r.path, r.ts, r.value, r.quality); err != nil {
			_ = tx.Rollback()
			log.Printf("[HISTORIAN] insert: %v (%d samples lost)", err, len(rows))
			return
		}
	}
	if err := tx.Commit(); err != nil {
		log.Printf("[HISTORIAN] commit: %v (%d samples lost)", err, len(rows))
		return
	}
	h.batches.Add(1)
}

// encodeValue gives the JSON stored for a value.
func encodeValue(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%q", fmt.Sprint(v))
	}
	return string(b)
}

// deadbandNumber returns v as a number for the deadband. true/false are not
// numbers here: any change of a bool is stored.
func deadbandNumber(v any) (float64, bool) {
	if _, ok := v.(bool); ok {
		return 0, false
	}
	return tagstore.Number(v)
}
