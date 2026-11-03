package tagstore

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func upd(path string, v any) TagUpdate {
	return TagUpdate{Path: path, State: TagState{Value: v, Quality: "Good"}}
}

func paths(us []TagUpdate) []string {
	out := make([]string, len(us))
	for i, u := range us {
		out[i] = u.Path
	}
	return out
}

func TestMailboxKeepsNewestPerPath(t *testing.T) {
	tests := []struct {
		name      string
		puts      []TagUpdate
		del       string
		wantOrder []string
		wantValue map[string]any
	}{
		{
			name:      "single put",
			puts:      []TagUpdate{upd("a", 1)},
			wantOrder: []string{"a"},
			wantValue: map[string]any{"a": 1},
		},
		{
			name:      "newer value replaces older",
			puts:      []TagUpdate{upd("a", 1), upd("a", 2), upd("a", 3)},
			wantOrder: []string{"a"},
			wantValue: map[string]any{"a": 3},
		},
		{
			name:      "order is first pending first",
			puts:      []TagUpdate{upd("b", 1), upd("a", 1), upd("b", 2)},
			wantOrder: []string{"b", "a"},
			wantValue: map[string]any{"a": 1, "b": 2},
		},
		{
			name:      "delete drops a pending path",
			puts:      []TagUpdate{upd("a", 1), upd("b", 1), upd("c", 1)},
			del:       "b",
			wantOrder: []string{"a", "c"},
			wantValue: map[string]any{"a": 1, "c": 1},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := NewMailbox()
			for _, u := range tc.puts {
				m.Put(u)
			}
			if tc.del != "" {
				m.Delete(tc.del)
			}
			got := m.Drain()
			if fmt.Sprint(paths(got)) != fmt.Sprint(tc.wantOrder) {
				t.Errorf("order = %v, want %v", paths(got), tc.wantOrder)
			}
			for _, u := range got {
				if u.State.Value != tc.wantValue[u.Path] {
					t.Errorf("%s = %v, want %v", u.Path, u.State.Value, tc.wantValue[u.Path])
				}
			}
			if again := m.Drain(); again != nil {
				t.Errorf("second Drain = %v, want nil", again)
			}
		})
	}
}

func TestMailboxPutNeverBlocks(t *testing.T) {
	m := NewMailbox() // nobody reads
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100000; i++ {
			m.Put(upd(fmt.Sprintf("p%d", i%50), i))
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Put blocked with no reader")
	}
	if n := m.Len(); n != 50 {
		t.Errorf("Len = %d, want 50 (bounded by distinct paths)", n)
	}
}

// Many writers, one slow reader: the reader must end on every path's last
// value.
func TestMailboxSlowReaderEndsOnNewest(t *testing.T) {
	const writers, perWriter = 8, 2000
	m := NewMailbox()
	got := map[string]any{}
	readerDone := make(chan struct{})
	stop := make(chan struct{})
	go func() {
		defer close(readerDone)
		for {
			select {
			case <-m.C():
				for _, u := range m.Drain() {
					got[u.Path] = u.State.Value
				}
				time.Sleep(time.Millisecond) // slow reader
			case <-stop:
				for _, u := range m.Drain() {
					got[u.Path] = u.State.Value
				}
				return
			}
		}
	}()

	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			path := fmt.Sprintf("w%d", w)
			for i := 0; i <= perWriter; i++ {
				m.Put(upd(path, i))
			}
		}(w)
	}
	wg.Wait()
	close(stop)
	<-readerDone

	for w := 0; w < writers; w++ {
		path := fmt.Sprintf("w%d", w)
		if got[path] != perWriter {
			t.Errorf("%s ended on %v, want %d", path, got[path], perWriter)
		}
	}
}
