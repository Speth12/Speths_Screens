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
	const maxAge = 10 * time.Second
	all := func(string) bool { return true }
	tests := []struct {
		name        string
		state       TagState
		since       time.Duration // time since the store received the tag
		include     func(string) bool
		wantQuality string
		wantReason  string
	}{
		{"no update for longer than maxAge", TagState{Value: 1, Quality: "Good"}, 11 * time.Second, all, "Uncertain", "no update for 10s"},
		{"recent update", TagState{Value: 1, Quality: "Good"}, 5 * time.Second, all, "Good", ""},
		// An OPC UA source timestamp stays old while the value does not
		// change; what counts is when the store last received it.
		{"old value timestamp, received recently", TagState{Value: 1, Quality: "Good", TS: time.Now().Add(-time.Hour).UnixNano()}, time.Second, all, "Good", ""},
		{"not a polled datasource", TagState{Value: 1, Quality: "Good"}, time.Hour, func(string) bool { return false }, "Good", ""},
		{"already Bad keeps its reason", TagState{Value: 1, Quality: "Bad", Reason: "no answer"}, time.Hour, all, "Bad", "no answer"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ts := New()
			w := ts.Watch()
			defer w.Close()
			w.Add("plc:A")
			ts.Update("plc:A", tc.state)
			<-w.C()
			w.Drain()

			now := time.Now().Add(tc.since).UnixNano()
			marked := ts.markStale(now, maxAge, tc.include)

			got, _ := ts.Get("plc:A")
			if got.Quality != tc.wantQuality || got.Reason != tc.wantReason {
				t.Errorf("got %q %q, want %q %q", got.Quality, got.Reason, tc.wantQuality, tc.wantReason)
			}
			if got.Value != tc.state.Value || got.TS != tc.state.TS {
				t.Errorf("value or timestamp changed: got %+v, had %+v", got, tc.state)
			}
			wantMarked := 0
			if tc.wantQuality == "Uncertain" {
				wantMarked = 1
			}
			if marked != wantMarked {
				t.Errorf("marked %d, want %d", marked, wantMarked)
			}
			// Watchers hear about the change, and only about a change.
			select {
			case <-w.C():
				u := w.Drain()
				if wantMarked == 0 || len(u) != 1 || u[0].State.Quality != "Uncertain" {
					t.Errorf("watcher got %+v", u)
				}
			default:
				if wantMarked == 1 {
					t.Error("watcher was not told")
				}
			}
		})
	}
}

func TestStaleTagRecoversAndIsMarkedOnce(t *testing.T) {
	ts := New()
	ts.Update("plc:A", TagState{Value: 1, Quality: "Good"})
	later := time.Now().Add(time.Minute).UnixNano()
	all := func(string) bool { return true }
	if n := ts.markStale(later, time.Second, all); n != 1 {
		t.Fatalf("first check marked %d, want 1", n)
	}
	if n := ts.markStale(later, time.Second, all); n != 0 {
		t.Errorf("second check marked %d, want 0 (already Uncertain)", n)
	}
	ts.Update("plc:A", TagState{Value: 2, Quality: "Good"})
	if got, _ := ts.Get("plc:A"); got.Quality != "Good" || got.Reason != "" || got.Value != 2 {
		t.Errorf("after a fresh update: %+v, want Good 2 with no reason", got)
	}
}

// A fresh update racing the stale check must never be replaced by the stale
// copy of an older value. Run with -race.
func TestMarkStaleDoesNotOverwriteFreshUpdate(t *testing.T) {
	ts := New()
	const n = 2000
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 1; i <= n; i++ {
			ts.Update("plc:A", TagState{Value: i, Quality: "Good"})
		}
	}()
	future := time.Now().Add(time.Hour).UnixNano()
	all := func(string) bool { return true }
	for {
		ts.markStale(future, 0, all)
		select {
		case <-done:
			ts.markStale(future, 0, all)
			if got, _ := ts.Get("plc:A"); got.Value != n {
				t.Fatalf("value = %v after the last update of %d", got.Value, n)
			}
			return
		default:
		}
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
