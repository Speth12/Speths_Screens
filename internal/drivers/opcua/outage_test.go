package opcua

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/gopcua/opcua/ua"
)

// flakyServer stands in for the server through the driver's dial and read
// hooks. Its fault, when set, is returned by every dial and read. Node IDs
// in bad answer with that status; all others read 1.
type flakyServer struct {
	mu    sync.Mutex
	fault error
	bad   map[string]ua.StatusCode
	dials atomic.Int32
	reads atomic.Int32
	ts    time.Time // source timestamp to return; zero means none
}

func (f *flakyServer) setFault(err error) {
	f.mu.Lock()
	f.fault = err
	f.mu.Unlock()
}

func (f *flakyServer) getFault() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.fault
}

func (f *flakyServer) dial(context.Context) error {
	f.dials.Add(1)
	return f.getFault()
}

func (f *flakyServer) read(_ context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error) {
	f.reads.Add(1)
	if err := f.getFault(); err != nil {
		return nil, err
	}
	res := &ua.ReadResponse{}
	for _, n := range req.NodesToRead {
		if st, ok := f.bad[n.NodeID.String()]; ok {
			res.Results = append(res.Results, &ua.DataValue{Status: st})
			continue
		}
		res.Results = append(res.Results, &ua.DataValue{
			Value: ua.MustVariant(int16(1)), Status: ua.StatusOK, SourceTimestamp: f.ts,
		})
	}
	return res, nil
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

// startFlaky connects a fast-timed driver to f and returns a function that
// waits for a matching update of a path.
func startFlaky(t *testing.T, f *flakyServer, paths ...string) (*Driver, func(string, func(tagstore.TagState) bool) tagstore.TagState) {
	t.Helper()
	ch := make(chan tagstore.TagUpdate, 256)
	d := New()
	d.pollEvery = testPoll
	d.backoffMin = 20 * time.Millisecond
	d.backoffMax = 80 * time.Millisecond
	d.dial = f.dial
	d.read = f.read
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "opc.tcp://10.0.0.210:4840"}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	if err := d.SetTags(paths); err != nil {
		t.Fatal(err)
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
		fault      error
		wantReason string
	}{
		{"network timeout", &net.OpError{Op: "read", Net: "tcp", Err: timeoutErr{}}, "no answer from 10.0.0.210 (timed out)"},
		{"request timed out", ua.StatusBadTimeout, "no answer from 10.0.0.210 (timed out)"},
		{"session gone", ua.StatusBadSessionIDInvalid, "10.0.0.210 answered BadSessionIdInvalid"},
		{"connection closed", fmt.Errorf("read: %w", io.EOF), "10.0.0.210 closed the connection"},
	}
	paths := []string{"ns=6;s=A", "ns=6;s=B"}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := &flakyServer{}
			d, waitFor := startFlaky(t, f, paths...)
			for _, p := range paths {
				waitFor(p, good)
			}
			if st := d.Status(); !st.Connected || st.LastError != "" {
				t.Fatalf("before the outage: Status = %+v", st)
			}
			dialsBefore := f.dials.Load()

			f.setFault(tc.fault)
			for _, p := range paths {
				s := waitFor(p, bad)
				if s.Value != int16(1) {
					t.Errorf("%s: Bad value = %v, want the last value 1", p, s.Value)
				}
				if s.Reason != tc.wantReason {
					t.Errorf("%s: reason %q, want %q", p, s.Reason, tc.wantReason)
				}
			}
			if st := d.Status(); st.Connected || st.LastError != tc.wantReason {
				t.Errorf("during the outage: Status = %+v", st)
			}
			start := time.Now()
			err := d.Write(context.Background(), "ns=6;s=A", 2.0)
			if err == nil || !strings.Contains(err.Error(), "not connected") {
				t.Errorf("Write while offline: err = %v, want not connected", err)
			}
			if el := time.Since(start); el > 50*time.Millisecond {
				t.Errorf("Write while offline took %v", el)
			}

			f.setFault(nil)
			for _, p := range paths {
				if s := waitFor(p, good); s.Reason != "" {
					t.Errorf("%s: Good with reason %q", p, s.Reason)
				}
			}
			if st := d.Status(); !st.Connected || st.LastError != "" {
				t.Errorf("after recovery: Status = %+v", st)
			}
			if f.dials.Load() <= dialsBefore {
				t.Error("the driver did not reconnect after the failure")
			}
		})
	}
}

func TestBadNodeStatusOnlyMarksThatTag(t *testing.T) {
	f := &flakyServer{bad: map[string]ua.StatusCode{"ns=6;s=Gone": ua.StatusBadNodeIDUnknown}}
	d, waitFor := startFlaky(t, f, "ns=6;s=A", "ns=6;s=Gone")
	s := waitFor("ns=6;s=Gone", bad)
	if s.Reason != "BadNodeIdUnknown" {
		t.Errorf("reason = %q, want BadNodeIdUnknown", s.Reason)
	}
	waitFor("ns=6;s=A", good)
	if st := d.Status(); !st.Connected {
		t.Errorf("Status = %+v, want online", st)
	}
}

func TestServerDownAtStartIsRetried(t *testing.T) {
	f := &flakyServer{}
	f.setFault(&net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connectex: No connection could be made because the target machine actively refused it.")})
	d, waitFor := startFlaky(t, f, "ns=6;s=A")
	deadline := time.Now().Add(2 * time.Second)
	for d.Status().LastError != "10.0.0.210 refused the connection" {
		if time.Now().After(deadline) {
			t.Fatalf("Status = %+v, want offline with the refused reason", d.Status())
		}
		time.Sleep(10 * time.Millisecond)
	}
	f.setFault(nil)
	waitFor("ns=6;s=A", good)
	if f.dials.Load() < 2 {
		t.Errorf("dials = %d, want retries", f.dials.Load())
	}
}

func TestDisconnectDuringBackoff(t *testing.T) {
	f := &flakyServer{}
	f.setFault(ua.StatusBadTimeout)
	d := New()
	d.backoffMin = 10 * time.Second
	d.dial = f.dial
	d.read = f.read
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "opc.tcp://10.0.0.210:4840"}, make(chan tagstore.TagUpdate, 16)); err != nil {
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
}

func TestNodeStateTimestamp(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	src := now.Add(-time.Second)
	srv := now.Add(-2 * time.Second)
	tests := []struct {
		name string
		dv   *ua.DataValue
		want time.Time
	}{
		{"source timestamp", &ua.DataValue{Status: ua.StatusOK, SourceTimestamp: src, ServerTimestamp: srv}, src},
		{"server timestamp", &ua.DataValue{Status: ua.StatusOK, ServerTimestamp: srv}, srv},
		{"neither", &ua.DataValue{Status: ua.StatusOK}, now},
		{"missing result", nil, now},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := nodeState(tc.dv, now).TS; got != tc.want.UnixNano() {
				t.Errorf("TS = %v, want %v", time.Unix(0, got).UTC(), tc.want)
			}
		})
	}
}
