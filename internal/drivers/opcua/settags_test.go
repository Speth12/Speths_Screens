package opcua

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/gopcua/opcua/ua"
)

const testPoll = 20 * time.Millisecond

// fakeServer answers Read requests with each node ID as its string value and
// records which node IDs every request asked for.
type fakeServer struct {
	mu   sync.Mutex
	reqs [][]string
}

func (f *fakeServer) read(_ context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error) {
	ids := make([]string, len(req.NodesToRead))
	res := &ua.ReadResponse{Results: make([]*ua.DataValue, len(req.NodesToRead))}
	for i, n := range req.NodesToRead {
		ids[i] = n.NodeID.String()
		res.Results[i] = &ua.DataValue{
			Value:           ua.MustVariant(ids[i]),
			Status:          ua.StatusOK,
			SourceTimestamp: time.Now(),
		}
	}
	f.mu.Lock()
	f.reqs = append(f.reqs, ids)
	f.mu.Unlock()
	return res, nil
}

func (f *fakeServer) take() [][]string {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := f.reqs
	f.reqs = nil
	return r
}

func (f *fakeServer) window(n int) [][]string {
	f.take()
	time.Sleep(time.Duration(n) * testPoll)
	return f.take()
}

// startFake returns a driver whose poll loop runs against a fake server, as
// it would after a successful Connect.
func startFake(t *testing.T) (*Driver, *fakeServer) {
	t.Helper()
	f := &fakeServer{}
	d := New()
	d.pollEvery = testPoll
	d.read = f.read
	d.startLoop()
	t.Cleanup(func() { _ = d.Disconnect() })
	return d, f
}

func drain(ch chan tagstore.TagUpdate) {
	go func() {
		for range ch {
		}
	}()
}

func TestRepeatedSubscribeDoesNotMultiplyPolling(t *testing.T) {
	tests := []struct {
		name  string
		calls int
	}{
		{"one deploy", 1},
		{"five deploys", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d, f := startFake(t)
			for i := 0; i < tc.calls; i++ {
				ch := make(chan tagstore.TagUpdate, 64)
				drain(ch)
				if err := d.Subscribe(context.Background(), []string{"ns=6;s=A", "ns=6;s=B"}, ch); err != nil {
					t.Fatalf("Subscribe: %v", err)
				}
			}
			const ticks = 10
			got := len(f.window(ticks))
			if got == 0 || got > ticks*3/2+2 {
				t.Errorf("got %d reads in %d ticks, want about %d", got, ticks, ticks)
			}
		})
	}
}

func TestSetTagsReplacesPollSet(t *testing.T) {
	tests := []struct {
		name   string
		first  []string
		second []string
	}{
		{"add", []string{"ns=6;s=A"}, []string{"ns=6;s=A", "ns=6;s=B"}},
		{"remove", []string{"ns=6;s=A", "ns=6;s=B"}, []string{"ns=6;s=B"}},
		{"replace", []string{"ns=6;s=A"}, []string{"ns=6;s=C"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d, f := startFake(t)
			ch := make(chan tagstore.TagUpdate, 64)
			drain(ch)
			if err := d.Subscribe(context.Background(), tc.first, ch); err != nil {
				t.Fatalf("Subscribe: %v", err)
			}
			if err := d.SetTags(tc.second); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			time.Sleep(2 * testPoll)
			reqs := f.window(10)
			if len(reqs) == 0 {
				t.Fatal("no reads after SetTags")
			}
			want := slices.Sorted(slices.Values(tc.second))
			for _, r := range reqs {
				if !slices.Equal(r, want) {
					t.Errorf("read %v, want %v", r, want)
				}
			}
		})
	}
}

func TestSetTagsIdempotent(t *testing.T) {
	d := New()
	if err := d.SetTags([]string{"ns=6;s=B", "ns=6;s=A", "ns=6;s=A"}); err != nil {
		t.Fatal(err)
	}
	first := d.tags.Load()
	if err := d.SetTags([]string{"ns=6;s=A", "ns=6;s=B"}); err != nil {
		t.Fatal(err)
	}
	if d.tags.Load() != first {
		t.Error("same set in a different order replaced the tag set")
	}
}

func TestBadNodeIDDoesNotShiftPaths(t *testing.T) {
	d, _ := startFake(t)
	ch := make(chan tagstore.TagUpdate, 64)
	if err := d.Subscribe(context.Background(), []string{"ns=6;s=A", "ns=abc;s=X", "ns=6;s=B"}, ch); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	got := map[string]bool{}
	deadline := time.After(2 * time.Second)
	for len(got) < 2 {
		select {
		case u := <-ch:
			if u.State.Value != u.Path {
				t.Fatalf("path %q got the value of %v", u.Path, u.State.Value)
			}
			got[u.Path] = true
		case <-deadline:
			t.Fatalf("timed out; got %v", got)
		}
	}
	if d.Status().TagCount != 2 {
		t.Errorf("TagCount = %d, want 2", d.Status().TagCount)
	}
}

func TestEmptySetAndDisconnectStopPolling(t *testing.T) {
	tests := []struct {
		name string
		stop func(d *Driver)
	}{
		{"empty tag set", func(d *Driver) { _ = d.SetTags(nil) }},
		{"disconnect", func(d *Driver) { _ = d.Disconnect() }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d, f := startFake(t)
			ch := make(chan tagstore.TagUpdate, 64)
			drain(ch)
			if err := d.Subscribe(context.Background(), []string{"ns=6;s=A"}, ch); err != nil {
				t.Fatalf("Subscribe: %v", err)
			}
			if len(f.window(5)) == 0 {
				t.Fatal("not polling before stop")
			}
			tc.stop(d)
			time.Sleep(2 * testPoll)
			if got := f.window(10); len(got) != 0 {
				t.Errorf("got %d reads after stop, want 0", len(got))
			}
		})
	}
}
