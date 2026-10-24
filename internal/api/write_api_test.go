package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// writeTestProject has a calculated datasource "calc" whose tag "sp" is
// written by a numeric input limited to 0..100; "shown" is display only.
const writeTestProject = `{
  "version": "0.1.0",
  "datasources": [{"id": "calc", "label": "calc", "type": "virtual",
    "config": {"tags": "[{\"path\":\"sp\",\"formula\":\"0\"},{\"path\":\"shown\",\"formula\":\"1\"}]"}}],
  "pages": [{"id": "p1", "name": "Main", "widgets": [
    {"id": "in", "type": "numericInput", "x": 0, "y": 0, "w": 1, "h": 1, "binding": "calc:sp", "config": {"min": 0, "max": 100}},
    {"id": "out", "type": "numericDisplay", "x": 1, "y": 0, "w": 1, "h": 1, "binding": "calc:shown"}
  ]}]
}`

func TestWriteTagHTTP(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp := postJSON(t, hs.URL+"/api/v1/project", writeTestProject)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("deploy: %d", resp.StatusCode)
	}

	tests := []struct {
		name       string
		path       string
		body       string
		wantCode   int
		wantStatus string
		wantOK     bool
	}{
		{"confirmed", "sp", `{"datasource":"calc","value":50}`, 200, "confirmed", true},
		{"named widget", "sp", `{"datasource":"calc","value":60,"widgetId":"in"}`, 200, "confirmed", true},
		{"above the maximum", "sp", `{"datasource":"calc","value":150}`, 400, "failed", false},
		{"display-only tag", "shown", `{"datasource":"calc","value":5}`, 404, "failed", false},
		{"unknown namespace path", "plant.nothing", `{"datasource":"ns","value":5}`, 404, "failed", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := http.Post(hs.URL+"/api/v1/tag/"+tc.path, "application/json", strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			var got map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&got)
			if resp.StatusCode != tc.wantCode || got["status"] != tc.wantStatus || got["ok"] != tc.wantOK {
				t.Errorf("HTTP %d %v, want %d status=%s ok=%v", resp.StatusCode, got, tc.wantCode, tc.wantStatus, tc.wantOK)
			}
			if tc.wantStatus == "failed" && got["reason"] == nil {
				t.Error("a failed write has no reason")
			}
		})
	}
}
