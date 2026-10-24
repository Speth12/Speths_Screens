// Package opcua implements ProtocolDriver for OPC UA via gopcua v0.5.x.
package opcua

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/drivers/cert"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

const (
	driverID      = "opcua"
	defaultCert   = "opcua-cert.pem"
	defaultKey    = "opcua-key.pem"
	appURI        = "urn:x-hmi:runtime"
	browseDepth   = 10
	browseMaxRefs = 1000
	subInterval   = 500 * time.Millisecond
)

// Driver implements drivers.ProtocolDriver.
//
// It has the same states as the REST driver. Connect checks the config and
// starts the driver's one goroutine (starting), which discovers the
// endpoints and connects. While connected it polls (online). A failed read
// takes it offline: every polled tag goes Bad keeping its last value, writes
// fail at once, the client is closed and the goroutine reconnects with
// backoff. gopcua's own AutoReconnect is off, so there is one reconnect
// path. Disconnect stops it (stopped).
type Driver struct {
	mu       sync.Mutex
	client   *opcua.Client // nil while not connected
	endpoint string
	host     string // e.g. 10.0.0.210, for reasons shown to operators
	cfg      drivers.DriverConfig
	cancel   context.CancelFunc // stops the goroutine; nil when stopped
	out      chan<- tagstore.TagUpdate
	wg       sync.WaitGroup

	// Timing; tests shorten these.
	pollEvery  time.Duration
	timeout    time.Duration // per request and per dial
	backoffMin time.Duration
	backoffMax time.Duration

	state    atomic.Int32 // stateStopped, stateStarting, stateOnline, stateOffline
	lastErr  atomic.Pointer[string]
	tagCount atomic.Int32

	tags atomic.Pointer[tagSet] // current poll set, swapped by SetTags

	// last is the state most recently sent per path. Only the goroutine
	// started by Connect touches it.
	last map[string]tagstore.TagState

	// dial, read and write replace the real connect, Read and Write in
	// tests; nil means use the client.
	dial  func(ctx context.Context) error
	read  func(ctx context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error)
	write func(ctx context.Context, req *ua.WriteRequest) (*ua.WriteResponse, error)

	// types caches each written node's DataType until Disconnect.
	typesMu sync.Mutex
	types   map[string]*ua.NodeID
}

const (
	stateStopped int32 = iota
	stateStarting
	stateOnline
	stateOffline
)

// New returns an unconnected driver.
func New() *Driver {
	return &Driver{
		pollEvery:  subInterval,
		timeout:    3 * time.Second,
		backoffMin: 1 * time.Second,
		backoffMax: 30 * time.Second,
	}
}

func (d *Driver) ID() string { return driverID }

// Connect checks the config and starts the driver. It does not wait for the
// server: an unreachable server shows up in Status() and the driver keeps
// retrying in the background.
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("opcua: endpoint is required")
	}
	d.mu.Lock()
	d.out = out
	d.mu.Unlock()
	d.endpoint = cfg.Endpoint
	d.cfg = cfg
	d.host = cfg.Endpoint
	if u, err := url.Parse(cfg.Endpoint); err == nil && u.Hostname() != "" {
		d.host = u.Hostname()
	}
	d.startLoop()
	return nil
}

// startLoop starts the driver's only goroutine.
func (d *Driver) startLoop() {
	loopCtx, cancel := context.WithCancel(context.Background())
	d.mu.Lock()
	d.cancel = cancel
	d.mu.Unlock()
	d.lastErr.Store(strPtr(""))
	d.state.Store(stateStarting)
	d.wg.Add(1)
	go d.run(loopCtx)
}

// connect discovers the server's endpoints and opens a client.
func (d *Driver) connect(ctx context.Context) error {
	if d.dial != nil {
		return d.dial(ctx)
	}
	cfg := d.cfg
	desiredMode := cfg.Extra["securityMode"]
	if desiredMode == "" {
		desiredMode = "SignAndEncrypt"
	}
	desiredPolicy := cfg.Extra["securityPolicy"]
	if desiredPolicy == "" {
		desiredPolicy = "Basic256Sha256"
	}

	log.Printf("[DRIVER] opcua: discovering endpoints at %s", cfg.Endpoint)
	dctx, cancel := context.WithTimeout(ctx, d.timeout)
	eps, err := opcua.GetEndpoints(dctx, cfg.Endpoint, opcua.DialTimeout(d.timeout), opcua.RequestTimeout(d.timeout))
	cancel()
	if err != nil {
		return fmt.Errorf("opcua: GetEndpoints: %w", err)
	}

	ep := opcua.SelectEndpoint(eps, desiredPolicy, mapMode(desiredMode))
	if ep == nil {
		ep = opcua.SelectEndpoint(eps, "None", ua.MessageSecurityModeNone)
		if ep == nil {
			return fmt.Errorf("opcua: no usable endpoint in %d offered", len(eps))
		}
		log.Printf("[DRIVER] opcua: %s/%s not offered, falling back to None", desiredMode, desiredPolicy)
	}

	opts := []opcua.Option{
		opcua.SecurityFromEndpoint(ep, mapTokenType(cfg.Username)),
		opcua.AutoReconnect(false),
		opcua.DialTimeout(d.timeout),
		opcua.RequestTimeout(d.timeout),
	}
	if cfg.Username != "" {
		opts = append(opts, opcua.AuthUsername(cfg.Username, cfg.Password))
	} else {
		opts = append(opts, opcua.AuthAnonymous())
	}
	if ep.SecurityMode != ua.MessageSecurityModeNone {
		if err := cert.Ensure(defaultCert, defaultKey, appURI, "x-hmi runtime"); err != nil {
			return fmt.Errorf("opcua: ensure cert: %w", err)
		}
		opts = append(opts,
			opcua.CertificateFile(defaultCert),
			opcua.PrivateKeyFile(defaultKey),
		)
	}

	// Servers often advertise their own hostname in EndpointURL (e.g. "axc-f-3152-1")
	// which may not be DNS-resolvable. Keep the path/scheme from the server's URL
	// but substitute the host we actually dialled.
	connectURL := overrideHost(ep.EndpointURL, cfg.Endpoint)
	c, err := opcua.NewClient(connectURL, opts...)
	if err != nil {
		return fmt.Errorf("opcua: NewClient: %w", err)
	}

	log.Printf("[DRIVER] opcua: connecting to %s mode=%v", connectURL, ep.SecurityMode)
	if err = c.Connect(ctx); err != nil {
		_ = c.Close(context.Background())
		return fmt.Errorf("opcua: Connect: %w", err)
	}
	d.mu.Lock()
	d.client = c
	d.mu.Unlock()
	return nil
}

// closeClient closes and forgets the client, if any.
func (d *Driver) closeClient() {
	d.mu.Lock()
	c := d.client
	d.client = nil
	d.mu.Unlock()
	if c != nil {
		_ = c.Close(context.Background())
	}
}

// Disconnect stops the goroutine and closes the connection.
func (d *Driver) Disconnect() error {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
	}
	d.mu.Unlock()
	d.wg.Wait()
	d.closeClient()
	d.state.Store(stateStopped)
	d.typesMu.Lock()
	d.types = nil
	d.typesMu.Unlock()
	return nil
}

// Browse walks the address space starting at the Objects folder, then also
// tries the PLCnext GDS root (ns=6;s=Arp.Plc.Eclr) so application variables
// show up even when they sit deeper than the normal browse reaches.
func (d *Driver) Browse(ctx context.Context) ([]drivers.TagDefinition, error) {
	c := d.getClient()
	if c == nil {
		return nil, fmt.Errorf("opcua: not connected")
	}
	var out []drivers.TagDefinition
	d.browseRecursive(ctx, c, ua.NewNumericNodeID(0, id.ObjectsFolder), 0, &out)

	// PLCnext-specific: try to browse ns=6;s=Arp.Plc.Eclr directly.
	if plcRoot, err := ua.ParseNodeID("ns=6;s=Arp.Plc.Eclr"); err == nil {
		d.browseRecursive(ctx, c, plcRoot, 0, &out)
	}

	// Keep only string-identifier nodes (ns=x;s=...) — those are user-defined
	// application variables. Numeric node IDs (TwoByte/FourByte/Numeric) across
	// all namespaces are OPC UA infrastructure. Also drop ns=0 (OPC UA standard).
	filtered := out[:0]
	for _, t := range out {
		nid, err := ua.ParseNodeID(t.Path)
		if err != nil || nid.Namespace() == 0 {
			continue
		}
		// Only keep string node IDs (type 3). TwoByte(0), FourByte(1), and
		// Numeric(2) are all numeric identifiers regardless of namespace.
		if nid.Type() != ua.NodeIDTypeString {
			continue
		}
		filtered = append(filtered, t)
	}
	out = filtered

	// Deduplicate by path.
	seen := make(map[string]bool, len(out))
	deduped := out[:0]
	for _, t := range out {
		if !seen[t.Path] {
			seen[t.Path] = true
			deduped = append(deduped, t)
		}
	}
	out = deduped

	// Sort: higher namespaces first (ns=6 PLCnext app vars before ns=5 device info,
	// etc.), then alphabetically within each namespace.
	sort.Slice(out, func(i, j int) bool {
		ni, _ := ua.ParseNodeID(out[i].Path)
		nj, _ := ua.ParseNodeID(out[j].Path)
		if ni.Namespace() != nj.Namespace() {
			return ni.Namespace() > nj.Namespace()
		}
		return out[i].Description < out[j].Description
	})

	d.tagCount.Store(int32(len(out)))
	return out, nil
}

func (d *Driver) browseRecursive(ctx context.Context, c *opcua.Client, nodeID *ua.NodeID, depth int, out *[]drivers.TagDefinition) {
	if depth > browseDepth {
		return
	}
	req := &ua.BrowseRequest{
		RequestedMaxReferencesPerNode: browseMaxRefs,
		NodesToBrowse: []*ua.BrowseDescription{{
			NodeID:          nodeID,
			BrowseDirection: ua.BrowseDirectionForward,
			ReferenceTypeID: ua.NewNumericNodeID(0, id.HierarchicalReferences),
			IncludeSubtypes: true,
			NodeClassMask:   uint32(ua.NodeClassAll),
			ResultMask:      uint32(ua.BrowseResultMaskAll),
		}},
	}
	res, err := c.Browse(ctx, req)
	if err != nil || len(res.Results) == 0 {
		return
	}
	for _, ref := range res.Results[0].References {
		nid := ref.NodeID.NodeID
		if ref.NodeClass == ua.NodeClassVariable {
			*out = append(*out, drivers.TagDefinition{
				Path:        nid.String(),
				DataType:    "", // could read DataType attribute, skipped for browse perf
				Description: ref.DisplayName.Text,
				Writable:    true,
			})
		} else {
			d.browseRecursive(ctx, c, nid, depth+1, out)
		}
	}
}

// tagSet is an immutable poll set. in is the normalized SetTags input (used
// to detect "unchanged"); paths and req.NodesToRead hold the valid node IDs,
// in step.
type tagSet struct {
	in    []string
	paths []string
	req   *ua.ReadRequest
}

// SetTags replaces the set of polled node IDs. It is idempotent: calling it
// with the same paths (in any order, with duplicates) changes nothing. Node
// IDs that do not parse are logged and skipped. An empty set keeps the driver
// idle.
//
// The driver polls with Read instead of using OPC UA subscriptions because
// PLCnext closes the TCP connection after responding to CreateMonitoredItems,
// which makes gopcua return EOF before the response is read.
func (d *Driver) SetTags(paths []string) error {
	norm := drivers.NormalizePaths(paths)
	if cur := d.tags.Load(); cur != nil && slices.Equal(cur.in, norm) {
		return nil
	}
	ts := &tagSet{in: norm, req: &ua.ReadRequest{TimestampsToReturn: ua.TimestampsToReturnBoth}}
	for _, p := range norm {
		nid, err := ua.ParseNodeID(p)
		if err != nil {
			log.Printf("[DRIVER] opcua: bad node id %q: %v — skipping", p, err)
			continue
		}
		ts.paths = append(ts.paths, p)
		ts.req.NodesToRead = append(ts.req.NodesToRead, &ua.ReadValueID{
			NodeID:      nid,
			AttributeID: ua.AttributeIDValue,
		})
	}
	d.tags.Store(ts)
	d.tagCount.Store(int32(len(ts.paths)))
	log.Printf("[DRIVER] opcua: polling %d nodes", len(ts.paths))
	if len(norm) > 0 && len(ts.paths) == 0 {
		return fmt.Errorf("opcua: no valid node ids")
	}
	return nil
}

func (d *Driver) output() chan<- tagstore.TagUpdate {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.out
}

// readNow sends one Read for the whole tag set.
func (d *Driver) readNow(ctx context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error) {
	if d.read != nil {
		return d.read(ctx, req)
	}
	c := d.getClient()
	if c == nil {
		return nil, fmt.Errorf("opcua: not connected")
	}
	return c.Read(ctx, req)
}

// run is the driver's only goroutine. It connects, polls while online, and
// after a failure marks every tag Bad, closes the client and reconnects with
// backoff.
func (d *Driver) run(ctx context.Context) {
	defer d.wg.Done()
	d.last = map[string]tagstore.TagState{}
	retry := drivers.Backoff{Min: d.backoffMin, Max: d.backoffMax}
	for {
		err := d.connect(ctx)
		if err == nil {
			d.setOnline()
			retry.Reset()
			err = d.pollUntilFailure(ctx)
			d.closeClient()
		}
		if ctx.Err() != nil {
			return
		}
		d.setOffline(ctx, err)
		if !drivers.SleepCtx(ctx, retry.Next()) {
			return
		}
	}
}

// pollUntilFailure reads the current tag set on every tick, so SetTags takes
// effect on the next tick. It returns the first failed read, or the context
// error when the driver is stopped.
func (d *Driver) pollUntilFailure(ctx context.Context) error {
	ticker := time.NewTicker(d.pollEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
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
	res, err := d.readNow(ctx, ts.req)
	if err != nil {
		return err
	}
	now := time.Now()
	for i, p := range ts.paths {
		var dv *ua.DataValue
		if i < len(res.Results) {
			dv = res.Results[i]
		}
		if !d.emit(ctx, out, p, nodeState(dv, now)) {
			return ctx.Err()
		}
	}
	return nil
}

// nodeState turns one read result into a tag state. A Bad or Uncertain
// status gives its name as the reason, e.g. "BadNodeIdUnknown". The
// timestamp is the source's, else the server's, else now.
func nodeState(dv *ua.DataValue, now time.Time) tagstore.TagState {
	if dv == nil {
		return tagstore.TagState{Quality: "Bad", Reason: "missing from the server's reply", TS: now.UnixNano()}
	}
	st := tagstore.TagState{Quality: qualityFromStatus(dv.Status)}
	if dv.Value != nil {
		st.Value = dv.Value.Value()
	}
	if st.Quality != "Good" {
		st.Reason = statusName(dv.Status)
	}
	switch {
	case !dv.SourceTimestamp.IsZero() && dv.SourceTimestamp.Year() > 1970:
		st.TS = dv.SourceTimestamp.UnixNano()
	case !dv.ServerTimestamp.IsZero() && dv.ServerTimestamp.Year() > 1970:
		st.TS = dv.ServerTimestamp.UnixNano()
	default:
		st.TS = now.UnixNano()
	}
	return st
}

// statusName gives a status code's name as the OPC UA specification and
// tools such as UaExpert spell it, e.g. "BadNodeIdUnknown" (gopcua spells
// it "StatusBadNodeIDUnknown").
func statusName(s ua.StatusCode) string {
	if d, ok := ua.StatusCodes[s]; ok && d.Name != "" {
		return strings.ReplaceAll(strings.TrimPrefix(d.Name, "Status"), "ID", "Id")
	}
	return fmt.Sprintf("status 0x%08X", uint32(s))
}

func (d *Driver) setOnline() {
	if d.state.Swap(stateOnline) != stateOnline {
		log.Printf("[DRIVER] opcua: online %s", d.endpoint)
	}
	d.lastErr.Store(strPtr(""))
}

// setOffline records why the driver is offline and marks every polled tag
// Bad, keeping its last value. Tags already Bad for the same reason are not
// sent again, so retries do not repeat the burst.
func (d *Driver) setOffline(ctx context.Context, err error) {
	reason := d.reasonFor(err)
	if d.state.Swap(stateOffline) != stateOffline || d.lastError() != reason {
		log.Printf("[DRIVER] opcua: offline: %s (%v)", reason, err)
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

// reasonFor turns a failure into a short reason for operators.
func (d *Driver) reasonFor(err error) string {
	if r, ok := drivers.NetReason(d.host, err); ok {
		return r
	}
	var sc ua.StatusCode
	if errors.As(err, &sc) {
		if sc == ua.StatusBadTimeout {
			return fmt.Sprintf("no answer from %s (timed out)", d.host)
		}
		return fmt.Sprintf("%s answered %s", d.host, statusName(sc))
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Sprintf("%s closed the connection", d.host)
	}
	return strings.TrimPrefix(err.Error(), "opcua: ")
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

// Write writes value to the given OPC UA node, converted to the node's
// data type (a JSON number written to a PLCnext REAL becomes a Float).
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	if d.state.Load() == stateOffline {
		return fmt.Errorf("opcua: not connected: %s", d.lastError())
	}
	nid, err := ua.ParseNodeID(path)
	if err != nil {
		return fmt.Errorf("opcua: bad node id %q: %w", path, err)
	}
	dataType, err := d.dataType(ctx, path, nid)
	if err != nil {
		return err
	}
	converted, err := convertForType(value, dataType)
	if err != nil {
		return fmt.Errorf("opcua: %s: %w", path, err)
	}
	v, err := ua.NewVariant(converted)
	if err != nil {
		return fmt.Errorf("opcua: variant: %w", err)
	}
	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{{
			NodeID:      nid,
			AttributeID: ua.AttributeIDValue,
			Value:       &ua.DataValue{EncodingMask: ua.DataValueValue, Value: v},
		}},
	}
	res, err := d.writeNow(ctx, req)
	if err != nil {
		return err
	}
	if len(res.Results) > 0 && res.Results[0] != ua.StatusOK {
		return fmt.Errorf("opcua: write status %v", res.Results[0])
	}
	return nil
}

// dataType returns the node's DataType attribute, read once and cached.
func (d *Driver) dataType(ctx context.Context, path string, nid *ua.NodeID) (*ua.NodeID, error) {
	d.typesMu.Lock()
	dt, ok := d.types[path]
	d.typesMu.Unlock()
	if ok {
		return dt, nil
	}
	res, err := d.readNow(ctx, &ua.ReadRequest{NodesToRead: []*ua.ReadValueID{
		{NodeID: nid, AttributeID: ua.AttributeIDDataType},
	}})
	if err != nil {
		return nil, fmt.Errorf("opcua: read data type of %s: %w", path, err)
	}
	if len(res.Results) == 0 || res.Results[0].Status != ua.StatusOK || res.Results[0].Value == nil {
		status := ua.StatusBad
		if len(res.Results) > 0 {
			status = res.Results[0].Status
		}
		return nil, fmt.Errorf("opcua: read data type of %s: %v", path, status)
	}
	dt, ok = res.Results[0].Value.Value().(*ua.NodeID)
	if !ok {
		return nil, fmt.Errorf("opcua: data type of %s is %T, not a node id", path, res.Results[0].Value.Value())
	}
	d.typesMu.Lock()
	if d.types == nil {
		d.types = map[string]*ua.NodeID{}
	}
	d.types[path] = dt
	d.typesMu.Unlock()
	return dt, nil
}

// writeNow sends one Write request.
func (d *Driver) writeNow(ctx context.Context, req *ua.WriteRequest) (*ua.WriteResponse, error) {
	if d.write != nil {
		return d.write(ctx, req)
	}
	c := d.getClient()
	if c == nil {
		return nil, fmt.Errorf("opcua: not connected")
	}
	return c.Write(ctx, req)
}

// Status returns the current state.
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

func (d *Driver) getClient() *opcua.Client {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.client
}

func mapMode(s string) ua.MessageSecurityMode {
	switch s {
	case "Sign":
		return ua.MessageSecurityModeSign
	case "SignAndEncrypt":
		return ua.MessageSecurityModeSignAndEncrypt
	default:
		return ua.MessageSecurityModeNone
	}
}

func mapTokenType(username string) ua.UserTokenType {
	if username != "" {
		return ua.UserTokenTypeUserName
	}
	return ua.UserTokenTypeAnonymous
}

func qualityFromStatus(s ua.StatusCode) string {
	switch {
	case s == ua.StatusOK:
		return "Good"
	case uint32(s)&0x80000000 != 0:
		return "Bad"
	default:
		return "Uncertain"
	}
}

func statusOf(res *ua.CreateMonitoredItemsResponse) ua.StatusCode {
	if res == nil || len(res.Results) == 0 {
		return 0
	}
	return res.Results[0].StatusCode
}

func strPtr(s string) *string { return &s }

// overrideHost replaces the host:port in serverURL with that of dialURL.
// PLCs advertise their own hostname in endpoint descriptions; this lets us
// connect via IP when DNS can't resolve the hostname.
func overrideHost(serverURL, dialURL string) string {
	srv, err1 := url.Parse(serverURL)
	dial, err2 := url.Parse(dialURL)
	if err1 != nil || err2 != nil || dial.Host == "" {
		return serverURL
	}
	srv.Host = dial.Host
	return srv.String()
}

func init() {
	drivers.Register("opcua", func(_ drivers.BuildCtx) drivers.ProtocolDriver { return New() })
}
