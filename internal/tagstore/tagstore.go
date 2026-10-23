package tagstore

import (
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// TagState is the value stored per tag path.
type TagState struct {
	Value   any
	Quality string // "Good" | "Bad" | "Uncertain"
	TS      int64  // Unix nano
}

// TagUpdate is published to subscribers and written by drivers.
type TagUpdate struct {
	Path  string
	State TagState
}

// TagStore is the central, thread-safe in-memory tag registry.
//
// Reads are lock-free (sync.Map). Subscriber channels are buffered; a slow
// subscriber is dropped rather than blocking the write path.
type TagStore struct {
	data sync.Map // map[string]TagState
	subs sync.Map // map[string]map[uint64]chan<- TagUpdate

	nextID  atomic.Uint64
	mu      sync.Mutex // guards per-path subscriber maps
	stopped chan struct{}
	once    sync.Once
}

// New returns an initialised TagStore.
func New() *TagStore {
	return &TagStore{stopped: make(chan struct{})}
}

// Update writes a new state for path and notifies all subscribers.
// Slow subscribers (full channel) are skipped, not blocked.
func (ts *TagStore) Update(path string, state TagState) {
	ts.data.Store(path, state)
	log.Printf("[TAG] Updated path=%s value=%v quality=%s", path, state.Value, state.Quality)

	ts.subs.Range(func(k, v any) bool {
		if k.(string) != path {
			return true
		}
		v.(*sync.Map).Range(func(_, ch any) bool {
			select {
			case ch.(chan<- TagUpdate) <- TagUpdate{Path: path, State: state}:
			default:
				// subscriber is slow; skip rather than block
			}
			return true
		})
		return true
	})
}

// Get returns the current state for path. ok is false if the path is unknown.
func (ts *TagStore) Get(path string) (TagState, bool) {
	v, ok := ts.data.Load(path)
	if !ok {
		return TagState{}, false
	}
	return v.(TagState), true
}

// Subscribe returns a buffered channel that receives TagUpdate values for path.
// The caller must call the returned cancel func when done to avoid leaks.
func (ts *TagStore) Subscribe(path string) (<-chan TagUpdate, func()) {
	id := ts.nextID.Add(1)
	ch := make(chan TagUpdate, 64)

	// ensure per-path subscriber map exists
	actual, _ := ts.subs.LoadOrStore(path, &sync.Map{})
	actual.(*sync.Map).Store(id, chan<- TagUpdate(ch))

	cancel := func() {
		if m, ok := ts.subs.Load(path); ok {
			m.(*sync.Map).Delete(id)
		}
	}

	// immediately push current value if known
	if state, ok := ts.Get(path); ok {
		ch <- TagUpdate{Path: path, State: state}
	}

	log.Printf("[WS] Client subscribed path=%s", path)
	return ch, cancel
}

// MarkStale sets quality to "Uncertain" for all tags not updated within maxAge.
// Intended to be called on a timer by the runtime.
func (ts *TagStore) MarkStale(maxAge time.Duration) {
	now := time.Now().UnixNano()
	ts.data.Range(func(k, v any) bool {
		state := v.(TagState)
		if now-state.TS > maxAge.Nanoseconds() && state.Quality == "Good" {
			state.Quality = "Uncertain"
			ts.Update(k.(string), state)
		}
		return true
	})
}

// Stop signals that the TagStore is shutting down. Idempotent.
func (ts *TagStore) Stop() {
	ts.once.Do(func() { close(ts.stopped) })
}

// Stopped returns a channel closed when Stop() is called.
func (ts *TagStore) Stopped() <-chan struct{} {
	return ts.stopped
}
