package drivers

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"
)

func TestBackoff(t *testing.T) {
	b := Backoff{Min: 100 * time.Millisecond, Max: 400 * time.Millisecond}
	want := []time.Duration{100, 200, 400, 400}
	for round := 0; round < 2; round++ { // the second round checks Reset
		for i, w := range want {
			w *= time.Millisecond
			got := b.Next()
			if got < w*8/10 || got > w*12/10 {
				t.Errorf("round %d, wait %d = %v, want %v ±20%%", round, i, got, w)
			}
		}
		b.Reset()
	}
}

func TestSleepCtx(t *testing.T) {
	if !SleepCtx(context.Background(), time.Millisecond) {
		t.Error("SleepCtx returned false although the wait passed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if SleepCtx(ctx, time.Hour) {
		t.Error("SleepCtx returned true although ctx was done")
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Error("SleepCtx did not return at once on a done ctx")
	}
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func TestNetReason(t *testing.T) {
	// A port that was free a moment ago: dialing it is refused.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()
	_, refused := net.DialTimeout("tcp", addr, time.Second)

	tests := []struct {
		name   string
		err    error
		want   string
		wantOK bool
	}{
		{"timeout", fmt.Errorf("read: %w", &net.OpError{Op: "read", Net: "tcp", Err: timeoutErr{}}), "no answer from 10.0.0.210 (timed out)", true},
		{"refused", fmt.Errorf("connect: %w", refused), "10.0.0.210 refused the connection", true},
		{"other network error", &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("network is unreachable")},
			"cannot reach 10.0.0.210: network is unreachable", true},
		{"not a network error", errors.New("login refused"), "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := NetReason("10.0.0.210", tc.err)
			if got != tc.want || ok != tc.wantOK {
				t.Errorf("NetReason = %q, %v; want %q, %v (from %v)", got, ok, tc.want, tc.wantOK, tc.err)
			}
		})
	}
}
