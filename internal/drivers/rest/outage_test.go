package rest

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Fault modes of flakyPLC.
const (
	plcOK      int32 = iota
	plcDown          // 503 on every request
	plcSlow          // answers after the driver's HTTP timeout
	plcGarbage       // 200 with a body that is not JSON
)

// flakyPLC imitates the PLCnext variables endpoint and can be switched into
// a fault. Variables in missing answer NotExists; all others read 1.
type flakyPLC struct {
	srv     *httptest.Server
	mode    atomic.Int32
	missing map[string]bool
	slow    time.Duration

	mu    sync.Mutex
	times []time.Time // arrival of every request
}

func newFlakyPLC(t *testing.T, missing ...string) *flakyPLC {
	f := &flakyPLC{missing: map[string]bool{}, slow: 300 * time.Millisecond}
	for _, m := range missing {
		f.missing[m] = true
	}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.times = append(f.times, time.Now())
		f.mu.Unlock()
		switch f.mode.Load() {
		case plcDown:
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		case plcSlow:
			select {
			case <-time.After(f.slow):
			case <-r.Context().Done():
			}
			return
		case plcGarbage:
			fmt.Fprint(w, "<html>proxy error</html>")
			return
		}
		if r.URL.Path != "/_pxc_api/v1.14/variables" {
			http.NotFound(w, r)
			return
		}
		prefix := r.URL.Query().Get("pathPrefix")
		var vars []string
		for _, v := range strings.Split(r.URL.Query().Get("paths"), ",") {
			if f.missing[prefix+v] {
				vars = append(vars, fmt.Sprintf(`{"path":%q,"value":null,"error":{"domain":"variables","reason":"NotExists"}}`, prefix+v))
				continue
			}
			vars = append(vars, fmt.Sprintf(`{"path":%q,"value":1}`, prefix+v))
		}
		fmt.Fprintf(w, `{"variables":[%s]}`, strings.Join(vars, ","))
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *flakyPLC) requestTimes() []time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]time.Time(nil), f.times...)
}

// startFlaky connects a fast-timed driver to f and returns it with a
// function that waits for a matching update of path.
func startFlaky(t *testing.T, f *flakyPLC, paths ...string) (*Driver, func(path string, ok func(tagstore.TagState) bool) tagstore.TagState) {
	t.Helper()
	ch := make(chan tagstore.TagUpdate, 256)
	d := New()
	d.pollEvery = testPoll
	d.httpTimeout = 100 * time.Millisecond
	d.backoffMin = 20 * time.Millisecond
	d.backoffMax = 80 * time.Millisecond
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
	}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	if err := d.SetTags(paths); err != nil {
		t.Fatalf("SetTags: %v", err)
	}
	waitFor := func(path string, ok func(tagstore.TagState) bool) tagstore.TagState {
		t.Helper()
		deadline := time.After(3 * time.Second)
		for {
			select {
			case u := <-ch:
				if u.Path == path && ok(u.State) {
					return u.State
				}
			case <-deadline:
				t.Fatalf("%s: no matching update within 3 s (status %+v)", path, d.Status())
				return tagstore.TagState{}
			}
		}
	}
	return d, waitFor
}

func good(s tagstore.TagState) bool { return s.Quality == "Good" }
func bad(s tagstore.TagState) bool  { return s.Quality == "Bad" }

func TestOutageMarksTagsBadAndRecovers(t *testing.T) {
	tests := []struct {
		name       string
		mode       int32
		wantReason string
	}{
		{"HTTP 503", plcDown, "answered HTTP 503"},
		{"no answer in time", plcSlow, "(timed out)"},
		{"unreadable reply", plcGarbage, "unreadable reply from 127.0.0.1"},
	}
	paths := []string{"Arp.Plc.Eclr/A", "Arp.Plc.Eclr/B"}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newFlakyPLC(t)
			d, waitFor := startFlaky(t, f, paths...)
			for _, p := range paths {
				waitFor(p, good)
			}
			if st := d.Status(); !st.Connected || st.LastError != "" {
				t.Fatalf("before the outage: Status = %+v", st)
			}

			f.mode.Store(tc.mode)
			for _, p := range paths {
				s := waitFor(p, bad)
				if s.Value != float64(1) {
					t.Errorf("%s: Bad value = %v, want the last value 1", p, s.Value)
				}
				if !strings.Contains(s.Reason, tc.wantReason) {
					t.Errorf("%s: reason %q, want it to contain %q", p, s.Reason, tc.wantReason)
				}
			}
			st := d.Status()
			if st.Connected || !strings.Contains(st.LastError, tc.wantReason) {
				t.Errorf("during the outage: Status = %+v", st)
			}
			start := time.Now()
			err := d.Write(context.Background(), "Arp.Plc.Eclr/A", 2)
			if err == nil || !strings.Contains(err.Error(), "not connected") {
				t.Errorf("Write while offline: err = %v, want not connected", err)
			}
			if el := time.Since(start); el > 50*time.Millisecond {
				t.Errorf("Write while offline took %v, want it to fail at once", el)
			}

			f.mode.Store(plcOK)
			for _, p := range paths {
				if s := waitFor(p, good); s.Reason != "" {
					t.Errorf("%s: Good with reason %q", p, s.Reason)
				}
			}
			if st := d.Status(); !st.Connected || st.LastError != "" {
				t.Errorf("after recovery: Status = %+v", st)
			}
		})
	}
}

func TestMissingVariableKeepsDriverOnline(t *testing.T) {
	f := newFlakyPLC(t, "Arp.Plc.Eclr/Gone")
	d, waitFor := startFlaky(t, f, "Arp.Plc.Eclr/A", "Arp.Plc.Eclr/Gone")
	s := waitFor("Arp.Plc.Eclr/Gone", bad)
	if s.Reason != "variables: NotExists" {
		t.Errorf("reason = %q, want variables: NotExists", s.Reason)
	}
	waitFor("Arp.Plc.Eclr/A", good)
	if st := d.Status(); !st.Connected || st.LastError != "" {
		t.Errorf("Status = %+v, want online", st)
	}
}

// While the controller stays down, retries slow down to backoffMax and do
// not flood it.
func TestRetriesBackOff(t *testing.T) {
	f := newFlakyPLC(t)
	f.mode.Store(plcDown)
	d := New()
	d.pollEvery = testPoll
	d.backoffMin = 50 * time.Millisecond
	d.backoffMax = 200 * time.Millisecond
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
	}, make(chan tagstore.TagUpdate, 16)); err != nil {
		t.Fatal(err)
	}
	time.Sleep(1300 * time.Millisecond)
	_ = d.Disconnect()

	times := f.requestTimes()
	var gaps []string
	for i := 1; i < len(times); i++ {
		gaps = append(gaps, times[i].Sub(times[i-1]).Round(time.Millisecond).String())
	}
	// Expected waits: 50, 100, then 200 ms (±20%): about 8 requests in 1.3 s.
	if len(times) < 6 || len(times) > 10 {
		t.Fatalf("%d requests in 1.3 s, want about 8; gaps %v", len(times), gaps)
	}
	want := []time.Duration{50, 100, 200, 200, 200, 200, 200, 200, 200, 200}
	for i := 1; i < len(times); i++ {
		gap := times[i].Sub(times[i-1])
		w := want[i-1] * time.Millisecond
		// Allow for jitter, and for timer and scheduler slack on Windows.
		lo, hi := w*8/10-16*time.Millisecond, w*12/10+60*time.Millisecond
		if gap < lo || gap > hi {
			t.Errorf("gap %d = %v, want %v ±20%%", i, gap.Round(time.Millisecond), w)
		}
	}
}

func TestDisconnectDuringBackoff(t *testing.T) {
	f := newFlakyPLC(t)
	f.mode.Store(plcDown)
	d := New()
	d.backoffMin = 10 * time.Second
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
	}, make(chan tagstore.TagUpdate, 16)); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for d.Status().LastError == "" {
		if time.Now().After(deadline) {
			t.Fatal("driver never went offline")
		}
		time.Sleep(5 * time.Millisecond)
	}
	start := time.Now()
	_ = d.Disconnect()
	if el := time.Since(start); el > 200*time.Millisecond {
		t.Errorf("Disconnect took %v during a 10 s backoff", el)
	}
	if d.Status().Connected {
		t.Error("Connected after Disconnect")
	}
}
