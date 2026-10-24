package api

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/Speth12/Speths_Screens/internal/runtime"
)

// deployWriteProject loads writeTestProject (calc:sp writable 0..100).
func deployWriteProject(t *testing.T, base string) {
	t.Helper()
	resp := postJSON(t, base+"/api/v1/project", writeTestProject)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("deploy: %d", resp.StatusCode)
	}
}

// wsWriteOnce opens /ws/tags (with token if set), sends one write and
// returns its result.
func wsWriteOnce(t *testing.T, base, token string, w wsWrite) wsWriteReply {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	u := strings.Replace(base, "http://", "ws://", 1) + "/ws/tags"
	if token != "" {
		u += "?token=" + url.QueryEscape(token)
	}
	conn, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := wsjson.Write(ctx, conn, map[string]any{"write": w}); err != nil {
		t.Fatal(err)
	}
	for {
		var msg wsWriteResult
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			t.Fatalf("no write result: %v", err)
		}
		if msg.WriteResult.ID != "" {
			return msg.WriteResult
		}
	}
}

func TestWebSocketWriteWithoutSecurity(t *testing.T) {
	_, _, hs := newTestServer(t)
	deployWriteProject(t, hs.URL)
	tests := []struct {
		name       string
		w          wsWrite
		wantStatus string
		wantCode   int
	}{
		{"confirmed", wsWrite{ID: "a1", Path: "calc:sp", Value: 42.0}, runtime.WriteConfirmed, 200},
		{"above the maximum", wsWrite{ID: "a2", Path: "calc:sp", Value: 500.0}, runtime.WriteFailed, 400},
		{"not writable", wsWrite{ID: "a3", Path: "calc:shown", Value: 1.0}, runtime.WriteFailed, 404},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := wsWriteOnce(t, hs.URL, "", tc.w)
			if got.ID != tc.w.ID || got.Status != tc.wantStatus || got.Code != tc.wantCode {
				t.Errorf("got %+v, want id %s status %s code %d", got, tc.w.ID, tc.wantStatus, tc.wantCode)
			}
		})
	}
}

func TestWebSocketLogin(t *testing.T) {
	sec := newSecureServer(t) // security.mode "login"
	wsURL := strings.Replace(sec.hs.URL, "http://", "ws://", 1)

	// With logins on, the connection itself needs a valid token.
	for _, tc := range []struct{ name, query string }{
		{"no token", ""},
		{"invalid token", "?token=not-a-token"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, path := range []string{"/ws/tags", "/ws/alarms"} {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				conn, resp, err := websocket.Dial(ctx, wsURL+path+tc.query, nil)
				cancel()
				if err == nil {
					conn.Close(websocket.StatusNormalClosure, "")
					t.Errorf("%s: connected without a valid token", path)
				} else if resp == nil || resp.StatusCode != 401 {
					t.Errorf("%s: err %v, want HTTP 401", path, err)
				}
			}
		})
	}

	// An operator token can read and write.
	got := wsWriteOnce(t, sec.hs.URL, sec.opToken, wsWrite{ID: "b1", Path: "calc:sp", Value: 7.0})
	if got.Status != runtime.WriteConfirmed || got.Code != 200 {
		t.Errorf("operator write: %+v", got)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL+"/ws/tags?token="+url.QueryEscape(sec.opToken), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := wsjson.Write(ctx, conn, map[string][]string{"subscribe": {"calc:sp"}}); err != nil {
		t.Fatal(err)
	}
	var u map[string]any
	if err := wsjson.Read(ctx, conn, &u); err != nil || u["path"] != "calc:sp" {
		t.Errorf("operator subscribe: %v %v", u, err)
	}

	// Deploying a project without logins (as admin) opens everything again.
	if code, body := sec.do(t, "POST", "/api/v1/project", sec.adminToken, writeTestProject); code != 200 {
		t.Fatalf("deploy without logins: %d %s", code, body)
	}
	if got := wsWriteOnce(t, sec.hs.URL, "", wsWrite{ID: "b2", Path: "calc:sp", Value: 8.0}); got.Status != runtime.WriteConfirmed {
		t.Errorf("write without a token, security.mode none: %+v", got)
	}
}
