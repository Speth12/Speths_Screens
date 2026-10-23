package rest

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

const testPoll = 20 * time.Millisecond

// fakePLC imitates the PLCnext variables endpoint and records each read.
type fakePLC struct {
	srv  *httptest.Server
	mu   sync.Mutex
	reqs [][]string // full paths requested, one entry per GET
}

func newFakePLC(t *testing.T) *fakePLC {
	f := &fakePLC{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_pxc_api/v1.14/variables" {
			http.NotFound(w, r)
			return
		}
		prefix := r.URL.Query().Get("pathPrefix")
		var full, vars []string
		for _, v := range strings.Split(r.URL.Query().Get("paths"), ",") {
			full = append(full, prefix+v)
			vars = append(vars, fmt.Sprintf(`{"path":%q,"value":1}`, prefix+v))
		}
		f.mu.Lock()
		f.reqs = append(f.reqs, full)
		f.mu.Unlock()
		fmt.Fprintf(w, `{"variables":[%s]}`, strings.Join(vars, ","))
	}))
	t.Cleanup(f.srv.Close)
	return f
}

// take returns the requests recorded since the last call and clears them.
func (f *fakePLC) take() [][]string {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := f.reqs
	f.reqs = nil
	return r
}

func connectPXC(t *testing.T, f *fakePLC, out chan<- tagstore.TagUpdate) *Driver {
	t.Helper()
	d := New()
	d.pollEvery = testPoll
	err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
	}, out)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	return d
}

// window clears old requests, waits n poll periods and returns what arrived.
func window(f *fakePLC, n int) [][]string {
	f.take()
	time.Sleep(time.Duration(n) * testPoll)
	return f.take()
}

func TestRepeatedSetTagsDoesNotMultiplyPolling(t *testing.T) {
	tests := []struct {
		name  string
		calls int
	}{
		{"one deploy", 1},
		{"five deploys", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakePLC(t)
			ch := make(chan tagstore.TagUpdate, 64)
			go func() {
				for range ch {
				}
			}()
			d := connectPXC(t, f, ch)
			for i := 0; i < tc.calls; i++ {
				if err := d.SetTags([]string{"Arp.Plc.Eclr/A", "Arp.Plc.Eclr/B"}); err != nil {
					t.Fatalf("SetTags: %v", err)
				}
			}
			const ticks = 10
			got := len(window(f, ticks))
			// One component group → about one request per tick. Five stacked
			// poll loops would give about 5×.
			if got == 0 || got > ticks*3/2+2 {
				t.Errorf("got %d requests in %d ticks, want about %d", got, ticks, ticks)
			}
		})
	}
}

func TestSetTagsReplacesPollSet(t *testing.T) {
	tests := []struct {
		name   string
		first  []string
		second []string
		groups int // requests per tick expected for second
	}{
		{"add a tag", []string{"C/A"}, []string{"C/A", "C/B"}, 1},
		{"remove a tag", []string{"C/A", "C/B"}, []string{"C/B"}, 1},
		{"switch component", []string{"C1/A"}, []string{"C2/A", "C3/B"}, 2},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakePLC(t)
			d := connectPXC(t, f, make(chan tagstore.TagUpdate, 256))
			if err := d.SetTags(tc.first); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			if err := d.SetTags(tc.second); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			time.Sleep(2 * testPoll) // let an in-flight tick finish
			reqs := window(f, 10)
			if len(reqs) == 0 {
				t.Fatal("no requests after SetTags")
			}
			seen := map[string]bool{}
			for _, r := range reqs {
				for _, p := range r {
					if !slices.Contains(tc.second, p) {
						t.Errorf("polled %q, not in the new set %v", p, tc.second)
					}
					seen[p] = true
				}
			}
			for _, p := range tc.second {
				if !seen[p] {
					t.Errorf("never polled %q", p)
				}
			}
			if d.Status().TagCount != len(tc.second) {
				t.Errorf("TagCount = %d, want %d", d.Status().TagCount, len(tc.second))
			}
		})
	}
}

func TestSetTagsIdempotent(t *testing.T) {
	d := New()
	if err := d.SetTags([]string{"C/B", "C/A", "C/A"}); err != nil {
		t.Fatal(err)
	}
	first := d.tags.Load()
	if err := d.SetTags([]string{"C/A", "C/B"}); err != nil {
		t.Fatal(err)
	}
	if d.tags.Load() != first {
		t.Error("same set in a different order replaced the tag set")
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
			f := newFakePLC(t)
			d := connectPXC(t, f, make(chan tagstore.TagUpdate, 256))
			if err := d.SetTags([]string{"C/A"}); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			if len(window(f, 5)) == 0 {
				t.Fatal("not polling before stop")
			}
			tc.stop(d)
			time.Sleep(2 * testPoll)
			if got := window(f, 10); len(got) != 0 {
				t.Errorf("got %d requests after stop, want 0", len(got))
			}
		})
	}
}
