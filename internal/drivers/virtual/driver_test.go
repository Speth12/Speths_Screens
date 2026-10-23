package virtual

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/speths-screens/internal/drivers"
	"github.com/Speth12/speths-screens/internal/tagstore"
)

func TestWriteOverride(t *testing.T) {
	store := tagstore.New()
	d := New(store)

	cfg := drivers.DriverConfig{
		Extra: map[string]string{
			"tags": `[
				{"path":"phase","formula":"({sim:phase} + 0.01) % 6.283"},
				{"path":"pressure","formula":"50 + sin({sim:phase}) * 15"}
			]`,
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := d.Connect(ctx, cfg); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	ch := make(chan tagstore.TagUpdate, 64)
	if err := d.Subscribe(ctx, nil, ch); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}

	// Let the driver push at least one tick.
	time.Sleep(350 * time.Millisecond)

	// Write an override for "pressure".
	if err := d.Write(ctx, "pressure", 99.0); err != nil {
		t.Fatalf("Write: %v", err)
	}

	// Wait for the immediate push from Write + at least one tick.
	deadline := time.After(600 * time.Millisecond)
	var gotOverride bool
	for !gotOverride {
		select {
		case u := <-ch:
			if u.Path == "pressure" {
				v, ok := u.State.Value.(float64)
				if ok && v == 99.0 {
					gotOverride = true
				}
			}
		case <-deadline:
			t.Fatal("timeout waiting for override value 99.0 on 'pressure'")
		}
	}

	// After override, the value should stay at 99.0 across ticks.
	time.Sleep(450 * time.Millisecond)
	// Drain channel and check the latest pressure value.
	var lastPressure float64 = -1
loop:
	for {
		select {
		case u := <-ch:
			if u.Path == "pressure" {
				lastPressure, _ = u.State.Value.(float64)
			}
		default:
			break loop
		}
	}
	if lastPressure != 99.0 {
		t.Errorf("after override, pressure = %v, want 99.0", lastPressure)
	}

	// Writing to a non-existent tag should return an error.
	if err := d.Write(ctx, "nonexistent", 1.0); err == nil {
		t.Error("expected error writing to nonexistent tag, got nil")
	}

	_ = d.Disconnect()
}
