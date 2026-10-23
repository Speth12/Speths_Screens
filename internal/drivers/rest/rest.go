// Package rest implements ProtocolDriver for HTTP/JSON REST endpoints.
//
// Two operating modes are auto-detected from cfg.Extra["basePath"]:
//
//  1. PLCnext pxc_api mode (basePath contains "_pxc_api"):
//     Browse: GET <baseURL>/_pxc_api/v*/ports → Ports{} map → tag list.
//     Poll:   GET <baseURL>/_pxc_api/v*/variables?pathPrefix=<component>/&paths=<var1>,<var2>
//     batches all subscribed paths into one request per component group.
//
//  2. Generic REST mode (any other basePath):
//     Browse: GET basePath, walk the JSON response tree for path/name fields.
//     Poll:   GET basePath/<tag-path>[#gjson-selector] per tag.
//
// Tag path for widgets:
//
//	PLCnext:  Arp.Plc.Eclr/MainInstance.rHMI  (full port name from /ports)
//	Generic:  api/sensors#temperature           (URL relative to basePath, optional #gjson)
package rest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/tidwall/gjson"
)

const (
	driverID    = "rest"
	pollDefault = 1 * time.Second
)

// Driver implements drivers.ProtocolDriver.
type Driver struct {
	mu        sync.Mutex
	hc        *http.Client
	baseURL   string // e.g. https://192.168.88.10
	basePath  string // e.g. /_pxc_api/v1.14  (trimmed of trailing slash)
	isPXC     bool   // true when basePath contains "_pxc_api"
	pxcVarURL string // full URL to the variables endpoint (PLCnext mode)
	token     string
	pollEvery time.Duration
	cancel    context.CancelFunc // stops the poll loop; nil when not connected
	out       chan<- tagstore.TagUpdate
	wg        sync.WaitGroup

	tags atomic.Pointer[tagSet] // current poll set, swapped by SetTags

	connected atomic.Bool
	lastErr   atomic.Pointer[string]
	tagCount  atomic.Int32
}

func New() *Driver { return &Driver{pollEvery: pollDefault} }

func (d *Driver) ID() string { return driverID }

// Connect establishes the HTTP client and detects the API mode.
//
// cfg.Endpoint:             base URL  (e.g. https://192.168.88.10)
// cfg.Extra["basePath"]:   path prefix — for PLCnext use /_pxc_api/v1.14
//
//	(the driver auto-detects _pxc_api and probes the correct version if needed)
//
// cfg.Extra["bearerToken"]: optional Authorization: Bearer <token>
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("rest: endpoint is required")
	}
	d.mu.Lock()
	d.out = out
	d.mu.Unlock()

	d.baseURL = strings.TrimRight(cfg.Endpoint, "/")
	d.basePath = cfg.Extra["basePath"]
	if d.basePath != "" && !strings.HasPrefix(d.basePath, "/") {
		d.basePath = "/" + d.basePath
	}
	d.basePath = strings.TrimRight(d.basePath, "/")
	d.token = cfg.Extra["bearerToken"]

	tr := http.DefaultTransport.(*http.Transport).Clone()
	// Always skip TLS verification — PLCs and embedded devices universally use
	// self-signed certificates on trusted industrial networks.
	tr.TLSClientConfig = insecureTLSConfig()
	d.hc = &http.Client{Timeout: 8 * time.Second, Transport: tr}

	// Auto-detect PLCnext pxc_api mode.
	d.isPXC = strings.Contains(d.basePath, "_pxc_api")
	if d.isPXC {
		apiBase, err := d.probeAPIVersion(ctx)
		if err != nil {
			return d.fail(fmt.Errorf("rest: pxc_api probe failed: %w", err))
		}
		d.pxcVarURL = apiBase + "/variables"
		log.Printf("[DRIVER] rest: PLCnext mode, API base %s", apiBase)
	}

	loopCtx, cancel := context.WithCancel(context.Background())
	d.mu.Lock()
	d.cancel = cancel
	d.mu.Unlock()
	d.connected.Store(true)
	d.lastErr.Store(strPtr(""))
	log.Printf("[DRIVER] rest: connected to %s%s (pxc=%v)", d.baseURL, d.basePath, d.isPXC)

	d.wg.Add(1)
	go d.pollLoop(loopCtx)
	return nil
}

// probeAPIVersion negotiates the highest supported pxc_api version by querying
// the root endpoint. Falls back to the base path verbatim if detection fails.
func (d *Driver) probeAPIVersion(ctx context.Context) (string, error) {
	// Extract the base without any version fragment (e.g. https://host/_pxc_api).
	pxcRoot := d.baseURL + d.basePath
	if i := strings.Index(d.basePath, "/v"); i >= 0 {
		// caller already included a version — use it directly
		return d.baseURL + d.basePath, nil
	}
	// No version in basePath — ask the server which versions it supports.
	body, err := d.getJSON(ctx, pxcRoot+"/api/")
	if err != nil {
		return pxcRoot + "/v1.14", nil // best-effort default
	}
	var resp struct {
		BasePath string `json:"basePath"` // e.g. "/v1.14/"
	}
	if json.Unmarshal(body, &resp) == nil && resp.BasePath != "" {
		ver := strings.Trim(resp.BasePath, "/")
		return d.baseURL + "/_pxc_api/" + ver, nil
	}
	return pxcRoot + "/v1.14", nil
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
	}
	d.mu.Unlock()
	d.wg.Wait()
	d.connected.Store(false)
	return nil
}

// ── Browse ──────────────────────────────────────────────────────────────────

// Browse discovers available tags.
//
// PLCnext: reads /_pxc_api/v*/ports to get all HMI-exported port names.
// Generic: GETs basePath and walks the JSON tree.
func (d *Driver) Browse(ctx context.Context) ([]drivers.TagDefinition, error) {
	if !d.connected.Load() {
		return nil, fmt.Errorf("rest: not connected")
	}

	var out []drivers.TagDefinition
	var err error

	if d.isPXC {
		out, err = d.pxcBrowse(ctx)
	} else {
		out, err = d.genericBrowse(ctx)
	}
	if err != nil {
		return nil, err
	}

	log.Printf("[DRIVER] rest: browse found %d tags", len(out))
	d.tagCount.Store(int32(len(out)))
	return out, nil
}

// pxcBrowse reads the /ports endpoint and returns one TagDefinition per port.
func (d *Driver) pxcBrowse(ctx context.Context) ([]drivers.TagDefinition, error) {
	// Derive ports URL from the variables URL: swap "variables" → "ports".
	portsURL := strings.TrimSuffix(d.pxcVarURL, "/variables") + "/ports"
	body, err := d.getJSON(ctx, portsURL)
	if err != nil {
		return nil, fmt.Errorf("rest: browse ports %s: %w", portsURL, err)
	}

	// Response: { "Ports": { "Arp.Plc.Eclr/MainInstance.rHMI": { "Type": "Real32" }, ... } }
	var resp struct {
		Ports map[string]struct {
			Type string `json:"Type"`
		} `json:"Ports"`
	}
	if err := json.Unmarshal(body, &resp); err != nil || len(resp.Ports) == 0 {
		return nil, nil
	}

	out := make([]drivers.TagDefinition, 0, len(resp.Ports))
	for portPath, info := range resp.Ports {
		label := portPath
		if i := strings.LastIndexAny(portPath, "/."); i >= 0 {
			label = portPath[i+1:]
		}
		out = append(out, drivers.TagDefinition{
			Path:        portPath,
			DataType:    info.Type,
			Description: label,
			Writable:    true,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

// genericBrowse GETs basePath and walks the JSON for tag-like fields.
func (d *Driver) genericBrowse(ctx context.Context) ([]drivers.TagDefinition, error) {
	rootURL := d.baseURL + d.basePath
	body, err := d.getJSON(ctx, rootURL)
	if err != nil {
		return nil, fmt.Errorf("rest: browse GET %s: %w", rootURL, err)
	}
	var out []drivers.TagDefinition
	d.walkResponse(ctx, body, "", &out, 0)
	return out, nil
}

const browseMaxDepth = 3

func (d *Driver) walkResponse(ctx context.Context, body []byte, prefix string, out *[]drivers.TagDefinition, depth int) {
	if depth > browseMaxDepth {
		return
	}
	// JSON array — each element may be a path string or an object with "path"/"name".
	var arr []json.RawMessage
	if json.Unmarshal(body, &arr) == nil && len(arr) > 0 {
		for _, item := range arr {
			var s string
			if json.Unmarshal(item, &s) == nil && s != "" {
				*out = append(*out, tagDefFromPath(s))
				continue
			}
			var obj map[string]json.RawMessage
			if json.Unmarshal(item, &obj) != nil {
				continue
			}
			path := jsonString(obj["path"])
			if path == "" {
				path = jsonString(obj["name"])
			}
			if path == "" {
				continue
			}
			label := jsonString(obj["name"])
			if label == "" {
				label = path
			}
			*out = append(*out, drivers.TagDefinition{
				Path:        path,
				DataType:    jsonString(obj["type"]),
				Description: label,
				Writable:    true,
			})
		}
		return
	}
	// JSON object — recurse into sub-paths or emit leaf keys.
	var obj map[string]json.RawMessage
	if json.Unmarshal(body, &obj) != nil || len(obj) == 0 {
		return
	}
	groupCount := 0
	for _, v := range obj {
		t := strings.TrimSpace(string(v))
		if len(t) > 0 && (t[0] == '{' || t[0] == '[') {
			groupCount++
		}
	}
	if groupCount*2 >= len(obj) {
		for key := range obj {
			sub := key
			if prefix != "" {
				sub = prefix + "/" + key
			}
			subBody, err := d.getJSON(ctx, d.baseURL+d.basePath+"/"+strings.TrimLeft(sub, "/"))
			if err != nil {
				continue
			}
			d.walkResponse(ctx, subBody, sub, out, depth+1)
		}
	} else {
		for key := range obj {
			tagPath := key
			if prefix != "" {
				tagPath = prefix + "#" + key
			}
			*out = append(*out, drivers.TagDefinition{Path: tagPath, Description: key, Writable: true})
		}
	}
}

// ── Tag set / poll ───────────────────────────────────────────────────────────

// tagSet is an immutable poll set. In PLCnext mode the paths are pre-grouped
// by component prefix so each tick sends one request per component.
type tagSet struct {
	paths  []string
	groups []pxcGroup
}

type pxcGroup struct {
	prefix string   // e.g. "Arp.Plc.Eclr/"
	vars   []string // variable names relative to prefix
	paths  []string // original full paths
}

func newTagSet(paths []string) *tagSet {
	ts := &tagSet{paths: paths}
	byPrefix := map[string]*pxcGroup{}
	for _, p := range paths {
		prefix, varName := pxcSplitPath(p)
		g := byPrefix[prefix]
		if g == nil {
			g = &pxcGroup{prefix: prefix}
			byPrefix[prefix] = g
		}
		g.vars = append(g.vars, varName)
		g.paths = append(g.paths, p)
	}
	for _, g := range byPrefix {
		ts.groups = append(ts.groups, *g)
	}
	sort.Slice(ts.groups, func(i, j int) bool { return ts.groups[i].prefix < ts.groups[j].prefix })
	return ts
}

// SetTags replaces the set of polled paths. It is idempotent: calling it with
// the same paths (in any order, with duplicates) changes nothing. An empty set
// keeps the driver connected but idle.
func (d *Driver) SetTags(paths []string) error {
	norm := drivers.NormalizePaths(paths)
	if cur := d.tags.Load(); cur != nil && slices.Equal(cur.paths, norm) {
		return nil
	}
	d.tags.Store(newTagSet(norm))
	d.tagCount.Store(int32(len(norm)))
	log.Printf("[DRIVER] rest: polling %d tags", len(norm))
	return nil
}

func (d *Driver) output() chan<- tagstore.TagUpdate {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.out
}

// pollLoop is the driver's only poll goroutine. It reads the current tag set
// on every tick, so SetTags takes effect on the next tick.
func (d *Driver) pollLoop(ctx context.Context) {
	defer d.wg.Done()
	tick := time.NewTicker(d.pollEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			ts := d.tags.Load()
			out := d.output()
			if ts == nil || len(ts.paths) == 0 || out == nil {
				continue
			}
			if d.isPXC {
				for _, g := range ts.groups {
					d.pxcReadGroup(ctx, g.prefix, g.vars, g.paths, out)
				}
			} else {
				d.genericPoll(ctx, ts.paths, out)
			}
		}
	}
}

// pxcReadGroup reads one component group in a single GET request.
func (d *Driver) pxcReadGroup(ctx context.Context, prefix string, vars []string, fullPaths []string, out chan<- tagstore.TagUpdate) {
	q := url.Values{}
	q.Set("pathPrefix", prefix)
	q.Set("paths", strings.Join(vars, ","))
	reqURL := d.pxcVarURL + "?" + q.Encode()

	body, err := d.getJSON(ctx, reqURL)
	if err != nil {
		log.Printf("[DRIVER] rest: pxc poll error: %v", err)
		return
	}

	// Response: { "variables": [{ "path": "...", "value": ... }] }
	var resp struct {
		Variables []struct {
			Path  string          `json:"path"`
			Value json.RawMessage `json:"value"`
		} `json:"variables"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return
	}

	// Map response by full path.
	byPath := map[string]json.RawMessage{}
	for _, v := range resp.Variables {
		byPath[v.Path] = v.Value
	}

	now := time.Now().UnixNano()
	for i, p := range fullPaths {
		raw, ok := byPath[p]
		if !ok {
			// try by varName in case prefix was already embedded
			_, vn := pxcSplitPath(p)
			raw, ok = byPath[prefix+vn]
		}
		quality := "Bad"
		var val any
		if ok && string(raw) != "null" {
			if err := json.Unmarshal(raw, &val); err == nil {
				quality = "Good"
			}
		}
		_ = i
		select {
		case out <- tagstore.TagUpdate{
			Path:  p,
			State: tagstore.TagState{Value: val, Quality: quality, TS: now},
		}:
		default:
		}
	}
}

// pxcSplitPath splits "Arp.Plc.Eclr/MainInstance.rHMI" into
// prefix="Arp.Plc.Eclr/" and varName="MainInstance.rHMI".
func pxcSplitPath(path string) (prefix, varName string) {
	if i := strings.Index(path, "/"); i >= 0 {
		return path[:i+1], path[i+1:]
	}
	return "", path
}

// genericPoll is the non-PLCnext poll: one GET per path.
func (d *Driver) genericPoll(ctx context.Context, paths []string, out chan<- tagstore.TagUpdate) {
	for _, p := range paths {
		val, quality := d.readOne(ctx, p)
		select {
		case out <- tagstore.TagUpdate{
			Path:  p,
			State: tagstore.TagState{Value: val, Quality: quality, TS: time.Now().UnixNano()},
		}:
		default:
		}
	}
}

func (d *Driver) readOne(ctx context.Context, path string) (any, string) {
	urlPath, gjsonPath := splitPath(path)
	reqURL := d.baseURL + d.basePath + "/" + strings.TrimLeft(urlPath, "/")
	body, err := d.getJSON(ctx, reqURL)
	if err != nil {
		return nil, "Bad"
	}
	if gjsonPath != "" {
		r := gjson.GetBytes(body, gjsonPath)
		if !r.Exists() {
			return nil, "Bad"
		}
		return r.Value(), "Good"
	}
	if v := gjson.GetBytes(body, "value"); v.Exists() {
		return v.Value(), "Good"
	}
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		return string(body), "Good"
	}
	return v, "Good"
}

// ── Write ────────────────────────────────────────────────────────────────────

// Write PUTs {"value": value} (generic) or POSTs PLCnext format.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	if d.isPXC {
		return d.pxcWrite(ctx, path, value)
	}
	return d.genericWrite(ctx, path, value)
}

func (d *Driver) pxcWrite(ctx context.Context, path string, value any) error {
	body, err := json.Marshal(map[string]any{
		"variables": []map[string]any{{"path": path, "value": value}},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, d.pxcVarURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	if d.token != "" {
		req.Header.Set("Authorization", "Bearer "+d.token)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[DRIVER] rest: pxc write 400 body=%s url=%s payload=%s", respBody, d.pxcVarURL, body)
		return fmt.Errorf("rest: pxc write status %d: %s", resp.StatusCode, respBody)
	}
	return nil
}

func (d *Driver) genericWrite(ctx context.Context, path string, value any) error {
	urlPath, _ := splitPath(path)
	reqURL := d.baseURL + d.basePath + "/" + strings.TrimLeft(urlPath, "/")
	body, err := json.Marshal(map[string]any{"value": value})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, reqURL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	if d.token != "" {
		req.Header.Set("Authorization", "Bearer "+d.token)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("rest: PUT %s status %d", reqURL, resp.StatusCode)
	}
	return nil
}

// ── Status ───────────────────────────────────────────────────────────────────

func (d *Driver) Status() drivers.DriverStatus {
	last := ""
	if p := d.lastErr.Load(); p != nil {
		last = *p
	}
	return drivers.DriverStatus{
		Connected: d.connected.Load(),
		LastError: last,
		TagCount:  int(d.tagCount.Load()),
	}
}

func (d *Driver) fail(err error) error {
	d.connected.Store(false)
	s := err.Error()
	d.lastErr.Store(&s)
	return err
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (d *Driver) getJSON(ctx context.Context, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if d.token != "" {
		req.Header.Set("Authorization", "Bearer "+d.token)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := d.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func tagDefFromPath(path string) drivers.TagDefinition {
	label := path
	if i := strings.LastIndexAny(path, "/."); i >= 0 {
		label = path[i+1:]
	}
	return drivers.TagDefinition{Path: path, Description: label, Writable: true}
}

func jsonString(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var s string
	_ = json.Unmarshal(raw, &s)
	return s
}

func splitPath(p string) (urlPath, gjsonPath string) {
	if i := strings.Index(p, "#"); i >= 0 {
		return p[:i], p[i+1:]
	}
	return p, ""
}

func strPtr(s string) *string { return &s }

func init() {
	drivers.Register("rest", func(_ drivers.BuildCtx) drivers.ProtocolDriver { return New() })
}
