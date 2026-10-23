// Package mqtt implements ProtocolDriver for MQTT 3.1.1/5 via paho.mqtt.golang.
//
// Tag paths are MQTT topics. Browse() returns the topics that have been seen
// since Connect() (passive discovery — MQTT has no native topic enumeration).
package mqtt

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
	seenTopic sync.Map // map[string]struct{}
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
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("mqtt: endpoint is required")
	}
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
		SetOnConnectHandler(func(_ mqttlib.Client) {
			log.Printf("[DRIVER] mqtt: connected to %s", cfg.Endpoint)
			d.connected.Store(true)
		}).
		SetConnectionLostHandler(func(_ mqttlib.Client, err error) {
			log.Printf("[DRIVER] mqtt: connection lost: %v", err)
			d.connected.Store(false)
			s := err.Error()
			d.lastErr.Store(&s)
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
	d.mu.Unlock()

	// Subscribe to # (all topics) for passive discovery.
	// This lets Browse() return topics without any explicit Subscribe() calls.
	discoveryHandler := func(_ mqttlib.Client, msg mqttlib.Message) {
		topic := msg.Topic()
		d.seenTopic.Store(topic, struct{}{})
		d.tagCount.Store(int32(d.countSeen()))
	}
	// Use QoS 0 and don't block startup on failure.
	tok = c.Subscribe("#", 0, discoveryHandler)
	_ = tok.WaitTimeout(2 * time.Second)
	log.Printf("[DRIVER] mqtt: wildcard discovery subscription active")

	return nil
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	c := d.client
	d.client = nil
	d.mu.Unlock()
	if c != nil {
		c.Disconnect(250)
	}
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

// Subscribe attaches MQTT subscriptions for each path. Wildcards (+, #) are supported.
func (d *Driver) Subscribe(ctx context.Context, paths []string, ch chan<- tagstore.TagUpdate) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("mqtt: not connected")
	}
	handler := func(_ mqttlib.Client, msg mqttlib.Message) {
		topic := msg.Topic()
		d.seenTopic.Store(topic, struct{}{})
		d.tagCount.Store(int32(d.countSeen()))
		select {
		case ch <- tagstore.TagUpdate{
			Path: topic,
			State: tagstore.TagState{
				Value:   parsePayload(msg.Payload()),
				Quality: "Good",
				TS:      time.Now().UnixNano(),
			},
		}:
		default:
			// pump is slow; drop
		}
	}

	for _, p := range paths {
		tok := c.Subscribe(p, 0, handler)
		if !waitToken(ctx, tok) {
			return fmt.Errorf("mqtt: subscribe %s: %w", p, tok.Error())
		}
		log.Printf("[DRIVER] mqtt: subscribed %s", p)
	}
	return nil
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
