package historian

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// fakeClock is a settable clock for the heartbeat.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func openMem(t *testing.T) *Historian {
	t.Helper()
	h, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h
}

func count(t *testing.T, h *Historian, path string) int {
	t.Helper()
	s, err := h.Query(context.Background(), path, 0, 1<<62, 0)
	if err != nil {
		t.Fatal(err)
	}
	return len(s)
}

func TestEnqueueStoresChangesOnly(t *testing.T) {
	type step struct {
		value   any
		quality string
		advance time.Duration // clock moves before this update
		stored  bool
	}
	tests := []struct {
		name  string
		steps []step
	}{
		{"first value is stored", []step{{1.0, "Good", 0, true}}},
		{"unchanged value is skipped", []step{{1.0, "Good", 0, true}, {1.0, "Good", time.Second, false}, {1.0, "Good", time.Second, false}}},
		{"changed value is stored", []step{{1.0, "Good", 0, true}, {2.0, "Good", time.Second, true}}},
		{"changed quality is stored", []step{{1.0, "Good", 0, true}, {1.0, "Bad", time.Second, true}, {1.0, "Bad", time.Second, false}}},
		{"unchanged value after the heartbeat is stored", []step{{1.0, "Good", 0, true}, {1.0, "Good", 59 * time.Second, false}, {1.0, "Good", 2 * time.Second, true}}},
		{"strings and bools compare by value", []step{{"on", "Good", 0, true}, {"on", "Good", time.Second, false}, {true, "Good", time.Second, true}, {true, "Good", time.Second, false}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := openMem(t)
			clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
			h.now = clock.now
			want := 0
			for i, s := range tc.steps {
				clock.add(s.advance)
				h.Enqueue(tagstore.TagUpdate{Path: "plc:A", State: tagstore.TagState{
					Value: s.value, Quality: s.quality, TS: int64(i + 1),
				}})
				h.Flush()
				if s.stored {
					want++
				}
				if got := count(t, h, "plc:A"); got != want {
					t.Fatalf("after step %d (%v %s): %d rows, want %d", i, s.value, s.quality, got, want)
				}
			}
		})
	}
}

// Updates are written in batches, one transaction per batch.
func TestEnqueueWritesInBatches(t *testing.T) {
	h := openMem(t)
	const n = 1200
	for i := 0; i < n; i++ {
		h.Enqueue(tagstore.TagUpdate{Path: "plc:A", State: tagstore.TagState{Value: i, Quality: "Good", TS: int64(i)}})
	}
	h.Flush()
	if got := count(t, h, "plc:A"); got != n {
		t.Fatalf("%d rows, want %d", got, n)
	}
	// 1200 rows in batches of 500: 3 transactions, plus perhaps one from the
	// 1 s timer.
	if b := h.batches.Load(); b < 3 || b > 5 {
		t.Errorf("%d transactions for %d rows, want about 3", b, n)
	}
}

// A stalled database never slows Enqueue: extra updates are dropped and
// counted, and the rest are written once the database is back.
func TestEnqueueNeverBlocks(t *testing.T) {
	h := openMem(t)
	h.mu.Lock() // the database is busy
	const n = 15000
	start := time.Now()
	for i := 0; i < n; i++ {
		h.Enqueue(tagstore.TagUpdate{Path: "plc:A", State: tagstore.TagState{Value: i, Quality: "Good", TS: int64(i)}})
	}
	elapsed := time.Since(start)
	h.mu.Unlock()
	if elapsed > 500*time.Millisecond {
		t.Errorf("Enqueue of %d updates took %v while the database was busy", n, elapsed)
	}
	dropped := h.Dropped()
	if dropped == 0 {
		t.Fatal("nothing dropped although the queue overflowed")
	}
	h.Flush()
	if got := count(t, h, "plc:A"); int64(got) != n-dropped {
		t.Errorf("%d rows, want %d (%d enqueued, %d dropped)", got, n-dropped, n, dropped)
	}
}

// Close writes what is still queued.
func TestCloseWritesQueuedUpdates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "history.db")
	h, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 50; i++ {
		h.Enqueue(tagstore.TagUpdate{Path: "plc:A", State: tagstore.TagState{Value: i, Quality: "Good", TS: int64(i)}})
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	h2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer h2.Close()
	if got := count(t, h2, "plc:A"); got != 50 {
		t.Errorf("%d rows after reopening, want 50", got)
	}
}

// Manual writes are stored at once and are never filtered.
func TestRecordWriteIsNotFiltered(t *testing.T) {
	h := openMem(t)
	for i := 0; i < 3; i++ {
		if err := h.RecordWrite("plc:A", 5.0); err != nil {
			t.Fatal(err)
		}
	}
	if got := count(t, h, "plc:A"); got != 3 {
		t.Errorf("%d rows, want 3", got)
	}
}
