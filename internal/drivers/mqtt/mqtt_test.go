package mqtt

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mochi "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
)

// startBroker spins an in-process MQTT broker on a random port for testing.
// Retries on port collision.
func startBroker(t *testing.T) (string, func()) {
	t.Helper()
	for attempt := 0; attempt < 5; attempt++ {
		port, err := freePort()
		if err != nil {
			t.Fatalf("freePort: %v", err)
		}
		server := mochi.New(nil)
		if err := server.AddHook(new(auth.AllowHook), nil); err != nil {
			t.Fatalf("AddHook: %v", err)
		}
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		if err := server.AddListener(listeners.NewTCP(listeners.Config{ID: "t1", Address: addr})); err != nil {
			_ = server.Close()
			continue
		}
		serveErr := make(chan error, 1)
		go func() { serveErr <- server.Serve() }()

		// wait until accept loop is up
		ok := waitDial(addr, 2*time.Second)
		if !ok {
			_ = server.Close()
			continue
		}
		cleanup := func() {
			_ = server.Close()
			select {
			case <-serveErr:
			case <-time.After(time.Second):
			}
		}
		return "tcp://" + addr, cleanup
	}
	t.Fatalf("could not start broker after 5 attempts")
	return "", nil
}

func waitDial(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		c, err := net.Dial("tcp", addr)
		if err == nil {
			c.Close()
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func TestConnectAndSubscribe(t *testing.T) {
	endpoint, stop := startBroker(t)
	defer stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch := make(chan tagstore.TagUpdate, 8)
	d := New()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: endpoint}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()
	if !d.Status().Connected {
		t.Fatal("expected Connected=true")
	}

	if err := d.SetTags([]string{"x-hmi/test/+"}); err != nil {
		t.Fatalf("SetTags: %v", err)
	}

	// publish a message via the same client
	if err := d.Write(ctx, "x-hmi/test/temp", "23.5"); err != nil {
		t.Fatalf("Write: %v", err)
	}

	select {
	case u := <-ch:
		if u.Path != "x-hmi/test/temp" {
			t.Errorf("path: got %q want x-hmi/test/temp", u.Path)
		}
		// parsePayload JSON-decodes numeric payloads → float64
		if v, ok := u.State.Value.(float64); !ok || v != 23.5 {
			t.Errorf("value: got %v (%T) want float64(23.5)", u.State.Value, u.State.Value)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive published message in 2s")
	}
}

func TestBrowseReturnsSeenTopics(t *testing.T) {
	endpoint, stop := startBroker(t)
	defer stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch := make(chan tagstore.TagUpdate, 16)
	d := New()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: endpoint}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()

	if err := d.SetTags([]string{"#"}); err != nil {
		t.Fatalf("SetTags: %v", err)
	}

	for _, topic := range []string{"a/b", "x/y/z", "another"} {
		if err := d.Write(ctx, topic, "v"); err != nil {
			t.Fatalf("Write %s: %v", topic, err)
		}
	}

	// drain enough updates
	deadline := time.After(2 * time.Second)
	got := 0
	for got < 3 {
		select {
		case <-ch:
			got++
		case <-deadline:
			t.Fatalf("only got %d updates", got)
		}
	}

	defs, err := d.Browse(ctx)
	if err != nil {
		t.Fatalf("Browse: %v", err)
	}
	if len(defs) < 3 {
		t.Errorf("Browse: got %d defs want >=3", len(defs))
	}
}

func TestStatusAfterDisconnect(t *testing.T) {
	endpoint, stop := startBroker(t)
	defer stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	d := New()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: endpoint}, nil); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if err := d.Disconnect(); err != nil {
		t.Fatalf("Disconnect: %v", err)
	}
	if d.Status().Connected {
		t.Error("expected Connected=false after Disconnect")
	}
}
