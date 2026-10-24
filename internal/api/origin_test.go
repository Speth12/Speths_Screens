package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestCORSAllowsListedOriginsOnly(t *testing.T) {
	_, _, hs := newTestServer(t)
	tests := []struct {
		name, method, origin string
		wantAllow            string // Access-Control-Allow-Origin; empty means none
	}{
		{"IDE dev server", "GET", "http://localhost:5173", "http://localhost:5173"},
		{"IDE dev server, preflight", "OPTIONS", "http://127.0.0.1:5173", "http://127.0.0.1:5173"},
		{"operator dev server", "GET", "http://localhost:7001", "http://localhost:7001"},
		{"another site", "GET", "https://evil.example", ""},
		{"another site, preflight", "OPTIONS", "https://evil.example", ""},
		{"no origin (same origin or not a browser)", "GET", "", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(tc.method, hs.URL+"/api/v1/alive", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if got := resp.Header.Get("Access-Control-Allow-Origin"); got != tc.wantAllow {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, tc.wantAllow)
			}
		})
	}
}

func TestWebSocketChecksOrigin(t *testing.T) {
	_, _, hs := newTestServer(t)
	wsURL := strings.Replace(hs.URL, "http://", "ws://", 1)
	tests := []struct {
		name, origin string
		ok           bool
	}{
		{"own origin", hs.URL, true},
		{"IDE dev server", "http://localhost:5173", true},
		{"no origin (not a browser)", "", true},
		{"another site", "https://evil.example", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for _, path := range []string{"/ws/tags", "/ws/alarms", "/ws/events"} {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				h := http.Header{}
				if tc.origin != "" {
					h.Set("Origin", tc.origin)
				}
				conn, _, err := websocket.Dial(ctx, wsURL+path, &websocket.DialOptions{HTTPHeader: h})
				cancel()
				if err == nil {
					conn.CloseNow() // /ws/alarms and /ws/events never read, so a clean close would wait 5 s
				}
				if (err == nil) != tc.ok {
					t.Errorf("%s: err = %v, want ok=%v", path, err, tc.ok)
				}
			}
		})
	}
}
