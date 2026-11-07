package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// The MCP server names itself speths-screens and lists only speths-screens:// resource URIs.
func TestMCPNames(t *testing.T) {
	s := newSecureServer(t)
	call := func(method, params string) string {
		t.Helper()
		code, body := s.do(t, "POST", "/mcp", s.adminToken, `{"jsonrpc":"2.0","id":1,"method":"`+method+`","params":`+params+`}`)
		if code != 200 {
			t.Fatalf("%s: %d %s", method, code, body)
		}
		return body
	}

	var init struct {
		Result struct {
			ServerInfo struct{ Name string } `json:"serverInfo"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(call("initialize", `{}`)), &init); err != nil {
		t.Fatal(err)
	}
	if init.Result.ServerInfo.Name != "speths-screens" {
		t.Errorf("server name %q, want speths-screens", init.Result.ServerInfo.Name)
	}

	list := call("resources/list", `{}`)
	if !strings.Contains(list, "speths-screens://project") {
		t.Errorf("resources/list should name the speths-screens:// resources: %s", list)
	}

	read := func(uri string) string {
		var out struct {
			Result struct {
				Contents []struct{ Text string } `json:"contents"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(call("resources/read", `{"uri":"`+uri+`"}`)), &out); err != nil || len(out.Result.Contents) != 1 {
			t.Fatalf("read %s: %v %+v", uri, err, out)
		}
		return out.Result.Contents[0].Text
	}
	for _, name := range []string{"project", "pages", "alarms", "recipes", "datasources"} {
		if text := read("speths-screens://" + name); text == "" {
			t.Errorf("%s reads empty", name)
		}
	}
}
