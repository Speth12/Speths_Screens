package tagstore

import (
	"sync"
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
// Reads are lock-free (sync.Map). Watchers get updates through a Mailbox, so
// Update never blocks and a slow watcher skips intermediate values but always
// ends on the newest value of each path it watches.
type TagStore struct {
	data sync.Map // map[string]TagState

	// mu guards watchers and orders each Update's store-and-notify, so two
	// updates of one path never leave a watcher holding the older value.
	mu       sync.Mutex
	watchers map[string]map[*Watcher]struct{} // path → watchers

	stopped chan struct{}
	once    sync.Once
}

// New returns an initialised TagStore.
func New() *TagStore {
	return &TagStore{
		watchers: map[string]map[*Watcher]struct{}{},
		stopped:  make(chan struct{}),
	}
}

// Update writes a new state for path and notifies the watchers of path.
// It never blocks on a watcher.
func (ts *TagStore) Update(path string, state TagState) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.data.Store(path, state)
	for w := range ts.watchers[path] {
		w.mb.Put(TagUpdate{Path: path, State: state})
	}
}

// Get returns the current state for path. ok is false if the path is unknown.
func (ts *TagStore) Get(path string) (TagState, bool) {
	v, ok := ts.data.Load(path)
	if !ok {
		return TagState{}, false
	}
	return v.(TagState), true
}

// Watcher receives updates for a changing set of paths. Use one per
// consumer (for example one per WebSocket connection):
//
//	w := ts.Watch()
//	defer w.Close()
//	w.Add("plc:A", "plc:B")
//	for range w.C() {
//		for _, u := range w.Drain() { ... }
//	}
type Watcher struct {
	ts     *TagStore
	mb     *Mailbox
	paths  map[string]struct{} // guarded by ts.mu
	closed bool                // guarded by ts.mu
}

// Watch returns a watcher with no paths. Call Close when done.
func (ts *TagStore) Watch() *Watcher {
	return &Watcher{ts: ts, mb: NewMailbox(), paths: map[string]struct{}{}}
}

// Add starts watching paths. The current value of each known path is
// delivered right away.
func (w *Watcher) Add(paths ...string) {
	ts := w.ts
	ts.mu.Lock()
	defer ts.mu.Unlock()
	if w.closed {
		return
	}
	for _, p := range paths {
		if _, ok := w.paths[p]; ok {
			continue
		}
		w.paths[p] = struct{}{}
		set := ts.watchers[p]
		if set == nil {
			set = map[*Watcher]struct{}{}
			ts.watchers[p] = set
		}
		set[w] = struct{}{}
		// Under ts.mu, so no Update can slip in between this read and the Put.
		if state, ok := ts.Get(p); ok {
			w.mb.Put(TagUpdate{Path: p, State: state})
		}
	}
}

// Remove stops watching paths and drops their pending updates.
func (w *Watcher) Remove(paths ...string) {
	ts := w.ts
	ts.mu.Lock()
	defer ts.mu.Unlock()
	for _, p := range paths {
		w.unwatch(p)
	}
}

// unwatch removes one path. Caller holds ts.mu.
func (w *Watcher) unwatch(p string) {
	if _, ok := w.paths[p]; !ok {
		return
	}
	delete(w.paths, p)
	if set := w.ts.watchers[p]; set != nil {
		delete(set, w)
		if len(set) == 0 {
			delete(w.ts.watchers, p)
		}
	}
	w.mb.Delete(p)
}

// C receives a value when updates may be pending. Receive before Drain.
func (w *Watcher) C() <-chan struct{} { return w.mb.C() }

// Drain returns the newest pending update of each watched path.
func (w *Watcher) Drain() []TagUpdate { return w.mb.Drain() }

// Close stops all watching. The watcher cannot be reused.
func (w *Watcher) Close() {
	ts := w.ts
	ts.mu.Lock()
	defer ts.mu.Unlock()
	for p := range w.paths {
		w.unwatch(p)
	}
	w.closed = true
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
