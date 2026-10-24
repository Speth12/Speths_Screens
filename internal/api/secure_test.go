package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/Speth12/Speths_Screens/internal/versionstore"
)

// secureServer is a test server with security on from the start, so no
// handler ever sees it change, and with an admin and an operator account.
type secureServer struct {
	hs                  *httptest.Server
	rt                  *runtime.Runtime
	adminToken, opToken string
}

func newSecureServer(t *testing.T) *secureServer {
	t.Helper()
	sec, err := security.Open(":memory:", []byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sec.Close() })
	ctx := context.Background()
	tokens := map[string]string{}
	for _, u := range []struct {
		name string
		role security.Role
	}{{"admin", security.RoleAdmin}, {"op", security.RoleOperator}} {
		if _, err := sec.CreateUser(ctx, u.name, u.name+"-test-pass", u.role); err != nil {
			t.Fatal(err)
		}
		tok, _, err := sec.Login(ctx, u.name, u.name+"-test-pass")
		if err != nil {
			t.Fatal(err)
		}
		tokens[u.name] = tok
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
	return &secureServer{hs: hs, rt: rt, adminToken: tokens["admin"], opToken: tokens["op"]}
}

// do sends a request with an optional token and returns status and body.
func (s *secureServer) do(t *testing.T, method, path, token, body string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, s.hs.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

// Routes that were reachable without a login and must not be.
func TestFormerlyOpenRoutesNeedLogin(t *testing.T) {
	s := newSecureServer(t)
	mcpCall := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	tests := []struct {
		name     string
		method   string
		path     string
		body     string
		token    string
		wantCode int // exact, or 0 for "anything but 401/403"
	}{
		{"MCP without a token", "POST", "/mcp", mcpCall, "", 401},
		{"MCP as operator", "POST", "/mcp", mcpCall, s.opToken, 403},
		{"MCP as admin", "POST", "/mcp", mcpCall, s.adminToken, 0},
		{"datasource test without a token", "POST", "/api/v1/datasources/test", `{"id":"x","type":"rest","label":"x","config":{"endpoint":"http://127.0.0.1:1"}}`, "", 401},
		{"datasource test as operator", "POST", "/api/v1/datasources/test", `{"id":"x","type":"rest","label":"x","config":{"endpoint":"http://127.0.0.1:1"}}`, s.opToken, 403},
		{"datasource browse without a token", "GET", "/api/v1/datasources/x/tags", "", "", 401},
		{"datasource status without a token", "GET", "/api/v1/datasources/x/status", "", "", 401},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			code, body := s.do(t, tc.method, tc.path, tc.token, tc.body)
			if tc.wantCode != 0 && code != tc.wantCode {
				t.Errorf("HTTP %d %s, want %d", code, body, tc.wantCode)
			}
			if tc.wantCode == 0 && (code == 401 || code == 403) {
				t.Errorf("HTTP %d %s, want access", code, body)
			}
		})
	}
}

const secretDeploy = `{
  "version": "0.1.0",
  "datasources": [{"id": "plc", "label": "plc", "type": "rest",
    "config": {"endpoint": "http://127.0.0.1:1", "username": "hmi", "password": "plc-secret-pass", "bearerToken": "plc-secret-token"}}],
  "pages": [{"id": "p1", "name": "Main", "widgets": []}]
}`

// Datasource passwords and tokens stay on the runtime.
func TestProjectSecretsStayOnTheRuntime(t *testing.T) {
	s := newSecureServer(t)
	if code, body := s.do(t, "POST", "/api/v1/project", s.adminToken, secretDeploy); code != 200 {
		t.Fatalf("deploy: %d %s", code, body)
	}

	_, project := s.do(t, "GET", "/api/v1/project", s.adminToken, "")
	_, version := s.do(t, "GET", "/api/v1/versions/1", s.adminToken, "")
	_, mcpProject := s.do(t, "POST", "/mcp", s.adminToken, `{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"xhmi://project"}}`)
	for name, body := range map[string]string{"GET /project": project, "GET /versions/1": version, "MCP project": mcpProject} {
		if strings.Contains(body, "plc-secret") {
			t.Errorf("%s returned a datasource secret: %s", name, body)
		}
		if !strings.Contains(body, "hmi") {
			t.Errorf("%s lost the username: %s", name, body)
		}
	}

	// Deploying back what GET returned keeps the stored secrets.
	if code, body := s.do(t, "POST", "/api/v1/project", s.adminToken, project); code != 200 {
		t.Fatalf("redeploy: %d %s", code, body)
	}
	cfg := s.rt.Project().Datasources[0].Config
	if cfg.Password == nil || *cfg.Password != "plc-secret-pass" || cfg.BearerToken == nil || *cfg.BearerToken != "plc-secret-token" {
		t.Errorf("secrets lost on redeploy: %+v", cfg)
	}
}

// MCP writes go through the write pipeline.
func TestMCPWritesUseThePipeline(t *testing.T) {
	s := newSecureServer(t)
	if code, body := s.do(t, "POST", "/api/v1/project", s.adminToken, writeTestProject); code != 200 {
		t.Fatalf("deploy: %d %s", code, body)
	}
	call := func(binding string, value float64) map[string]any {
		body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
			"params": map[string]any{"name": "write_tag", "arguments": map[string]any{"binding": binding, "value": value}}})
		_, resp := s.do(t, "POST", "/mcp", s.adminToken, string(body))
		var out struct {
			Result map[string]any `json:"result"`
		}
		_ = json.Unmarshal([]byte(resp), &out)
		return out.Result
	}
	if r := call("calc:sp", 12); r["isError"] == true {
		t.Errorf("writable tag: %v", r)
	}
	if r := call("calc:shown", 1); r["isError"] != true {
		t.Errorf("display-only tag was written over MCP: %v", r)
	}
	if r := call("calc:sp", 500); r["isError"] != true {
		t.Errorf("value above the widget's maximum was written over MCP: %v", r)
	}
}
