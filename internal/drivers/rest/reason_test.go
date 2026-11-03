package rest

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReasonIsShort(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(time.Second):
		case <-r.Context().Done():
		}
	}))
	defer slow.Close()
	// A port that was free a moment ago: connecting to it is refused.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closed := "http://" + l.Addr().String()
	l.Close()

	d := New()
	d.host = "10.0.0.210"
	d.hc = &http.Client{Timeout: 50 * time.Millisecond}
	longURL := "/_pxc_api/v1.14/variables?pathPrefix=Arp.Plc.Eclr%2F&paths=" + strings.Repeat("MainInstance.Var%2C", 20)
	get := func(base string) error {
		_, err := d.getJSON(context.Background(), base+longURL)
		return fmt.Errorf("rest: read Arp.Plc.Eclr/: %w", err)
	}

	tests := []struct {
		name string
		err  error
		want string
	}{
		{"timeout", get(slow.URL), "no answer from 10.0.0.210 (timed out)"},
		{"connection refused", get(closed), "10.0.0.210 refused the connection"},
		{"HTTP status", fmt.Errorf("rest: read X/: %w", &statusError{code: 503}), "10.0.0.210 answered HTTP 503"},
		{"unreadable reply", fmt.Errorf("rest: read X/: %w: invalid character '<'", errUnreadable), "unreadable reply from 10.0.0.210"},
		{"driver's own message", fmt.Errorf("rest: the controller requires a login; set a username and password on the datasource"),
			"the controller requires a login; set a username and password on the datasource"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := d.reasonFor(tc.err)
			if got != tc.want {
				t.Errorf("reason = %q, want %q (from %v)", got, tc.want, tc.err)
			}
			if strings.Contains(got, "http") || strings.Contains(got, "?") {
				t.Errorf("reason %q contains the request URL", got)
			}
		})
	}
}

// An unplugged controller must show up within a few seconds.
func TestDefaultTimeoutIsShort(t *testing.T) {
	if got := New().httpTimeout; got > 3*time.Second {
		t.Errorf("httpTimeout = %v, want at most 3 s", got)
	}
}
