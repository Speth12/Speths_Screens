// OPC UA spike — Day 1 gating test for github.com/Speth12/speths-screens
//
// Connects to AXC F 3152 with SignAndEncrypt + Basic256Sha256,
// auto-browses the address space for Variable nodes, subscribes
// to up to 5 of them, prints values for 60 s, then disconnects.
//
// Pass criteria: ≥5 values received per subscribed tag in 60 s.
//
// Usage:
//
//	go run ./cmd/spike
//	go run ./cmd/spike -endpoint opc.tcp://192.168.88.10:4840
package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/url"
	"os"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

const (
	spikeDuration = 60 * time.Second
	subInterval   = 500 * time.Millisecond
	certFile      = "spike-cert.pem"
	keyFile       = "spike-key.pem"
	appURI        = "urn:x-hmi:spike"
	maxTags       = 5
	browseDepth   = 4
)

func main() {
	endpoint := flag.String("endpoint", "opc.tcp://192.168.88.10:4840", "OPC UA endpoint URL")
	flag.Parse()

	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("[SPIKE] Speth's Screens OPC UA spike — Day 1 gating test")
	log.Printf("[SPIKE] Endpoint:  %s", *endpoint)
	log.Printf("[SPIKE] Security:  SignAndEncrypt / Basic256Sha256")
	log.Printf("[SPIKE] Duration:  %s", spikeDuration)

	if err := ensureCert(); err != nil {
		log.Fatalf("[SPIKE] cert: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), spikeDuration+30*time.Second)
	defer cancel()

	// --- endpoint discovery ---
	log.Println("[SPIKE] Discovering endpoints...")
	eps, err := opcua.GetEndpoints(ctx, *endpoint)
	if err != nil {
		log.Fatalf("[SPIKE] FAIL GetEndpoints: %v\n[SPIKE] Check network path to %s", err, *endpoint)
	}
	log.Printf("[SPIKE] Found %d endpoints:", len(eps))
	for _, ep := range eps {
		log.Printf("[SPIKE]   mode=%-20v  policy=%s", ep.SecurityMode, ep.SecurityPolicyURI)
	}

	ep := opcua.SelectEndpoint(eps, "Basic256Sha256", ua.MessageSecurityModeSignAndEncrypt)
	if ep == nil {
		log.Println("[SPIKE] WARN: no SignAndEncrypt/Basic256Sha256 endpoint — falling back to no security for browse")
		ep = opcua.SelectEndpoint(eps, "None", ua.MessageSecurityModeNone)
	}
	if ep == nil {
		log.Fatalf("[SPIKE] FAIL: no usable endpoint found")
	}
	log.Printf("[SPIKE] Selected: %s  mode=%v", ep.EndpointURL, ep.SecurityMode)

	opts := []opcua.Option{
		opcua.SecurityFromEndpoint(ep, ua.UserTokenTypeAnonymous),
		opcua.AutoReconnect(true),
		opcua.ReconnectInterval(2 * time.Second),
	}
	if ep.SecurityMode != ua.MessageSecurityModeNone {
		opts = append(opts,
			opcua.CertificateFile(certFile),
			opcua.PrivateKeyFile(keyFile),
		)
	}

	c, err := opcua.NewClient(ep.EndpointURL, opts...)
	if err != nil {
		log.Fatalf("[SPIKE] NewClient: %v", err)
	}

	log.Println("[DRIVER] Connecting...")
	if err = c.Connect(ctx); err != nil {
		log.Fatalf("[DRIVER] FAIL Connect: %v\n[SPIKE] If this is a cert trust issue, accept 'x-hmi spike' in PLCnext Engineer → Security → OPC UA Certificates", err)
	}
	defer c.Close(ctx)
	log.Println("[DRIVER] Connected")

	// --- browse address space for Variable nodes ---
	log.Println("[SPIKE] Browsing address space for Variable nodes...")
	var discovered []string
	browseForVars(ctx, c, ua.NewNumericNodeID(0, id.ObjectsFolder), 0, &discovered)
	if len(discovered) == 0 {
		log.Fatalf("[SPIKE] FAIL: browse returned 0 variable nodes")
	}
	log.Printf("[SPIKE] Discovered %d variable node(s); subscribing to up to %d", len(discovered), maxTags)
	tags := discovered
	if len(tags) > maxTags {
		tags = tags[:maxTags]
	}
	for _, t := range tags {
		log.Printf("[SPIKE]   tag: %s", t)
	}

	// --- subscription ---
	notifyCh := make(chan *opcua.PublishNotificationData, 128)
	sub, err := c.Subscribe(ctx, &opcua.SubscriptionParameters{
		Interval: subInterval,
	}, notifyCh)
	if err != nil {
		log.Fatalf("[SPIKE] Subscribe: %v", err)
	}
	defer sub.Cancel(ctx)

	counts := make(map[string]int, len(tags))
	for i, tagID := range tags {
		nodeID, err := ua.ParseNodeID(tagID)
		if err != nil {
			log.Printf("[SPIKE] ParseNodeID %q: %v — skipping", tagID, err)
			continue
		}
		req := &ua.MonitoredItemCreateRequest{
			ItemToMonitor: &ua.ReadValueID{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
			},
			MonitoringMode: ua.MonitoringModeReporting,
			RequestedParameters: &ua.MonitoringParameters{
				ClientHandle:     uint32(i + 1),
				SamplingInterval: float64(subInterval.Milliseconds()),
				QueueSize:        10,
				DiscardOldest:    true,
			},
		}
		res, err := sub.Monitor(ctx, ua.TimestampsToReturnBoth, req)
		if err != nil {
			log.Printf("[SPIKE] Monitor %q: %v", tagID, err)
			continue
		}
		if res.Results[0].StatusCode != ua.StatusOK {
			log.Printf("[SPIKE] Monitor %q: status=%v", tagID, res.Results[0].StatusCode)
			continue
		}
		counts[tagID] = 0
		log.Printf("[TAG] Subscribed: %s", tagID)
	}

	if len(counts) == 0 {
		log.Fatalf("[SPIKE] FAIL: no tags could be subscribed")
	}

	log.Printf("[SPIKE] Receiving for %s — Ctrl-C to stop early", spikeDuration)
	deadline := time.After(spikeDuration)
loop:
	for {
		select {
		case <-deadline:
			break loop
		case <-ctx.Done():
			break loop
		case notif, ok := <-notifyCh:
			if !ok {
				break loop
			}
			if notif.Error != nil {
				log.Printf("[SPIKE] notification error: %v", notif.Error)
				continue
			}
			dcn, ok := notif.Value.(*ua.DataChangeNotification)
			if !ok {
				continue
			}
			for _, item := range dcn.MonitoredItems {
				if item.Value == nil || item.Value.Value == nil {
					continue
				}
				tagID := tagFromHandle(tags, item.ClientHandle)
				counts[tagID]++
				fmt.Printf("[TAG] %-55s  value=%-12v  quality=%v  ts=%s\n",
					tagID,
					item.Value.Value.Value(),
					item.Value.Status,
					item.Value.SourceTimestamp.Format(time.RFC3339Nano),
				)
			}
		}
	}

	// --- result ---
	log.Println("\n[SPIKE] === Results ===")
	pass := true
	for _, tagID := range tags {
		if _, tracked := counts[tagID]; !tracked {
			continue
		}
		n := counts[tagID]
		status := "PASS"
		if n < 5 {
			status = "FAIL"
			pass = false
		}
		log.Printf("[SPIKE]   %-55s  %d values  %s", tagID, n, status)
	}
	if pass {
		log.Println("[SPIKE] PASS — gopcua + AXC F 3152 working. Continue with pure Go plan.")
	} else {
		log.Println("[SPIKE] FAIL — activate Node.js escape hatch.")
		os.Exit(1)
	}
}

// browseForVars recursively browses from nodeID and appends Variable node IDs to out.
func browseForVars(ctx context.Context, c *opcua.Client, nodeID *ua.NodeID, depth int, out *[]string) {
	if depth > browseDepth || len(*out) >= maxTags {
		return
	}
	req := &ua.BrowseRequest{
		RequestedMaxReferencesPerNode: 100,
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
		if len(*out) >= maxTags {
			return
		}
		nid := ref.NodeID.NodeID
		if ref.NodeClass == ua.NodeClassVariable {
			*out = append(*out, nid.String())
		} else {
			browseForVars(ctx, c, nid, depth+1, out)
		}
	}
}

// ensureCert generates a self-signed cert/key pair if not on disk.
// OPC UA SignAndEncrypt requires a client cert with the appURI as SAN.
func ensureCert() error {
	if fileExists(certFile) && fileExists(keyFile) {
		log.Printf("[SPIKE] Using existing cert: %s / %s", certFile, keyFile)
		return nil
	}
	log.Println("[SPIKE] Generating self-signed client certificate...")
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("rsa.GenerateKey: %w", err)
	}
	appURL, _ := url.Parse(appURI)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().Unix()),
		Subject:      pkix.Name{CommonName: "x-hmi spike", Organization: []string{"x-hmi"}},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(365 * 24 * time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageContentCommitment |
			x509.KeyUsageKeyEncipherment | x509.KeyUsageDataEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		URIs:                  []*url.URL{appURL},
	}
	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("CreateCertificate: %w", err)
	}
	if err = writePEM(certFile, "CERTIFICATE", certDER); err != nil {
		return err
	}
	if err = writePEM(keyFile, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(key)); err != nil {
		return err
	}
	log.Printf("[SPIKE] Cert written: %s / %s", certFile, keyFile)
	log.Println("[SPIKE] ACTION REQUIRED: trust this cert on the AXC F 3152 before SignAndEncrypt works.")
	log.Println("[SPIKE]   PLCnext Engineer → Security → OPC UA Certificate Store → accept 'x-hmi spike'")
	log.Println("[SPIKE]   Or: ssh admin@192.168.88.10 and accept via CLI, then re-run.")
	return nil
}

func writePEM(path, typ string, data []byte) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return pem.Encode(f, &pem.Block{Type: typ, Bytes: data})
}

func fileExists(path string) bool { _, err := os.Stat(path); return err == nil }

func tagFromHandle(tags []string, handle uint32) string {
	if handle == 0 || int(handle) > len(tags) {
		return fmt.Sprintf("handle=%d", handle)
	}
	return tags[handle-1]
}
