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
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mqttlib "github.com/eclipse/paho.mqtt.golang"
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

	// subMu serializes SetTags; subs holds the topics subscribed for tags.
	subMu sync.Mutex
	subs  map[string]bool

	// sendMu orders what goes to out: the Bad burst after a lost connection
	// and the messages after the reconnect. gen counts connections; lost is
	// set from a lost connection until the next connect. last holds the
	// newest value per topic so a Bad update can keep it.
	sendMu sync.Mutex
	gen    atomic.Uint64
	lost   atomic.Bool
	last   sync.Map // map[string]any

	connected atomic.Bool
	lastErr   atomic.Pointer[string]
	tagCount  atomic.Int32
}

// New returns an unconnected driver.
func New() *Driver { return &Driver{} }

func (d *Driver) ID() string { return driverID }

// Connect dials the MQTT broker.
//
// cfg.Endpoint:           tcp://host:port  or  ssl://host:port
// cfg.Username/Password:  optional auth
// cfg.Extra["clientId"]:  optional client id (default: x-hmi-<unix-nano>)
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("mqtt: endpoint is required")
	}
	d.mu.Lock()
	d.out = out
	d.mu.Unlock()
	clientID := cfg.Extra["clientId"]
	if clientID == "" {
		clientID = fmt.Sprintf("x-hmi-%d", time.Now().UnixNano())
	}

	opts := mqttlib.NewClientOptions().
		AddBroker(cfg.Endpoint).
		SetClientID(clientID).
		SetAutoReconnect(true).
		SetConnectTimeout(connTimeout).
		SetCleanSession(true).
		SetOnConnectHandler(func(c mqttlib.Client) {
			log.Printf("[DRIVER] mqtt: connected to %s", cfg.Endpoint)
			d.gen.Add(1)
			d.connected.Store(true)
			d.lastErr.Store(strPtr(""))
			if d.lost.Swap(false) {
				d.resubscribe(c)
			}
		}).
		SetConnectionLostHandler(func(_ mqttlib.Client, err error) {
			log.Printf("[DRIVER] mqtt: connection lost: %v", err)
			d.connected.Store(false)
			s := err.Error()
			d.lastErr.Store(&s)
			d.lost.Store(true)
			d.markLost(d.gen.Load(), "mqtt: connection lost: "+s)
		})
	if cfg.Username != "" {
		opts.SetUsername(cfg.Username)
		opts.SetPassword(cfg.Password)
	}

	c := mqttlib.NewClient(opts)
	tok := c.Connect()
	if !waitToken(ctx, tok) {
		return d.fail(fmt.Errorf("mqtt: connect: %w", tok.Error()))
	}

	d.mu.Lock()
	d.client = c
	d.done = make(chan struct{})
	d.mu.Unlock()

	// Subscribe to # (all topics) for passive discovery.
	// This lets Browse() return topics without any SetTags() calls.
	// Use QoS 0 and don't block startup on failure.
	tok = c.Subscribe("#", 0, d.discover)
	_ = tok.WaitTimeout(2 * time.Second)
	log.Printf("[DRIVER] mqtt: wildcard discovery subscription active")

	return nil
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	c := d.client
	d.client = nil
	if d.done != nil {
		close(d.done)
		d.done = nil
	}
	d.mu.Unlock()
	if c != nil {
		c.Disconnect(250)
	}
	d.subMu.Lock()
	d.subs = nil
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
// tag subscriptions (the "#" discovery subscription stays).
func (d *Driver) SetTags(paths []string) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("mqtt: not connected")
	}
	d.subMu.Lock()
	defer d.subMu.Unlock()
	if d.subs == nil {
		d.subs = map[string]bool{}
	}

	want := map[string]bool{}
	for _, p := range drivers.NormalizePaths(paths) {
		want[p] = true
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

// markLost marks every subscribed topic without wildcards Bad, keeping its
// last value. It stops if the client reconnects meanwhile (gen changes), so
// a Bad update never follows a fresh value.
func (d *Driver) markLost(gen uint64, reason string) {
	d.subMu.Lock()
	var topics []string
	for t := range d.subs {
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

// resubscribe restores the subscriptions after a reconnect. With a clean
// session the broker has forgotten them. A topic that fails is dropped from
// subs so the next SetTags tries it again.
func (d *Driver) resubscribe(c mqttlib.Client) {
	if tok := c.Subscribe("#", 0, d.discover); !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
		log.Printf("[DRIVER] mqtt: resubscribe #: %v", tok.Error())
	}
	d.subMu.Lock()
	defer d.subMu.Unlock()
	for topic := range d.subs {
		tok := c.Subscribe(topic, 0, d.onMessage)
		if !tok.WaitTimeout(connTimeout) || tok.Error() != nil {
			log.Printf("[DRIVER] mqtt: resubscribe %s: %v", topic, tok.Error())
			delete(d.subs, topic)
		}
	}
	log.Printf("[DRIVER] mqtt: resubscribed %d topics", len(d.subs))
}

// discover records a topic seen on the "#" subscription, for Browse.
func (d *Driver) discover(_ mqttlib.Client, msg mqttlib.Message) {
	d.seenTopic.Store(msg.Topic(), struct{}{})
	d.tagCount.Store(int32(d.countSeen()))
}

// Write publishes value as the payload to topic path.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("mqtt: not connected")
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
	return drivers.DriverStatus{
		Connected: d.connected.Load(),
		LastError: last,
		TagCount:  int(d.tagCount.Load()),
	}
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

func (d *Driver) fail(err error) error {
	s := err.Error()
	d.lastErr.Store(&s)
	return err
}

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
