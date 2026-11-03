// Package mqtt implements ProtocolDriver for MQTT 3.1.1/5 via paho.mqtt.golang.
//
// Tag paths are MQTT topics. Browse() returns the topics that have been seen
// since Connect() (passive discovery — MQTT has no native topic enumeration).
package mqtt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mqttlib "github.com/eclipse/paho.mqtt.golang"
	"github.com/eclipse/paho.mqtt.golang/packets"
)

const (
	driverID    = "mqtt"
	connTimeout = 5 * time.Second
)

// Driver implements drivers.ProtocolDriver for MQTT.
type Driver struct {
	mu        sync.Mutex
	client    mqttlib.Client
	out       chan<- tagstore.TagUpdate
	done      chan struct{} // closed by Disconnect; unblocks message handlers
	seenTopic sync.Map      // map[string]struct{}

	// subMu serializes SetTags and the subscribing after each connect. want
	// holds the tag topics asked for, subs those subscribed on the current
	// connection. connected only changes to true under subMu, so SetTags
	// either runs before a connect (which subscribes want) or after it.
	subMu sync.Mutex
	want  map[string]bool
	subs  map[string]bool

	// sendMu orders what goes to out: the Bad burst after a lost connection
	// and the messages after the reconnect. gen counts connections. last
	// holds the newest value per topic so a Bad update can keep it.
	sendMu sync.Mutex
	gen    atomic.Uint64
	last   sync.Map // map[string]any

	connected atomic.Bool
	lastErr   atomic.Pointer[string]
	tagCount  atomic.Int32
	certs     atomic.Pointer[drivers.CertPolicy] // set for TLS endpoints only

	// cancel stops the first-connect loop; wg waits for it.
	cancel     context.CancelFunc
	wg         sync.WaitGroup
	backoffMin time.Duration
	backoffMax time.Duration
}

// New returns an unconnected driver.
func New() *Driver { return &Driver{backoffMin: time.Second, backoffMax: 30 * time.Second} }

func (d *Driver) ID() string { return driverID }

// Connect checks the config and starts connecting in the background; it
// never waits for the broker. Until the first connect succeeds the driver
// retries with backoff (1 s doubling to 30 s), its exact-topic tags are Bad
// with the reason and writes fail at once. After that, paho's auto-reconnect
// handles lost connections, capped at the same 30 s.
//
// cfg.Endpoint:           tcp://host:port  or  ssl://host:port
// cfg.Username/Password:  optional auth
// cfg.Extra["clientId"]:  optional client id (default: x-hmi-<unix-nano>)
func (d *Driver) Connect(_ context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("mqtt: endpoint is required")
	}
	endpoint := cfg.Endpoint
	if !strings.Contains(endpoint, "://") {
		endpoint = "tcp://" + endpoint // a project's host and port arrive as host:port
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return fmt.Errorf("mqtt: endpoint %q is not host:port, tcp://host:port or ssl://host:port", cfg.Endpoint)
	}
	// Without a certCheck a TLS broker is checked against the system's
	// trusted roots, as paho always did.
	certs, err := drivers.NewCertPolicy(cfg.Extra["certCheck"], cfg.Extra["certFingerprint"], drivers.CertTrusted)
	if err != nil {
		return fmt.Errorf("mqtt: %w", err)
	}
	clientID := cfg.Extra["clientId"]
	if clientID == "" {
		clientID = fmt.Sprintf("x-hmi-%d", time.Now().UnixNano())
	}
	runCtx, cancel := context.WithCancel(context.Background())

	opts := mqttlib.NewClientOptions().
		AddBroker(endpoint).
		SetClientID(clientID).
		SetAutoReconnect(true).
		SetMaxReconnectInterval(d.backoffMax).
		SetConnectTimeout(connTimeout).
		SetCleanSession(true).
		SetOnConnectHandler(func(c mqttlib.Client) {
			if runCtx.Err() != nil {
				return // connected just as Disconnect ran
			}
			log.Printf("[DRIVER] mqtt: connected to %s", cfg.Endpoint)
			d.gen.Add(1)
			d.subscribeAll(c)
		}).
		SetConnectionLostHandler(func(_ mqttlib.Client, err error) {
			if runCtx.Err() != nil {
				return
			}
			log.Printf("[DRIVER] mqtt: connection lost: %v", err)
			d.connected.Store(false)
			s := err.Error()
			d.lastErr.Store(&s)
			d.markLost(d.gen.Load(), "mqtt: connection lost: "+s)
		})
	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}
	switch u.Scheme {
	case "ssl", "tls", "mqtts", "tcps", "wss":
		opts.SetTLSConfig(certs.TLSConfig()) // a refused certificate fails before the login is sent
		d.certs.Store(certs)
	default:
		d.certs.Store(nil)
	}

	c := mqttlib.NewClient(opts)
	d.mu.Lock()
	d.out = out
	d.client = c
	d.done = make(chan struct{})
	d.cancel = cancel
	d.mu.Unlock()
	d.lastErr.Store(strPtr(""))
	d.wg.Add(1)
	go d.connectLoop(runCtx, c, u.Host)
	return nil
}

// connectLoop makes the first connection, retrying with backoff. A failure
// marks the exact-topic tags Bad once and is kept as the status reason.
func (d *Driver) connectLoop(ctx context.Context, c mqttlib.Client, host string) {
	defer d.wg.Done()
	retry := drivers.Backoff{Min: d.backoffMin, Max: d.backoffMax}
	marked := ""
	for {
		tok := c.Connect()
		select {
		case <-tok.Done():
		case <-ctx.Done():
			<-tok.Done() // bounded by connTimeout; Disconnect then closes a settled client
			return
		}
		if tok.Error() == nil {
			return // from here paho's auto-reconnect owns the connection
		}
		reason := connectReason(host, tok.Error())
		d.lastErr.Store(&reason)
		if reason != marked {
			log.Printf("[DRIVER] mqtt: %s; retrying", reason)
			d.markLost(d.gen.Load(), reason)
			marked = reason
		}
		if !drivers.SleepCtx(ctx, retry.Next()) {
			return
		}
	}
}

// connectReason gives a short reason for a failed connect.
func connectReason(host string, err error) string {
	if r, ok := drivers.NetReason(host, err); ok {
		return r
	}
	if errors.Is(err, packets.ErrorRefusedBadUsernameOrPassword) || errors.Is(err, packets.ErrorRefusedNotAuthorised) {
		return host + " refused the login"
	}
	return fmt.Sprintf("cannot connect to %s: %v", host, err)
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	c := d.client
	d.client = nil
	cancel := d.cancel
	d.cancel = nil
	if d.done != nil {
		close(d.done)
		d.done = nil
	}
	d.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	d.wg.Wait()
	if c != nil {
		c.Disconnect(250)
	}
	d.subMu.Lock()
	d.subs = nil
	d.want = nil
	d.subMu.Unlock()
	d.connected.Store(false)
	return nil
}

// Browse returns the topics observed since Connect.
func (d *Driver) Browse(ctx context.Context) ([]drivers.TagDefinition, error) {
	var defs []drivers.TagDefinition
	d.seenTopic.Range(func(k, _ any) bool {
		defs = append(defs, drivers.TagDefinition{Path: k.(string), Writable: true})
		return true
	})
	return defs, nil
}

// SetTags makes the tag subscriptions match paths. Wildcards (+, #) are
// supported. It is idempotent: topics already subscribed are left alone, new
// ones are subscribed and removed ones unsubscribed. An empty set removes all
// tag subscriptions (the "#" discovery subscription stays). Before the first
// connect it only records the topics; the connect subscribes them.
func (d *Driver) SetTags(paths []string) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("mqtt: not started")
	}
	d.subMu.Lock()
	defer d.subMu.Unlock()
	want := map[string]bool{}
	for _, p := range drivers.NormalizePaths(paths) {
		want[p] = true
	}
	d.want = want
	if !d.connected.Load() {
		return nil
	}
	if d.subs == nil {
		d.subs = map[string]bool{}
	}

	var errs []error
	for topic := range d.subs {
		if want[topic] {
			continue
		}
		tok := c.Unsubscribe(topic)
		if !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
			errs = append(errs, fmt.Errorf("mqtt: unsubscribe %s: %v", topic, tok.Error()))
			continue
		}
		delete(d.subs, topic)
		log.Printf("[DRIVER] mqtt: unsubscribed %s", topic)
	}
	for topic := range want {
		if d.subs[topic] {
			continue
		}
		tok := c.Subscribe(topic, 0, d.onMessage)
		if !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
			errs = append(errs, fmt.Errorf("mqtt: subscribe %s: %v", topic, tok.Error()))
			continue
		}
		d.subs[topic] = true
		log.Printf("[DRIVER] mqtt: subscribed %s", topic)
	}
	return errors.Join(errs...)
}

// onMessage forwards a message on a tag topic to the output channel.
func (d *Driver) onMessage(_ mqttlib.Client, msg mqttlib.Message) {
	topic := msg.Topic()
	d.seenTopic.Store(topic, struct{}{})
	d.tagCount.Store(int32(d.countSeen()))
	val := parsePayload(msg.Payload())
	d.last.Store(topic, val)
	d.sendMu.Lock()
	defer d.sendMu.Unlock()
	d.send(topic, tagstore.TagState{Value: val, Quality: "Good", TS: time.Now().UnixNano()})
}

// send hands one update to the output; it gives up when the driver stops.
// The caller holds sendMu.
func (d *Driver) send(topic string, st tagstore.TagState) bool {
	d.mu.Lock()
	out, done := d.out, d.done
	d.mu.Unlock()
	if out == nil || done == nil {
		return false
	}
	select {
	case out <- tagstore.TagUpdate{Path: topic, State: st}:
		return true
	case <-done:
		return false
	}
}

// markLost marks every wanted topic without wildcards Bad, keeping its last
// value. It stops if the client reconnects meanwhile (gen changes), so a Bad
// update never follows a fresh value.
func (d *Driver) markLost(gen uint64, reason string) {
	d.subMu.Lock()
	var topics []string
	for t := range d.want {
		if !strings.ContainsAny(t, "+#") {
			topics = append(topics, t)
		}
	}
	d.subMu.Unlock()
	d.sendMu.Lock()
	defer d.sendMu.Unlock()
	now := time.Now().UnixNano()
	for _, t := range topics {
		if d.gen.Load() != gen {
			return
		}
		val, _ := d.last.Load(t)
		if !d.send(t, tagstore.TagState{Value: val, Quality: "Bad", Reason: reason, TS: now}) {
			return
		}
	}
}

// subscribeAll runs after every connect, first or not: with a clean session
// the broker holds no subscriptions. It subscribes "#" for discovery and
// every wanted topic, then marks the driver connected (under subMu, see
// Driver). A topic that fails stays out of subs so the next SetTags tries it
// again.
func (d *Driver) subscribeAll(c mqttlib.Client) {
	if tok := c.Subscribe("#", 0, d.discover); !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
		log.Printf("[DRIVER] mqtt: subscribe #: %v", tok.Error())
	}
	d.subMu.Lock()
	defer d.subMu.Unlock()
	d.subs = map[string]bool{}
	for topic := range d.want {
		tok := c.Subscribe(topic, 0, d.onMessage)
		if !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
			log.Printf("[DRIVER] mqtt: subscribe %s: %v", topic, tok.Error())
			continue
		}
		d.subs[topic] = true
	}
	d.lastErr.Store(strPtr(""))
	d.connected.Store(true)
	log.Printf("[DRIVER] mqtt: subscribed %d topics", len(d.subs))
}

// discover records a topic seen on the "#" subscription, for Browse.
func (d *Driver) discover(_ mqttlib.Client, msg mqttlib.Message) {
	d.seenTopic.Store(msg.Topic(), struct{}{})
	d.tagCount.Store(int32(d.countSeen()))
}

// Write publishes value as the payload to topic path.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	c := d.getClient()
	if c == nil || !d.connected.Load() {
		return drivers.Mark(fmt.Errorf("mqtt: not connected"), drivers.ErrNotConnected)
	}
	payload := toPayload(value)
	tok := c.Publish(path, 0, false, payload)
	if !waitToken(ctx, tok) {
		return fmt.Errorf("mqtt: publish %s: %w", path, tok.Error())
	}
	return nil
}

func (d *Driver) Status() drivers.DriverStatus {
	last := ""
	if p := d.lastErr.Load(); p != nil {
		last = *p
	}
	st := drivers.DriverStatus{
		Connected: d.connected.Load(),
		LastError: last,
		TagCount:  int(d.tagCount.Load()),
	}
	if c := d.certs.Load(); c != nil {
		st.CertFingerprint = c.Seen()
	}
	return st
}

func (d *Driver) getClient() mqttlib.Client {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.client
}

func (d *Driver) countSeen() int {
	n := 0
	d.seenTopic.Range(func(_, _ any) bool { n++; return true })
	return n
}

func strPtr(s string) *string { return &s }

// parsePayload converts an MQTT payload to a typed value.
// Tries JSON decode first (handles numbers, booleans, objects).
// Falls back to the raw string.
func parsePayload(b []byte) any {
	if len(b) == 0 {
		return ""
	}
	var v any
	if err := json.Unmarshal(b, &v); err == nil {
		return v
	}
	return string(b)
}

func toPayload(v any) []byte {
	switch x := v.(type) {
	case []byte:
		return x
	case string:
		return []byte(x)
	default:
		return []byte(fmt.Sprintf("%v", v))
	}
}

// waitToken blocks until the token completes or ctx is done.
// Returns true on success.
func waitToken(ctx context.Context, tok mqttlib.Token) bool {
	select {
	case <-tok.Done():
		return tok.Error() == nil
	case <-ctx.Done():
		return false
	case <-time.After(connTimeout):
		return false
	}
}

func init() {
	drivers.Register("mqtt", func(_ drivers.BuildCtx) drivers.ProtocolDriver { return New() })
}
