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

func TestSubscribeReceivesUpdate(t *testing.T) {
	ts := New()
	ch, cancel := ts.Subscribe("sensor.temp")
	defer cancel()

	// drain any pre-pushed cached value
	drainTimeout(ch, 10*time.Millisecond)

	state := TagState{Value: 99.5, Quality: "Good", TS: time.Now().UnixNano()}
	ts.Update("sensor.temp", state)

	select {
	case update := <-ch:
		if update.State.Value != 99.5 {
			t.Errorf("got %v want 99.5", update.State.Value)
		}
	case <-time.After(50 * time.Millisecond):
		t.Fatal("subscriber did not receive update within 50ms")
	}
}

func TestSubscribeReceivesCachedValueImmediately(t *testing.T) {
	ts := New()
	ts.Update("cached.tag", TagState{Value: true, Quality: "Good", TS: time.Now().UnixNano()})

	ch, cancel := ts.Subscribe("cached.tag")
	defer cancel()

	select {
	case update := <-ch:
		if update.State.Value != true {
			t.Errorf("got %v want true", update.State.Value)
		}
	case <-time.After(50 * time.Millisecond):
		t.Fatal("should receive cached value immediately on subscribe")
	}
}

func TestMultipleSubscribersAllReceiveUpdate(t *testing.T) {
	ts := New()
	const n = 5
	channels := make([]<-chan TagUpdate, n)
	cancels := make([]func(), n)
	for i := range n {
		channels[i], cancels[i] = ts.Subscribe("shared.tag")
		defer cancels[i]()
	}

	// drain cached values (none exist yet)
	for _, ch := range channels {
		drainTimeout(ch, 10*time.Millisecond)
	}

	state := TagState{Value: "hello", Quality: "Good", TS: time.Now().UnixNano()}
	ts.Update("shared.tag", state)

	for i, ch := range channels {
		select {
		case update := <-ch:
			if update.State.Value != "hello" {
				t.Errorf("subscriber %d: got %v want hello", i, update.State.Value)
			}
		case <-time.After(50 * time.Millisecond):
			t.Errorf("subscriber %d did not receive update", i)
		}
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	ts := New()
	ch, cancel := ts.Subscribe("remove.me")
	drainTimeout(ch, 10*time.Millisecond)
	cancel()

	ts.Update("remove.me", TagState{Value: 1, Quality: "Good", TS: time.Now().UnixNano()})

	select {
	case <-ch:
		t.Fatal("should not receive after cancel")
	case <-time.After(30 * time.Millisecond):
		// correct
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

func drainTimeout(ch <-chan TagUpdate, d time.Duration) {
	timer := time.NewTimer(d)
	defer timer.Stop()
	for {
		select {
		case <-ch:
		case <-timer.C:
			return
		}
	}
}
