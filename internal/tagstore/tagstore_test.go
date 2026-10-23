package tagstore

import (
	"sync"
	"testing"
	"time"
)

func TestGetAfterUpdate(t *testing.T) {
	ts := New()
	state := TagState{Value: 42.0, Quality: "Good", TS: time.Now().UnixNano()}
	ts.Update("test.tag", state)

	got, ok := ts.Get("test.tag")
	if !ok {
		t.Fatal("expected tag to exist")
	}
	if got.Value != state.Value {
		t.Errorf("value: got %v want %v", got.Value, state.Value)
	}
	if got.Quality != "Good" {
		t.Errorf("quality: got %q want %q", got.Quality, "Good")
	}
}

func TestGetUnknownPath(t *testing.T) {
	ts := New()
	_, ok := ts.Get("does.not.exist")
	if ok {
		t.Fatal("expected false for unknown path")
	}
}

// next waits for the watcher's next batch.
func next(t *testing.T, w *Watcher) []TagUpdate {
	t.Helper()
	select {
	case <-w.C():
		return w.Drain()
	case <-time.After(50 * time.Millisecond):
		t.Fatal("no update within 50ms")
		return nil
	}
}

// quiet reports whether nothing arrives for d.
func quiet(w *Watcher, d time.Duration) bool {
	select {
	case <-w.C():
		return len(w.Drain()) == 0
	case <-time.After(d):
		return true
	}
}

func TestWatcherReceivesUpdate(t *testing.T) {
	ts := New()
	w := ts.Watch()
	defer w.Close()
	w.Add("sensor.temp")

	ts.Update("sensor.temp", TagState{Value: 99.5, Quality: "Good", TS: time.Now().UnixNano()})

	got := next(t, w)
	if len(got) != 1 || got[0].State.Value != 99.5 {
		t.Errorf("got %v want one update with 99.5", got)
	}
}

func TestWatcherReceivesCachedValueImmediately(t *testing.T) {
	ts := New()
	ts.Update("cached.tag", TagState{Value: true, Quality: "Good", TS: time.Now().UnixNano()})

	w := ts.Watch()
	defer w.Close()
	w.Add("cached.tag")

	got := next(t, w)
	if len(got) != 1 || got[0].State.Value != true {
		t.Errorf("got %v want the cached value true", got)
	}
}

func TestMultipleWatchersAllReceiveUpdate(t *testing.T) {
	ts := New()
	const n = 5
	ws := make([]*Watcher, n)
	for i := range n {
		ws[i] = ts.Watch()
		defer ws[i].Close()
		ws[i].Add("shared.tag")
	}

	ts.Update("shared.tag", TagState{Value: "hello", Quality: "Good", TS: time.Now().UnixNano()})

	for i, w := range ws {
		got := next(t, w)
		if len(got) != 1 || got[0].State.Value != "hello" {
			t.Errorf("watcher %d: got %v want hello", i, got)
		}
	}
}

func TestRemoveStopsDelivery(t *testing.T) {
	tests := []struct {
		name string
		stop func(w *Watcher)
	}{
		{"remove", func(w *Watcher) { w.Remove("remove.me") }},
		{"close", func(w *Watcher) { w.Close() }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts := New()
			w := ts.Watch()
			w.Add("remove.me")
			ts.Update("remove.me", TagState{Value: 1, Quality: "Good"}) // pending, never read
			tc.stop(w)
			ts.Update("remove.me", TagState{Value: 2, Quality: "Good"})
			if !quiet(w, 30*time.Millisecond) {
				t.Fatal("received an update after stopping")
			}
		})
	}
}

// A watcher that never reads must not slow Update down and must still hold
// the newest value of every path it watches.
func TestSlowWatcherEndsOnNewest(t *testing.T) {
	ts := New()
	w := ts.Watch()
	defer w.Close()
	w.Add("a", "b", "c")

	done := make(chan struct{})
	go func() {
		for i := 0; i < 10000; i++ {
			for _, p := range []string{"a", "b", "c"} {
				ts.Update(p, TagState{Value: i, Quality: "Good"})
			}
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Update blocked on a watcher that does not read")
	}

	got := map[string]any{}
	for _, u := range w.Drain() {
		got[u.Path] = u.State.Value
	}
	for _, p := range []string{"a", "b", "c"} {
		if got[p] != 9999 {
			t.Errorf("%s = %v, want 9999", p, got[p])
		}
	}
}

func TestUpdateOnlyNotifiesWatchersOfThatPath(t *testing.T) {
	ts := New()
	wa, wb := ts.Watch(), ts.Watch()
	defer wa.Close()
	defer wb.Close()
	wa.Add("a")
	wb.Add("b")

	ts.Update("a", TagState{Value: 1, Quality: "Good"})

	if got := next(t, wa); len(got) != 1 || got[0].Path != "a" {
		t.Errorf("watcher a got %v", got)
	}
	if !quiet(wb, 30*time.Millisecond) {
		t.Error("watcher b was notified of a")
	}
	ts.mu.Lock()
	n := len(ts.watchers)
	ts.mu.Unlock()
	wa.Close()
	wb.Close()
	ts.mu.Lock()
	after := len(ts.watchers)
	ts.mu.Unlock()
	if n != 2 || after != 0 {
		t.Errorf("index sizes %d → %d, want 2 → 0", n, after)
	}
}

func TestConcurrentWritesNoRace(t *testing.T) {
	ts := New()
	const goroutines = 100

	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := range goroutines {
		go func(i int) {
			defer wg.Done()
			ts.Update("race.tag", TagState{Value: i, Quality: "Good", TS: time.Now().UnixNano()})
		}(i)
	}
	wg.Wait()

	// just verify it exists
	if _, ok := ts.Get("race.tag"); !ok {
		t.Fatal("tag missing after concurrent writes")
	}
}

func TestMarkStale(t *testing.T) {
	ts := New()
	old := TagState{Value: 1, Quality: "Good", TS: time.Now().Add(-2 * time.Second).UnixNano()}
	ts.data.Store("stale.tag", old)

	ts.MarkStale(time.Second)

	got, ok := ts.Get("stale.tag")
	if !ok {
		t.Fatal("tag missing")
	}
	if got.Quality != "Uncertain" {
		t.Errorf("quality: got %q want Uncertain", got.Quality)
	}
}

func TestStop(t *testing.T) {
	ts := New()
	ts.Stop()
	ts.Stop() // idempotent

	select {
	case <-ts.Stopped():
	default:
		t.Fatal("Stopped() channel should be closed after Stop()")
	}
}
