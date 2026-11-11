package api

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/Speth12/Speths_Screens/internal/targets"
)

// fakePanel is another runtime, as the relay sees it: it records what it was asked and answers.
type fakePanel struct {
	hs   *httptest.Server
	mu   sync.Mutex
	last struct {
		method, path, query, body string
		header                    http.Header
	}
}

func newFakePanel(t *testing.T) *fakePanel {
	t.Helper()
	p := &fakePanel{}
	p.hs = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		p.mu.Lock()
		p.last.method, p.last.path, p.last.query, p.last.body = r.Method, r.URL.EscapedPath(), r.URL.RawQuery, string(body)
		p.last.header = r.Header.Clone()
		p.mu.Unlock()
		if r.URL.Path == "/ws/echo" {
			c, err := websocket.Accept(w, r, nil) // refuses a browser origin that is not its own, like a runtime
			if err != nil {
				return
			}
			defer c.CloseNow()
			typ, msg, err := c.Read(r.Context())
			if err == nil {
				_ = c.Write(r.Context(), typ, append([]byte("echo:"), msg...))
			}
			c.Close(websocket.StatusNormalClosure, "")
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*") // must not reach the browser through the relay
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/v1/multi" {
			w.WriteHeader(207)
		}
		_, _ = w.Write([]byte(`{"from":"panel"}`))
	}))
	t.Cleanup(p.hs.Close)
	return p
}

func (p *fakePanel) seen() (method, path, query, body string, h http.Header) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.last.method, p.last.path, p.last.query, p.last.body, p.last.header
}

// relayServer is a PC program with a relay and one saved target, the fake panel.
func relayServer(t *testing.T) (base string, id string, panel *fakePanel, srv *Server) {
	t.Helper()
	srv, _, hs := newTestServer(t)
	store, _ := targets.Open("")
	srv.Targets = store
	panel = newFakePanel(t)
	tg, err := store.Add("Panel", panel.hs.URL)
	if err != nil {
		t.Fatal(err)
	}
	return hs.URL, tg.ID, panel, srv
}

func relaySend(t *testing.T, method, url, body string, header map[string]string) (int, string, http.Header) {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b), resp.Header
}

func TestTargetRoutesAreAbsentWithoutARelay(t *testing.T) {
	_, _, hs := newTestServer(t) // Targets is nil: a panel's runtime
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/targets"}, {"POST", "/api/v1/targets"}, {"PUT", "/api/v1/targets/x"},
		{"DELETE", "/api/v1/targets/x"}, {"GET", "/api/v1/targets/x/relay/api/v1/project"},
	} {
		if code, _, _ := relaySend(t, c.method, hs.URL+c.path, `{}`, nil); code != 404 {
			t.Errorf("%s %s: %d, want 404", c.method, c.path, code)
		}
	}
}

func TestTargetsAddChangeRemove(t *testing.T) {
	srv, _, hs := newTestServer(t)
	srv.Targets, _ = targets.Open("")

	code, body, _ := relaySend(t, "POST", hs.URL+"/api/v1/targets", `{"name":"Panel","url":"http://10.0.0.120:8090/"}`, nil)
	if code != 201 {
		t.Fatalf("add: %d %s", code, body)
	}
	var tg targets.Target
	_ = json.Unmarshal([]byte(body), &tg)
	if tg.ID == "" || tg.URL != "http://10.0.0.120:8090" {
		t.Errorf("added %+v", tg)
	}
	if code, body, _ := relaySend(t, "POST", hs.URL+"/api/v1/targets", `{"name":"x","url":"file:///etc/passwd"}`, nil); code != 400 {
		t.Errorf("a file address: %d %s, want 400", code, body)
	}
	if code, _, _ := relaySend(t, "PUT", hs.URL+"/api/v1/targets/"+tg.ID, `{"name":"Line 1","url":"http://10.0.0.121:8090"}`, nil); code != 200 {
		t.Errorf("change: %d", code)
	}
	if code, _, _ := relaySend(t, "PUT", hs.URL+"/api/v1/targets/nope", `{"name":"a","url":"http://a:1"}`, nil); code != 404 {
		t.Errorf("change of a missing target: %d, want 404", code)
	}
	_, body, _ = relaySend(t, "GET", hs.URL+"/api/v1/targets", "", nil)
	if !strings.Contains(body, `"Line 1"`) || !strings.Contains(body, `http://10.0.0.121:8090`) {
		t.Errorf("list: %s", body)
	}
	if code, _, _ := relaySend(t, "DELETE", hs.URL+"/api/v1/targets/"+tg.ID, "", nil); code != 200 {
		t.Errorf("remove: %d", code)
	}
	if code, _, _ := relaySend(t, "DELETE", hs.URL+"/api/v1/targets/"+tg.ID, "", nil); code != 404 {
		t.Errorf("remove again: %d, want 404", code)
	}
}

func TestRelayPassesARequestOn(t *testing.T) {
	base, id, panel, _ := relayServer(t)
	relay := base + "/api/v1/targets/" + id + "/relay"

	code, body, h := relaySend(t, "POST", relay+"/api/v1/tag/ns%3ALine1%2FTemp?x=1&y=two", `{"value":5}`, map[string]string{
		"Origin":         "http://localhost:8080",
		"Cookie":         "session=local",
		"Authorization":  "Bearer LOCAL-TOKEN",
		TargetAuthHeader: "Bearer PANEL-TOKEN",
		"Content-Type":   "application/json",
	})
	if code != 200 || body != `{"from":"panel"}` {
		t.Fatalf("relay: %d %s", code, body)
	}
	method, path, query, sent, ph := panel.seen()
	if method != "POST" || path != "/api/v1/tag/ns%3ALine1%2FTemp" || query != "x=1&y=two" || sent != `{"value":5}` {
		t.Errorf("the panel saw %s %s?%s %s", method, path, query, sent)
	}
	if got := ph.Get("Authorization"); got != "Bearer PANEL-TOKEN" {
		t.Errorf("the panel got Authorization %q, want its own token and never this program's", got)
	}
	for _, name := range []string{"Origin", "Cookie", "Referer", TargetAuthHeader} {
		if got := ph.Get(name); got != "" {
			t.Errorf("the panel got %s: %q, want it removed", name, got)
		}
	}
	if got := h.Get("Access-Control-Allow-Origin"); got == "*" {
		t.Errorf("the panel's CORS answer reached the browser")
	}

	// With no token for the panel, none is sent (this program's own is still not passed on).
	relaySend(t, "GET", relay+"/api/v1/project", "", map[string]string{"Authorization": "Bearer LOCAL-TOKEN"})
	if _, _, _, _, ph := panel.seen(); ph.Get("Authorization") != "" {
		t.Errorf("this program's token was passed to the panel: %q", ph.Get("Authorization"))
	}

	// The panel's status is the answer.
	if code, _, _ := relaySend(t, "POST", relay+"/api/v1/multi", "", nil); code != 207 {
		t.Errorf("status %d, want the panel's 207", code)
	}
}

func TestRelayOnlyPassesARuntimesAPIAndWebSockets(t *testing.T) {
	base, id, panel, _ := relayServer(t)
	relay := base + "/api/v1/targets/" + id + "/relay"
	tests := []struct {
		name, rest string
		want       int
	}{
		{"the api", "/api/v1/project", 200},
		{"a websocket path, asked without an upgrade", "/ws/tags", 200},
		{"the root", "/", 400},
		{"nothing (no such route)", "", 404},
		{"the ide", "/ide/", 400},
		{"another api version", "/api/v2/project", 400},
		{"a path that only starts like the api", "/api/v1x/project", 400},
		{"the mcp server", "/mcp", 400},
		{"the target's own targets", "/api/v1/targets", 400},
		{"a relay through the target", "/api/v1/targets/abc/relay/api/v1/project", 400},
		{"up and out of the api", "/api/v1/%2e%2e/%2e%2e/secret", 400},
		{"a dot segment", "/api/v1/./project", 400},
		{"a bad escape", "/api/v1/%zz", 400},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			panel.mu.Lock()
			panel.last.path = ""
			panel.mu.Unlock()
			req, _ := http.NewRequest("GET", relay, nil)
			req.URL.Opaque = strings.TrimPrefix(relay, "http:") + tc.rest // exactly as written: no cleaning by the client
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != tc.want {
				t.Errorf("status %d, want %d", resp.StatusCode, tc.want)
			}
			if _, path, _, _, _ := panel.seen(); tc.want != 200 && path != "" {
				t.Errorf("the panel was asked for %q", path)
			}
		})
	}
}

func TestRelayToAnUnknownOrSilentTarget(t *testing.T) {
	relayDial = 500 * time.Millisecond
	t.Cleanup(func() { relayDial = 3 * time.Second })
	srv, _, hs := newTestServer(t)
	srv.Targets, _ = targets.Open("")

	if code, _, _ := relaySend(t, "GET", hs.URL+"/api/v1/targets/nope/relay/api/v1/project", "", nil); code != 404 {
		t.Errorf("unknown target: %d, want 404", code)
	}
	// A port nothing listens on.
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := l.Addr().String()
	l.Close()
	tg, _ := srv.Targets.Add("Gone", "http://"+addr)
	code, body, _ := relaySend(t, "GET", hs.URL+"/api/v1/targets/"+tg.ID+"/relay/api/v1/project", "", nil)
	if code != 502 || !strings.Contains(body, "no answer from "+addr) {
		t.Errorf("silent target: %d %s, want 502 naming the address", code, body)
	}
}

func TestRelayIsForThisComputerUnlessLoginsAreOn(t *testing.T) {
	_, id, _, srv := relayServer(t)
	tests := []struct {
		name, remote string
		want         int
	}{
		{"this computer, IPv4", "127.0.0.1:50000", 200},
		{"this computer, IPv6", "[::1]:50000", 200},
		{"another computer on the network", "10.0.0.50:50000", 403},
		{"an address that is not one", "nonsense", 403},
	}
	for _, tc := range tests {
		for _, path := range []string{"/api/v1/targets", "/api/v1/targets/" + id + "/relay/api/v1/project"} {
			t.Run(tc.name+" "+path, func(t *testing.T) {
				req := httptest.NewRequest("GET", path, nil)
				req.RemoteAddr = tc.remote
				rec := httptest.NewRecorder()
				srv.Handler().ServeHTTP(rec, req)
				if rec.Code != tc.want {
					t.Errorf("status %d, want %d (%s)", rec.Code, tc.want, rec.Body.String())
				}
			})
		}
	}
}

func TestRelayWithLoginsNeedsTheDeployPermission(t *testing.T) {
	s := newSecureServer(t)
	store, _ := targets.Open("")
	s.srv.Targets = store
	panel := newFakePanel(t)
	tg, _ := store.Add("Panel", panel.hs.URL)
	tests := []struct {
		name, token string
		want        int
	}{
		{"no token", "", 401},
		{"an operator", s.opToken, 403},
		{"an admin", s.adminToken, 200},
	}
	for _, tc := range tests {
		for _, path := range []string{"/api/v1/targets", "/api/v1/targets/" + tg.ID + "/relay/api/v1/project"} {
			t.Run(tc.name+" "+path, func(t *testing.T) {
				// From another computer: with logins on, the permission decides, not the address.
				req := httptest.NewRequest("GET", path, nil)
				req.RemoteAddr = "10.0.0.50:50000"
				if tc.token != "" {
					req.Header.Set("Authorization", "Bearer "+tc.token)
				}
				rec := httptest.NewRecorder()
				s.srv.Handler().ServeHTTP(rec, req)
				if rec.Code != tc.want {
					t.Errorf("status %d, want %d (%s)", rec.Code, tc.want, rec.Body.String())
				}
			})
		}
	}
	if _, _, _, _, ph := panel.seen(); ph.Get("Authorization") != "" {
		t.Errorf("the admin's token for this program reached the panel: %q", ph.Get("Authorization"))
	}
}

func TestRelayCarriesAWebSocket(t *testing.T) {
	base, id, panel, _ := relayServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(base, "http") + "/api/v1/targets/" + id + "/relay/ws/echo?token=abc"
	// A browser sends its page's origin; the panel would refuse it, so the relay must take it off.
	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"http://localhost:8080"}}})
	if err != nil {
		t.Fatalf("dial through the relay: %v", err)
	}
	defer c.CloseNow()
	if err := c.Write(ctx, websocket.MessageText, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	_, msg, err := c.Read(ctx)
	if err != nil || string(msg) != "echo:hello" {
		t.Fatalf("read %q, %v; want echo:hello", msg, err)
	}
	_, path, query, _, ph := panel.seen()
	if path != "/ws/echo" || query != "token=abc" || ph.Get("Origin") != "" {
		t.Errorf("the panel saw %s?%s with Origin %q", path, query, ph.Get("Origin"))
	}
}

func TestAliveReportsVersionAndFormat(t *testing.T) {
	srv, _, hs := newTestServer(t)
	srv.Version = "v9.9.9"
	_, body, _ := relaySend(t, "GET", hs.URL+"/api/v1/alive", "", nil)
	var got map[string]any
	_ = json.Unmarshal([]byte(body), &got)
	if got["ok"] != true || got["version"] != "v9.9.9" || got["schemaVersion"] != 6.0 {
		t.Errorf("alive = %v", got)
	}
}
