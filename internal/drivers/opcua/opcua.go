// Package opcua implements ProtocolDriver for OPC UA via gopcua v0.5.x.
package opcua

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"slices"
	"sort"
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
type Driver struct {
	mu        sync.Mutex
	client    *opcua.Client
	endpoint  string
	pollEvery time.Duration
	cancel    context.CancelFunc // stops the poll loop; nil when not running
	out       chan<- tagstore.TagUpdate
	wg        sync.WaitGroup
	connected atomic.Bool
	lastErr   atomic.Pointer[string]
	tagCount  atomic.Int32

	tags atomic.Pointer[tagSet] // current poll set, swapped by SetTags

	// read replaces client.Read in tests; nil means use the client.
	read func(ctx context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error)
}

// New returns an unconnected driver.
func New() *Driver { return &Driver{pollEvery: subInterval} }

// ID returns "opcua".
func (d *Driver) ID() string { return driverID }

// Connect dials the endpoint and selects the security policy.
//
// cfg.Endpoint:           opc.tcp://host:port
// cfg.Extra["securityMode"]:   None | Sign | SignAndEncrypt   (default Sign+Encrypt if available)
// cfg.Extra["securityPolicy"]: None | Basic128Rsa15 | Basic256 | Basic256Sha256
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("opcua: endpoint is required")
	}
	d.mu.Lock()
	d.out = out
	d.mu.Unlock()
	d.endpoint = cfg.Endpoint

	desiredMode := cfg.Extra["securityMode"]
	if desiredMode == "" {
		desiredMode = "SignAndEncrypt"
	}
	desiredPolicy := cfg.Extra["securityPolicy"]
	if desiredPolicy == "" {
		desiredPolicy = "Basic256Sha256"
	}

	log.Printf("[DRIVER] opcua: discovering endpoints at %s", cfg.Endpoint)
	eps, err := opcua.GetEndpoints(ctx, cfg.Endpoint)
	if err != nil {
		return d.fail(fmt.Errorf("GetEndpoints: %w", err))
	}

	ep := opcua.SelectEndpoint(eps, desiredPolicy, mapMode(desiredMode))
	if ep == nil {
		ep = opcua.SelectEndpoint(eps, "None", ua.MessageSecurityModeNone)
		if ep == nil {
			return d.fail(fmt.Errorf("no usable endpoint in %d offered", len(eps)))
		}
		log.Printf("[DRIVER] opcua: %s/%s not offered, falling back to None", desiredMode, desiredPolicy)
	}

	opts := []opcua.Option{
		opcua.SecurityFromEndpoint(ep, mapTokenType(cfg.Username)),
		opcua.AutoReconnect(true),
		opcua.ReconnectInterval(2 * time.Second),
	}
	if cfg.Username != "" {
		opts = append(opts, opcua.AuthUsername(cfg.Username, cfg.Password))
	} else {
		opts = append(opts, opcua.AuthAnonymous())
	}
	if ep.SecurityMode != ua.MessageSecurityModeNone {
		if err := cert.Ensure(defaultCert, defaultKey, appURI, "x-hmi runtime"); err != nil {
			return d.fail(fmt.Errorf("ensure cert: %w", err))
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
		return d.fail(fmt.Errorf("NewClient: %w", err))
	}

	log.Printf("[DRIVER] opcua: connecting to %s mode=%v", connectURL, ep.SecurityMode)
	if err = c.Connect(ctx); err != nil {
		return d.fail(fmt.Errorf("Connect: %w", err))
	}

	d.mu.Lock()
	d.client = c
	d.mu.Unlock()
	d.connected.Store(true)
	d.lastErr.Store(strPtr(""))
	log.Printf("[DRIVER] opcua: connected")
	d.startLoop()
	return nil
}

// startLoop starts the driver's only poll goroutine.
func (d *Driver) startLoop() {
	loopCtx, cancel := context.WithCancel(context.Background())
	d.mu.Lock()
	d.cancel = cancel
	d.mu.Unlock()
	d.wg.Add(1)
	go d.pollLoop(loopCtx)
}

// Disconnect stops the poll loop and closes the connection.
func (d *Driver) Disconnect() error {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
	}
	d.mu.Unlock()
	d.wg.Wait()

	d.mu.Lock()
	c := d.client
	d.client = nil
	d.mu.Unlock()
	d.connected.Store(false)
	if c == nil {
		return nil
	}
	return c.Close(context.Background())
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

// pollLoop is the driver's only poll goroutine. It reads the current tag set
// on every tick, so SetTags takes effect on the next tick.
func (d *Driver) pollLoop(ctx context.Context) {
	defer d.wg.Done()
	ticker := time.NewTicker(d.pollEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ts := d.tags.Load()
			out := d.output()
			if ts == nil || len(ts.paths) == 0 || out == nil {
				continue
			}
			res, err := d.readNow(ctx, ts.req)
			if err != nil {
				if ctx.Err() == nil {
					log.Printf("[DRIVER] opcua: poll read error: %v", err)
				}
				continue
			}
			for i, dv := range res.Results {
				if i >= len(ts.paths) {
					break
				}
				if dv == nil || dv.Value == nil {
					continue
				}
				select {
				case out <- tagstore.TagUpdate{
					Path: ts.paths[i],
					State: tagstore.TagState{
						Value:   dv.Value.Value(),
						Quality: qualityFromStatus(dv.Status),
						TS:      dv.SourceTimestamp.UnixNano(),
					},
				}:
				case <-ctx.Done():
					return
				}
			}
		}
	}
}

// Write writes value to the given OPC UA node.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("opcua: not connected")
	}
	nid, err := ua.ParseNodeID(path)
	if err != nil {
		return fmt.Errorf("opcua: bad node id %q: %w", path, err)
	}
	v, err := ua.NewVariant(value)
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
	res, err := c.Write(ctx, req)
	if err != nil {
		return err
	}
	if len(res.Results) > 0 && res.Results[0] != ua.StatusOK {
		return fmt.Errorf("opcua: write status %v", res.Results[0])
	}
	return nil
}

// Status returns the current state.
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

func (d *Driver) getClient() *opcua.Client {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.client
}

func (d *Driver) fail(err error) error {
	d.connected.Store(false)
	s := err.Error()
	d.lastErr.Store(&s)
	return err
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
