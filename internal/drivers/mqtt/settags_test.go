package mqtt

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func connectBroker(t *testing.T, out chan<- tagstore.TagUpdate) *Driver {
	t.Helper()
	endpoint, stop := startBroker(t)
	t.Cleanup(stop)
	d := New()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: endpoint}, out); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	return d
}

// collect publishes one message per topic and returns how many updates
// arrived for each topic within a short window.
func collect(t *testing.T, d *Driver, ch chan tagstore.TagUpdate, topics []string) map[string]int {
	t.Helper()
	for _, topic := range topics {
		if err := d.Write(context.Background(), topic, "1"); err != nil {
			t.Fatalf("publish %s: %v", topic, err)
		}
	}
	got := map[string]int{}
	deadline := time.After(500 * time.Millisecond)
	for {
		select {
		case u := <-ch:
			got[u.Path]++
		case <-deadline:
			return got
		}
	}
}

func TestRepeatedSetTagsDeliversOnce(t *testing.T) {
	tests := []struct {
		name  string
		calls int
	}{
		{"one deploy", 1},
		{"five deploys", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ch := make(chan tagstore.TagUpdate, 64)
			d := connectBroker(t, ch)
			for i := 0; i < tc.calls; i++ {
				if err := d.SetTags([]string{"plant/a"}); err != nil {
					t.Fatalf("SetTags: %v", err)
				}
			}
			got := collect(t, d, ch, []string{"plant/a"})
			if got["plant/a"] != 1 {
				t.Errorf("plant/a delivered %d times, want 1", got["plant/a"])
			}
		})
	}
}

func TestSetTagsReplacesSubscriptions(t *testing.T) {
	tests := []struct {
		name   string
		first  []string
		second []string
		want   map[string]int // deliveries per topic after second
	}{
		{"add", []string{"plant/a"}, []string{"plant/a", "plant/b"}, map[string]int{"plant/a": 1, "plant/b": 1}},
		{"remove", []string{"plant/a", "plant/b"}, []string{"plant/b"}, map[string]int{"plant/b": 1}},
		{"replace", []string{"plant/a"}, []string{"plant/c"}, map[string]int{"plant/c": 1}},
		{"empty", []string{"plant/a"}, nil, map[string]int{}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ch := make(chan tagstore.TagUpdate, 64)
			d := connectBroker(t, ch)
			if err := d.SetTags(tc.first); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			if err := d.SetTags(tc.second); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			got := collect(t, d, ch, []string{"plant/a", "plant/b", "plant/c"})
			if len(got) != len(tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
			for topic, n := range tc.want {
				if got[topic] != n {
					t.Errorf("%s delivered %d times, want %d (all: %v)", topic, got[topic], n, got)
				}
			}
		})
	}
}
