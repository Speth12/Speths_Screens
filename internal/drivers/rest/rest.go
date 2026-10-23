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
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
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
//
// It moves through four states. Connect checks the config and starts the
// driver's one goroutine (starting). Once the controller answers, the driver
// polls (online). The first failed request for a group takes it offline:
// every polled tag goes Bad keeping its last value, writes fail at once, and
// the goroutine retries with backoff until the controller answers again.
// Disconnect stops it (stopped).
type Driver struct {
	mu        sync.Mutex
	hc        *http.Client
	baseURL   string // e.g. https://192.168.88.10
	basePath  string // e.g. /_pxc_api/v1.14  (trimmed of trailing slash)
	isPXC     bool   // true when basePath contains "_pxc_api"
	pxcRoot   string // e.g. https://192.168.88.10/_pxc_api (PLCnext mode)
	pxcVarURL string // variables endpoint (PLCnext mode); guarded by mu, "" until known
	token     string
	cancel    context.CancelFunc // stops the goroutine; nil when stopped
	out       chan<- tagstore.TagUpdate
	wg        sync.WaitGroup

	// Timing; tests shorten these.
	pollEvery   time.Duration
	httpTimeout time.Duration
	maxURL      int // longest read URL in bytes; longer path lists are split
	backoffMin  time.Duration
	backoffMax  time.Duration

	tags atomic.Pointer[tagSet] // current poll set, swapped by SetTags

	// last is the state most recently sent per path. Only the goroutine
	// started by Connect touches it.
	last map[string]tagstore.TagState

	state    atomic.Int32 // stateStopped, stateStarting, stateOnline, stateOffline
	lastErr  atomic.Pointer[string]
	tagCount atomic.Int32
}

const (
	stateStopped int32 = iota
	stateStarting
	stateOnline
	stateOffline
)

func New() *Driver {
	return &Driver{
		pollEvery:   pollDefault,
		httpTimeout: 8 * time.Second,
		maxURL:      2000,
		backoffMin:  1 * time.Second,
		backoffMax:  30 * time.Second,
	}
}

func (d *Driver) ID() string { return driverID }

// Connect checks the config and starts the driver. It does not wait for the
// controller: an unreachable controller shows up in Status() and the driver
// keeps retrying in the background.
//
// cfg.Endpoint:             base URL  (e.g. https://192.168.88.10)
// cfg.Extra["basePath"]:   path prefix — for PLCnext use /_pxc_api/v1.14
//
//	(without a version the driver asks the controller for it on first contact)
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
	d.hc = &http.Client{Timeout: d.httpTimeout, Transport: tr}

	// Auto-detect PLCnext pxc_api mode. With a version in basePath the
	// variables URL is known now; otherwise contact learns it.
	d.isPXC = strings.Contains(d.basePath, "_pxc_api")
	d.setVarURL("")
	if d.isPXC {
		root := d.basePath
		if i := strings.Index(root, "/v"); i >= 0 {
			root = root[:i]
			d.setVarURL(d.baseURL + d.basePath + "/variables")
		}
		d.pxcRoot = d.baseURL + root
	}

	loopCtx, cancel := context.WithCancel(context.Background())
	d.mu.Lock()
	d.cancel = cancel
	d.mu.Unlock()
	d.lastErr.Store(strPtr(""))
	d.state.Store(stateStarting)
	log.Printf("[DRIVER] rest: starting %s%s (pxc=%v)", d.baseURL, d.basePath, d.isPXC)

	d.wg.Add(1)
	go d.run(loopCtx)
	return nil
}

func (d *Driver) varURL() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.pxcVarURL
}

func (d *Driver) setVarURL(u string) {
	d.mu.Lock()
	d.pxcVarURL = u
	d.mu.Unlock()
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
	}
	d.mu.Unlock()
	d.wg.Wait()
	d.state.Store(stateStopped)
	return nil
}

// ── Browse ──────────────────────────────────────────────────────────────────

// Browse discovers available tags.
//
// PLCnext: reads /_pxc_api/v*/ports to get all HMI-exported port names.
// Generic: GETs basePath and walks the JSON tree.
func (d *Driver) Browse(ctx context.Context) ([]drivers.TagDefinition, error) {
	if d.state.Load() == stateStopped {
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
	portsURL := strings.TrimSuffix(d.varURL(), "/variables") + "/ports"
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

// run is the driver's only goroutine. It reaches the controller, polls while
// online, and after a failure marks every tag Bad and retries with backoff.
func (d *Driver) run(ctx context.Context) {
	defer d.wg.Done()
	d.last = map[string]tagstore.TagState{}
	wait := d.backoffMin
	for {
		err := d.contact(ctx)
		if err == nil {
			d.setOnline()
			wait = d.backoffMin
			err = d.pollUntilFailure(ctx)
		}
		if ctx.Err() != nil {
			return
		}
		d.setOffline(ctx, err)
		if !sleepCtx(ctx, jitter(wait)) {
			return
		}
		wait = min(2*wait, d.backoffMax)
	}
}

// contact checks that the controller answers. Any HTTP reply below 500
// counts; a network error, a timeout or a 5xx does not. In PLCnext mode it
// also learns the API version when basePath did not name one.
func (d *Driver) contact(ctx context.Context) error {
	if !d.isPXC {
		_, err := d.getJSON(ctx, d.baseURL+d.basePath)
		return unreachable(err)
	}
	body, err := d.getJSON(ctx, d.pxcRoot+"/api/")
	if err := unreachable(err); err != nil {
		return err
	}
	if d.varURL() == "" {
		ver := "v1.14" // best-effort default
		var resp struct {
			BasePath string `json:"basePath"` // e.g. "/v1.14/"
		}
		if err == nil && json.Unmarshal(body, &resp) == nil && resp.BasePath != "" {
			ver = strings.Trim(resp.BasePath, "/")
		}
		d.setVarURL(d.pxcRoot + "/" + ver + "/variables")
		log.Printf("[DRIVER] rest: PLCnext mode, API base %s/%s", d.pxcRoot, ver)
	}
	return nil
}

// unreachable returns err unless it is an HTTP reply below 500, which shows
// the controller is there.
func unreachable(err error) error {
	var se *statusError
	if errors.As(err, &se) && se.code < 500 {
		return nil
	}
	return err
}

// pollUntilFailure polls on every tick and returns the first failure, or the
// context error when the driver is stopped. It reads the current tag set on
// every tick, so SetTags takes effect on the next tick.
func (d *Driver) pollUntilFailure(ctx context.Context) error {
	tick := time.NewTicker(d.pollEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
			if err := d.pollOnce(ctx); err != nil {
				return err
			}
		}
	}
}

func (d *Driver) pollOnce(ctx context.Context) error {
	ts := d.tags.Load()
	out := d.output()
	if ts == nil || len(ts.paths) == 0 || out == nil {
		return nil
	}
	if !d.isPXC {
		return d.genericPoll(ctx, ts.paths, out)
	}
	for _, g := range ts.groups {
		if err := d.pxcReadGroup(ctx, g, out); err != nil {
			return err
		}
	}
	return nil
}

func (d *Driver) setOnline() {
	if d.state.Swap(stateOnline) != stateOnline {
		log.Printf("[DRIVER] rest: online %s%s", d.baseURL, d.basePath)
	}
	d.lastErr.Store(strPtr(""))
}

// setOffline records why the driver is offline and marks every polled tag
// Bad, keeping its last value. Tags already Bad for the same reason are not
// sent again, so retries do not repeat the burst.
func (d *Driver) setOffline(ctx context.Context, err error) {
	reason := err.Error()
	if d.state.Swap(stateOffline) != stateOffline || d.lastError() != reason {
		log.Printf("[DRIVER] rest: offline: %s", reason)
	}
	d.lastErr.Store(&reason)
	ts := d.tags.Load()
	out := d.output()
	if ts == nil || out == nil {
		return
	}
	now := time.Now().UnixNano()
	for _, p := range ts.paths {
		prev := d.last[p]
		if prev.Quality == "Bad" && prev.Reason == reason {
			continue
		}
		bad := tagstore.TagState{Value: prev.Value, Quality: "Bad", Reason: reason, TS: now}
		if !d.emit(ctx, out, p, bad) {
			return
		}
	}
}

// emit sends one update and remembers it. It returns false when the driver
// is stopped while waiting on a full output.
func (d *Driver) emit(ctx context.Context, out chan<- tagstore.TagUpdate, path string, st tagstore.TagState) bool {
	select {
	case out <- tagstore.TagUpdate{Path: path, State: st}:
		d.last[path] = st
		return true
	case <-ctx.Done():
		return false
	}
}

// sleepCtx waits for d or until ctx is done; it reports whether d passed.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// jitter spreads d by ±20% so many runtimes do not retry in step.
func jitter(d time.Duration) time.Duration {
	return time.Duration(float64(d) * (0.8 + 0.4*rand.Float64()))
}

// pxcEntry is one variable in a PLCnext read reply.
type pxcEntry struct {
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
	Error *pxcError       `json:"error"`
}

// pxcReadGroup reads one component group, in as few GET requests as keep
// each URL under maxURL. A failed request is returned; a variable the
// controller reports an error for (for example NotExists) only makes that
// tag Bad.
func (d *Driver) pxcReadGroup(ctx context.Context, g pxcGroup, out chan<- tagstore.TagUpdate) error {
	base := d.varURL()
	byPath := make(map[string]pxcEntry, len(g.vars))
	for _, vars := range chunkVars(base, g.prefix, g.vars, d.maxURL) {
		q := url.Values{}
		q.Set("pathPrefix", g.prefix)
		q.Set("paths", strings.Join(vars, ","))
		body, err := d.getJSON(ctx, base+"?"+q.Encode())
		if err != nil {
			return fmt.Errorf("rest: read %s: %w", g.prefix, err)
		}
		// Response: { "variables": [{ "path": "...", "value": ..., "error": {...} }] }
		var resp struct {
			Variables []pxcEntry `json:"variables"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return fmt.Errorf("rest: read %s: unreadable response: %w", g.prefix, err)
		}
		for _, v := range resp.Variables {
			byPath[v.Path] = v
		}
	}

	now := time.Now().UnixNano()
	for i, p := range g.paths {
		e, ok := byPath[p]
		if !ok {
			// try by varName in case prefix was already embedded
			e, ok = byPath[g.prefix+g.vars[i]]
		}
		st := tagstore.TagState{Quality: "Bad", TS: now}
		switch {
		case !ok:
			st.Reason = "missing from the controller's reply"
		case e.Error != nil:
			st.Reason = e.Error.String()
		case len(e.Value) == 0 || string(e.Value) == "null":
			st.Reason = "no value"
		default:
			var val any
			if err := json.Unmarshal(e.Value, &val); err != nil {
				st.Reason = "unreadable value"
			} else {
				st.Value, st.Quality = val, "Good"
			}
		}
		if !d.emit(ctx, out, p, st) {
			return ctx.Err()
		}
	}
	return nil
}

// chunkVars splits vars so that each read URL (base, pathPrefix and paths)
// stays within limit bytes. A single variable longer than that still gets a
// request of its own.
func chunkVars(base, prefix string, vars []string, limit int) [][]string {
	fixed := len(base) + len("?pathPrefix=") + len(url.QueryEscape(prefix)) + len("&paths=")
	var chunks [][]string
	var cur []string
	size := fixed
	for _, v := range vars {
		n := len(url.QueryEscape(v))
		if len(cur) > 0 {
			n += len("%2C") // the escaped comma before it
		}
		if len(cur) > 0 && size+n > limit {
			chunks = append(chunks, cur)
			cur, size = nil, fixed
			n = len(url.QueryEscape(v))
		}
		cur = append(cur, v)
		size += n
	}
	if len(cur) > 0 {
		chunks = append(chunks, cur)
	}
	return chunks
}

// pxcSplitPath splits "Arp.Plc.Eclr/MainInstance.rHMI" into
// prefix="Arp.Plc.Eclr/" and varName="MainInstance.rHMI".
func pxcSplitPath(path string) (prefix, varName string) {
	if i := strings.Index(path, "/"); i >= 0 {
		return path[:i+1], path[i+1:]
	}
	return "", path
}

// genericPoll is the non-PLCnext poll: one GET per path. A path the server
// rejects (for example 404) only makes that tag Bad.
func (d *Driver) genericPoll(ctx context.Context, paths []string, out chan<- tagstore.TagUpdate) error {
	for _, p := range paths {
		st, err := d.readOne(ctx, p)
		if err != nil {
			return err
		}
		if !d.emit(ctx, out, p, st) {
			return ctx.Err()
		}
	}
	return nil
}

func (d *Driver) readOne(ctx context.Context, path string) (tagstore.TagState, error) {
	st := tagstore.TagState{Quality: "Bad", TS: time.Now().UnixNano()}
	urlPath, gjsonPath := splitPath(path)
	reqURL := d.baseURL + d.basePath + "/" + strings.TrimLeft(urlPath, "/")
	body, err := d.getJSON(ctx, reqURL)
	if err != nil {
		if unreachable(err) != nil {
			return st, fmt.Errorf("rest: read %s: %w", urlPath, err)
		}
		st.Reason = err.Error()
		return st, nil
	}
	st.Quality = "Good"
	if gjsonPath != "" {
		r := gjson.GetBytes(body, gjsonPath)
		if !r.Exists() {
			st.Quality, st.Reason = "Bad", "no "+gjsonPath+" in the reply"
			return st, nil
		}
		st.Value = r.Value()
		return st, nil
	}
	if v := gjson.GetBytes(body, "value"); v.Exists() {
		st.Value = v.Value()
		return st, nil
	}
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		st.Value = string(body)
		return st, nil
	}
	st.Value = v
	return st, nil
}

// ── Write ────────────────────────────────────────────────────────────────────

// Write PUTs {"value": value} (generic) or POSTs PLCnext format.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	if d.state.Load() == stateOffline {
		return fmt.Errorf("rest: not connected: %s", d.lastError())
	}
	if d.isPXC {
		return d.pxcWrite(ctx, path, value)
	}
	return d.genericWrite(ctx, path, value)
}

func (d *Driver) pxcWrite(ctx context.Context, path string, value any) error {
	varURL := d.varURL()
	if varURL == "" {
		return fmt.Errorf("rest: not connected yet")
	}
	body, err := json.Marshal(map[string]any{
		"variables": []map[string]any{{"path": path, "value": value}},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, varURL, strings.NewReader(string(body)))
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
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		log.Printf("[DRIVER] rest: pxc write status %d body=%s url=%s payload=%s", resp.StatusCode, respBody, varURL, body)
		return fmt.Errorf("rest: pxc write status %d: %s", resp.StatusCode, respBody)
	}
	return pxcWriteError(path, respBody)
}

// pxcError is the error PLCnext puts on a variable or on a whole reply.
type pxcError struct {
	Code    int    `json:"code"`
	Domain  string `json:"domain"`
	Reason  string `json:"reason"`
	Details []struct {
		Domain string `json:"domain"`
		Reason string `json:"reason"`
	} `json:"details"`
}

// String gives "domain: reason", e.g. "variables: NotExists".
func (e *pxcError) String() string {
	if e.Reason == "" && len(e.Details) > 0 {
		return e.Details[0].Domain + ": " + e.Details[0].Reason
	}
	if e.Domain != "" {
		return e.Domain + ": " + e.Reason
	}
	return e.Reason
}

// pxcWriteError reports the error the controller put in a 2xx write response.
// PLCnext answers a rejected write (unknown variable, wrong type, value out
// of range) with HTTP 200 and an "error" on the variable or on the response.
func pxcWriteError(path string, body []byte) error {
	var resp struct {
		Error     *pxcError `json:"error"`
		Variables []struct {
			Path  string    `json:"path"`
			Error *pxcError `json:"error"`
		} `json:"variables"`
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("rest: pxc write %s: unreadable response: %w", path, err)
	}
	if resp.Error != nil {
		return fmt.Errorf("rest: pxc write %s rejected: %s", path, resp.Error)
	}
	for _, v := range resp.Variables {
		if v.Error != nil {
			return fmt.Errorf("rest: pxc write %s rejected: %s", v.Path, v.Error)
		}
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
	return drivers.DriverStatus{
		Connected: d.state.Load() == stateOnline,
		LastError: d.lastError(),
		TagCount:  int(d.tagCount.Load()),
	}
}

func (d *Driver) lastError() string {
	if p := d.lastErr.Load(); p != nil {
		return *p
	}
	return ""
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
		return nil, &statusError{code: resp.StatusCode}
	}
	return io.ReadAll(resp.Body)
}

// statusError is a reply with a status other than 2xx.
type statusError struct{ code int }

func (e *statusError) Error() string { return fmt.Sprintf("HTTP %d", e.code) }

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
