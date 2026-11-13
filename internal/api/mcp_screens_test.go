package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// callMCP calls one MCP tool and gives its text and whether it is an error.
func callMCP(t *testing.T, url, tool string, args map[string]any) (string, bool) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": map[string]any{"name": tool, "arguments": args}})
	resp, err := http.Post(url+"/mcp", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out struct {
		Result struct {
			Content []struct{ Text string } `json:"content"`
			IsError bool                    `json:"isError"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || len(out.Result.Content) == 0 {
		t.Fatalf("%s: %s", tool, raw)
	}
	return out.Result.Content[0].Text, out.Result.IsError
}

const mcpStart = `{"schemaVersion": 7, "version": "1", "name": "Plant", "canvasSnap": "pixel",
  "datasources": [{"id": "mem", "label": "mem", "type": "memory", "config": {"memoryTags": [{"path": "speed", "type": "int"}]}}],
  "pages": [{"id": "p1", "name": "Main", "widgets": [{"id": "w1", "type": "numericDisplay", "x": 0, "y": 0, "w": 200, "h": 100, "props": {"label": "Speed", "unit": "rpm"}}]}]}`

func TestMCPBuildsScreens(t *testing.T) {
	_, rt, hs := newTestServer(t)
	if resp := postJSON(t, hs.URL+"/api/v1/project", mcpStart); resp.StatusCode != 200 {
		t.Fatalf("deploy: %d", resp.StatusCode)
	}

	t.Run("the tools are listed", func(t *testing.T) {
		resp := postJSON(t, hs.URL+"/mcp", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		for _, name := range []string{"list_pages", "get_page", "list_widget_types", "add_page", "delete_page", "add_widget", "update_widget", "delete_widget", "add_custom_widget"} {
			if !strings.Contains(string(raw), `"`+name+`"`) {
				t.Errorf("%s is not listed", name)
			}
		}
	})

	t.Run("reads pages and widget types", func(t *testing.T) {
		got, isErr := callMCP(t, hs.URL, "list_pages", nil)
		if isErr || !strings.Contains(got, `"units": "pixels"`) || !strings.Contains(got, `"name": "Main"`) {
			t.Errorf("list_pages: %s", got)
		}
		got, _ = callMCP(t, hs.URL, "get_page", map[string]any{"page": "Main"})
		if !strings.Contains(got, `"unit": "rpm"`) {
			t.Errorf("get_page: %s", got)
		}
		got, _ = callMCP(t, hs.URL, "list_widget_types", nil)
		if !strings.Contains(got, `"type": "gauge"`) || !strings.Contains(got, `"unit"`) {
			t.Errorf("list_widget_types: %s", got[:min(200, len(got))])
		}
	})

	t.Run("adds a page and a widget on it, deployed", func(t *testing.T) {
		got, isErr := callMCP(t, hs.URL, "add_page", map[string]any{"name": "Pumps", "icon": "pump"})
		if isErr || !strings.Contains(got, `added page "Pumps"`) {
			t.Fatalf("add_page: %s", got)
		}
		got, isErr = callMCP(t, hs.URL, "add_widget", map[string]any{
			"page": "Pumps", "type": "gauge", "x": 40, "y": 40, "w": 240, "h": 200,
			"props": map[string]any{"label": "Pump 1", "min": 0, "max": 3000}, "bindings": map[string]any{"value": "mem:speed"},
		})
		if isErr {
			t.Fatalf("add_widget: %s", got)
		}
		p := rt.Project()
		if len(p.Pages) != 2 || p.Pages[1].Name != "Pumps" || len(p.Pages[1].Widgets) != 1 || p.Pages[1].Widgets[0].Type != "gauge" {
			t.Errorf("the runtime runs %+v", p.Pages)
		}
	})

	t.Run("changes a widget: settings merged, null removes one, nothing else touched", func(t *testing.T) {
		got, isErr := callMCP(t, hs.URL, "update_widget", map[string]any{"page": "p1", "id": "w1", "x": 16, "props": map[string]any{"label": "Pump speed", "unit": nil}})
		if isErr {
			t.Fatalf("update_widget: %s", got)
		}
		w := rt.Project().Pages[0].Widgets[0]
		raw, _ := json.Marshal(w.Props)
		if w.X != 16 || w.Y != 0 || !strings.Contains(string(raw), `"label":"Pump speed"`) || strings.Contains(string(raw), "unit") {
			t.Errorf("widget now %+v %s", w, raw)
		}
	})

	t.Run("a change that leaves the project invalid is refused, and nothing changes", func(t *testing.T) {
		before, _ := json.Marshal(rt.Project())
		got, isErr := callMCP(t, hs.URL, "add_widget", map[string]any{"page": "Main", "type": "gauge", "x": 0, "y": 0, "w": 10, "h": 10, "props": map[string]any{"momentary": true}})
		if !isErr || !strings.Contains(got, "not changed") || !strings.Contains(got, "unknown setting momentary") {
			t.Errorf("got %s", got)
		}
		got, isErr = callMCP(t, hs.URL, "update_widget", map[string]any{"page": "Main", "id": "nope", "x": 1})
		if !isErr || !strings.Contains(got, `no widget "nope"`) {
			t.Errorf("got %s", got)
		}
		after, _ := json.Marshal(rt.Project())
		if string(before) != string(after) {
			t.Error("the project changed")
		}
	})

	t.Run("deletes, but not the last page", func(t *testing.T) {
		if got, isErr := callMCP(t, hs.URL, "delete_page", map[string]any{"page": "Pumps"}); isErr {
			t.Fatalf("delete_page: %s", got)
		}
		got, isErr := callMCP(t, hs.URL, "delete_page", map[string]any{"page": "Main"})
		if !isErr || !strings.Contains(got, "last page") {
			t.Errorf("got %s", got)
		}
		if got, isErr := callMCP(t, hs.URL, "delete_widget", map[string]any{"page": "Main", "id": "w1"}); isErr {
			t.Fatalf("delete_widget: %s", got)
		}
		if n := len(rt.Project().Pages[0].Widgets); n != 0 {
			t.Errorf("%d widgets left", n)
		}
	})

	t.Run("adds a custom widget with a designed size", func(t *testing.T) {
		got, isErr := callMCP(t, hs.URL, "add_custom_widget", map[string]any{
			"name": "Pump faceplate", "width": 320, "height": 160, "params": []any{"speed"},
			"widgets": []any{map[string]any{"localId": "v", "type": "numericDisplay", "x": 10, "y": 10, "w": 200, "h": 80, "bindings": map[string]any{"value": "{speed}"}}},
		})
		if isErr {
			t.Fatalf("add_custom_widget: %s", got)
		}
		cws := rt.Project().CustomWidgets
		if len(cws) != 1 || cws[0].Width == nil || *cws[0].Width != 320 || len(cws[0].Params) != 1 {
			t.Errorf("custom widgets %+v", cws)
		}
	})

	t.Run("each change is a version that says what it was", func(t *testing.T) {
		resp, _ := http.Get(hs.URL + "/api/v1/versions")
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		for _, label := range []string{"MCP: add page Pumps", "MCP: add gauge to Pumps", "MCP: change w1", "MCP: add custom widget Pump faceplate"} {
			if !strings.Contains(string(raw), label) {
				t.Errorf("no version labelled %q in %s", label, raw)
			}
		}
	})
}
