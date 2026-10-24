package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/Speth12/Speths_Screens/internal/versionstore"
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

func TestWebSocketWriteNeedsToken(t *testing.T) {
	// Security is on from the start, so no handler ever sees it change.
	sec, err := security.Open(":memory:", []byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sec.Close() })
	ctx := context.Background()
	for _, u := range []struct {
		name string
		role security.Role
	}{{"admin", security.RoleAdmin}, {"op", security.RoleOperator}} {
		if _, err := sec.CreateUser(ctx, u.name, u.name+"-test-pass", u.role); err != nil {
			t.Fatal(err)
		}
	}
	adminToken, _, err := sec.Login(ctx, "admin", "admin-test-pass")
	if err != nil {
		t.Fatal(err)
	}
	opToken, _, err := sec.Login(ctx, "op", "op-test-pass")
	if err != nil {
		t.Fatal(err)
	}
	rt := runtime.New(nil, nil)
	rt.Security = sec
	rt.Start(ctx)
	t.Cleanup(rt.Stop)
	vs, err := versionstore.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = vs.Close() })
	hs := httptest.NewServer(New(rt, nil, vs).Handler())
	t.Cleanup(hs.Close)

	req, _ := http.NewRequest(http.MethodPost, hs.URL+"/api/v1/project", strings.NewReader(writeTestProject))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("deploy as admin: %d", resp.StatusCode)
	}

	tests := []struct {
		name       string
		token      string
		wantStatus string
		wantCode   int
	}{
		{"no token", "", runtime.WriteFailed, 401},
		{"invalid token", "not-a-token", runtime.WriteFailed, 401},
		{"operator token", opToken, runtime.WriteConfirmed, 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := wsWriteOnce(t, hs.URL, tc.token, wsWrite{ID: "b1", Path: "calc:sp", Value: 7.0})
			if got.Status != tc.wantStatus || got.Code != tc.wantCode {
				t.Errorf("got %+v, want status %s code %d", got, tc.wantStatus, tc.wantCode)
			}
		})
	}

	// Reading still works without a token (until defect 9).
	cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(cctx, strings.Replace(hs.URL, "http://", "ws://", 1)+"/ws/tags", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := wsjson.Write(cctx, conn, map[string][]string{"subscribe": {"calc:sp"}}); err != nil {
		t.Fatal(err)
	}
	var u map[string]any
	if err := wsjson.Read(cctx, conn, &u); err != nil || u["path"] != "calc:sp" {
		t.Errorf("subscribe without a token: %v %v", u, err)
	}
}
