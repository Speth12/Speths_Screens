package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/Speth12/Speths_Screens/internal/versionstore"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// ── test helpers ───────────────────────────────────────────────────────────

func newTestServer(t *testing.T) (*Server, *runtime.Runtime, *httptest.Server) {
	t.Helper()
	rt := runtime.New(nil, nil)
	rt.Start(context.Background())
	t.Cleanup(rt.Stop)
	vs, err := versionstore.Open(":memory:")
	if err != nil {
		t.Fatalf("versionstore: %v", err)
	}
	t.Cleanup(func() { _ = vs.Close() })
	srv := New(rt, nil, vs)
	hs := httptest.NewServer(srv.Handler())
	t.Cleanup(hs.Close)
	return srv, rt, hs
}

func postJSON(t *testing.T, url, body string) *http.Response {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func decodeBody(t *testing.T, r *http.Response) map[string]any {
	t.Helper()
	defer r.Body.Close()
	var m map[string]any
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("decode: %v body=%s", err, b)
	}
	return m
}

const minimalProject = `{
	"version":"0.1.0",
	"datasources":[],
	"pages":[{"id":"p1","name":"Main","widgets":[]}]
}`

const projectWithAlarms = `{
	"version":"0.1.0",
	"datasources":[],
	"pages":[{"id":"p1","name":"Main","widgets":[]}],
	"alarmRules":[{
		"id":"r1","name":"High Temp","binding":"virt:temp",
		"condition":"gt","threshold":100,"severity":"warning","message":"Temperature high"
	}]
}`

const projectWithRecipes = `{
	"version":"0.1.0",
	"datasources":[{
		"id":"virt","label":"Virtual","type":"virtual",
		"config":{"tags":"[{\"path\":\"sp\",\"formula\":\"0\"}]"}
	}],
	"pages":[{"id":"p1","name":"Main","widgets":[]}],
	"recipes":[{
		"id":"rec1","name":"Reset",
		"entries":[{"binding":"virt:sp","value":0}]
	}]
}`

// ── alive ──────────────────────────────────────────────────────────────────

func TestAlive(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, err := http.Get(hs.URL + "/api/v1/alive")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status: %d", resp.StatusCode)
	}
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body["ok"] != true {
		t.Errorf("body: %v", body)
	}
}

// ── project deploy / get ───────────────────────────────────────────────────

func TestPostProjectValidates(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp := postJSON(t, hs.URL+"/api/v1/project", `{"version":"0.1.0"}`) // no pages
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestPostProjectAccepts(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp := postJSON(t, hs.URL+"/api/v1/project", minimalProject)
	body := decodeBody(t, resp)
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body=%v", resp.StatusCode, body)
	}
	if body["ok"] != true {
		t.Errorf("body: %v", body)
	}

	resp2, _ := http.Get(hs.URL + "/api/v1/project")
	defer resp2.Body.Close()
	var p map[string]any
	_ = json.NewDecoder(resp2.Body).Decode(&p)
	if p["version"] != "0.1.0" {
		t.Errorf("project not stored: %v", p)
	}
}

// ── tag read/write ─────────────────────────────────────────────────────────

func TestReadTag(t *testing.T) {
	_, rt, hs := newTestServer(t)
	rt.Store.Update("test.tag", tagstore.TagState{Value: 42, Quality: "Good", TS: time.Now().UnixNano()})
	resp, err := http.Get(hs.URL + "/api/v1/tag/test.tag")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status: %d", resp.StatusCode)
	}
	var st map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&st)
	if st["Value"].(float64) != 42 {
		t.Errorf("value: %v", st)
	}
}

func TestReadUnknownTag(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, err := http.Get(hs.URL + "/api/v1/tag/missing.tag")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ── WebSocket ──────────────────────────────────────────────────────────────

func TestWebSocketSubscribe(t *testing.T) {
	_, rt, hs := newTestServer(t)
	wsURL := strings.Replace(hs.URL, "http://", "ws://", 1) + "/ws/tags"

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	if err := wsjson.Write(ctx, conn, map[string][]string{"subscribe": {"sensor.live"}}); err != nil {
		t.Fatalf("Write: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	rt.Store.Update("sensor.live", tagstore.TagState{Value: 7.5, Quality: "Good", TS: time.Now().UnixNano()})

	var got map[string]any
	if err := wsjson.Read(ctx, conn, &got); err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got["path"] != "sensor.live" {
		t.Errorf("path: %v", got)
	}
	if got["value"].(float64) != 7.5 {
		t.Errorf("value: %v", got)
	}
}

// ── alarms ─────────────────────────────────────────────────────────────────

func TestAlarmTriggersAndAck(t *testing.T) {
	_, rt, hs := newTestServer(t)

	// Deploy project with an alarm rule.
	resp := postJSON(t, hs.URL+"/api/v1/project", projectWithAlarms)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("deploy: %d %s", resp.StatusCode, body)
	}
	resp.Body.Close()

	// Simulate tag exceeding threshold.
	rt.Alarms.Evaluate("virt:temp", 105.0)
	time.Sleep(20 * time.Millisecond)

	// GET /api/v1/alarms — should have one active event.
	resp2, err := http.Get(hs.URL + "/api/v1/alarms")
	if err != nil {
		t.Fatalf("GET alarms: %v", err)
	}
	defer resp2.Body.Close()
	var events []map[string]any
	_ = json.NewDecoder(resp2.Body).Decode(&events)
	if len(events) != 1 {
		t.Fatalf("expected 1 alarm, got %d", len(events))
	}
	if events[0]["active"] != true {
		t.Errorf("alarm not active: %v", events[0])
	}
	eventID := events[0]["id"].(string)

	// POST /api/v1/alarms/{id}/ack
	resp3, err := http.Post(hs.URL+"/api/v1/alarms/"+eventID+"/ack", "application/json", nil)
	if err != nil {
		t.Fatalf("ack: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != 200 {
		t.Errorf("ack status: %d", resp3.StatusCode)
	}

	// Verify acked state.
	resp4, _ := http.Get(hs.URL + "/api/v1/alarms")
	defer resp4.Body.Close()
	var events2 []map[string]any
	_ = json.NewDecoder(resp4.Body).Decode(&events2)
	if len(events2) == 0 || events2[0]["acked"] != true {
		t.Errorf("alarm not acked: %v", events2)
	}
}

func TestAlarmAckMissing(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, _ := http.Post(hs.URL+"/api/v1/alarms/nonexistent/ack", "application/json", nil)
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ── recipes ────────────────────────────────────────────────────────────────

func TestListRecipesEmpty(t *testing.T) {
	_, _, hs := newTestServer(t)
	// No project loaded — list should return empty array, not 503.
	resp, err := http.Get(hs.URL + "/api/v1/recipes")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestRecipeApplyMissingProject(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, _ := http.Post(hs.URL+"/api/v1/recipes/rec1/apply", "application/json", nil)
	defer resp.Body.Close()
	if resp.StatusCode != 503 {
		t.Errorf("expected 503, got %d", resp.StatusCode)
	}
}

func TestRecipeApplyNotFound(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp := postJSON(t, hs.URL+"/api/v1/project", minimalProject)
	resp.Body.Close()

	resp2, _ := http.Post(hs.URL+"/api/v1/recipes/bogus/apply", "application/json", nil)
	defer resp2.Body.Close()
	if resp2.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp2.StatusCode)
	}
}

func TestRecipeApplySuccess(t *testing.T) {
	_, _, hs := newTestServer(t)
	// Deploy a project with a virtual driver and a recipe.
	resp := postJSON(t, hs.URL+"/api/v1/project", projectWithRecipes)
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("deploy: %d %s", resp.StatusCode, body)
	}
	resp.Body.Close()
	time.Sleep(100 * time.Millisecond) // let virtual driver start

	// Apply the recipe — writes virt:sp = 0 via the virtual driver.
	resp2, err := http.Post(hs.URL+"/api/v1/recipes/rec1/apply", "application/json", nil)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	body := decodeBody(t, resp2)
	if resp2.StatusCode != 200 {
		t.Fatalf("apply status %d body=%v", resp2.StatusCode, body)
	}
	if body["ok"] != true {
		t.Errorf("ok not true: %v", body)
	}
	applied, _ := body["applied"].(float64)
	if applied != 1 {
		t.Errorf("expected 1 applied, got %v", body["applied"])
	}
}

// ── project versioning ─────────────────────────────────────────────────────

func TestVersionsEmptyList(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, err := http.Get(hs.URL + "/api/v1/versions")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestVersionSavedOnDeploy(t *testing.T) {
	_, _, hs := newTestServer(t)

	// Deploy twice — each should create a version.
	for i := 0; i < 2; i++ {
		resp := postJSON(t, hs.URL+"/api/v1/project", minimalProject)
		body := decodeBody(t, resp)
		if resp.StatusCode != 200 {
			t.Fatalf("deploy %d: %v", i, body)
		}
	}

	resp, _ := http.Get(hs.URL + "/api/v1/versions")
	defer resp.Body.Close()
	var metas []map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&metas)
	if len(metas) != 2 {
		t.Errorf("expected 2 versions, got %d", len(metas))
	}
}

func TestVersionGetAndRestore(t *testing.T) {
	_, _, hs := newTestServer(t)

	// Deploy v1.
	resp := postJSON(t, hs.URL+"/api/v1/project?label=v1", minimalProject)
	body := decodeBody(t, resp)
	if resp.StatusCode != 200 {
		t.Fatalf("deploy: %v", body)
	}
	v1ID := int64(body["versionId"].(float64))

	// GET the version.
	resp2, _ := http.Get(hs.URL + "/api/v1/versions/" + int64str(v1ID))
	ver := decodeBody(t, resp2)
	if resp2.StatusCode != 200 {
		t.Fatalf("get version: %v", ver)
	}
	if ver["label"] != "v1" {
		t.Errorf("label: %v", ver["label"])
	}
	if ver["project"] == nil {
		t.Errorf("project missing from version response")
	}

	// Restore it — should succeed and create a new version entry.
	resp3, err := http.Post(hs.URL+"/api/v1/versions/"+int64str(v1ID)+"/restore", "application/json", nil)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	res := decodeBody(t, resp3)
	if resp3.StatusCode != 200 {
		t.Fatalf("restore status %d: %v", resp3.StatusCode, res)
	}
	if res["ok"] != true {
		t.Errorf("restore ok: %v", res)
	}

	// There should now be 2 versions (original + restore).
	resp4, _ := http.Get(hs.URL + "/api/v1/versions")
	defer resp4.Body.Close()
	var all []map[string]any
	_ = json.NewDecoder(resp4.Body).Decode(&all)
	if len(all) != 2 {
		t.Errorf("expected 2 versions after restore, got %d", len(all))
	}
}

func TestVersionGetNotFound(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, _ := http.Get(hs.URL + "/api/v1/versions/9999")
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestVersionRestoreNotFound(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp, _ := http.Post(hs.URL+"/api/v1/versions/9999/restore", "application/json", nil)
	defer resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

func int64str(n int64) string { return strconv.FormatInt(n, 10) }
