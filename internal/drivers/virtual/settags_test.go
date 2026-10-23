package virtual

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

const evalTick = 200 * time.Millisecond

// countUpdates drains ch for d and returns how many updates arrived per path.
func countUpdates(ch chan tagstore.TagUpdate, d time.Duration) map[string]int {
	got := map[string]int{}
	deadline := time.After(d)
	for {
		select {
		case u := <-ch:
			got[u.Path]++
		case <-deadline:
			return got
		}
	}
}

func TestRepeatedSetTagsDoesNotAddLoops(t *testing.T) {
	tests := []struct {
		name  string
		calls int
	}{
		{"one deploy", 1},
		{"five deploys", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d := New(tagstore.New())
			cfg := drivers.DriverConfig{Extra: map[string]string{"tags": `[{"path":"x","formula":"1"}]`}}
			ch := make(chan tagstore.TagUpdate, 1024)
			if err := d.Connect(context.Background(), cfg, ch); err != nil {
				t.Fatalf("Connect: %v", err)
			}
			t.Cleanup(func() { _ = d.Disconnect() })
			for i := 0; i < tc.calls; i++ {
				if err := d.SetTags(nil); err != nil {
					t.Fatalf("SetTags: %v", err)
				}
			}
			// An active override re-emits on every tick of every loop.
			if err := d.Write(context.Background(), "x", 5.0); err != nil {
				t.Fatalf("Write: %v", err)
			}
			countUpdates(ch, evalTick/2) // drop the initial pushes

			const ticks = 5
			got := countUpdates(ch, ticks*evalTick)["x"]
			if got == 0 || got > ticks+2 {
				t.Errorf("x emitted %d times in %d ticks, want about %d", got, ticks, ticks)
			}
		})
	}
}

func TestDisconnectStopsEvaluation(t *testing.T) {
	d := New(tagstore.New())
	cfg := drivers.DriverConfig{Extra: map[string]string{"tags": `[{"path":"x","formula":"1"}]`}}
	ch := make(chan tagstore.TagUpdate, 1024)
	if err := d.Connect(context.Background(), cfg, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if err := d.Write(context.Background(), "x", 5.0); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if countUpdates(ch, 2*evalTick)["x"] == 0 {
		t.Fatal("no updates before Disconnect")
	}
	if err := d.Disconnect(); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	// Drop updates emitted before Disconnect returned.
	for len(ch) > 0 {
		<-ch
	}
	if got := countUpdates(ch, 2*evalTick)["x"]; got != 0 {
		t.Errorf("got %d updates after Disconnect, want 0", got)
	}
}

func TestSetTagsIsNoOp(t *testing.T) {
	d := New(tagstore.New())
	if err := d.SetTags([]string{"anything"}); err != nil {
		t.Errorf("SetTags: %v", err)
	}
}
