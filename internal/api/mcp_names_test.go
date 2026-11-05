package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// The MCP server is Speth's Screens now; resource URIs a client stored from before the rename still read.
func TestMCPNamesAndLegacyURIs(t *testing.T) {
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
	if strings.Contains(list, "xhmi://") || !strings.Contains(list, "speths-screens://project") {
		t.Errorf("resources/list should name only speths-screens:// URIs: %s", list)
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
		if cur, old := read("speths-screens://"+name), read("xhmi://"+name); cur != old {
			t.Errorf("%s: the legacy URI reads differently from the current one", name)
		}
	}
}
