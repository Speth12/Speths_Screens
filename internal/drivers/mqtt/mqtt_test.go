package mqtt

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mochi "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
)

// closeBroker closes a test broker, giving up after two seconds: mochi-mqtt
// v2.7.9 (the newest release) can deadlock in Server.Close, whose
// Clients.GetByListener takes the clients' read lock and then takes it again
// in Len, so a client connecting or dropping in between blocks it for good.
// A hung Close is left behind instead of stalling the test run (seen in CI
// on 2026-11-04: TestSetTagsReplacesSubscriptions/empty timed out after 10m).
func closeBroker(t testing.TB, server *mochi.Server) {
	done := make(chan struct{})
	go func() {
		_ = server.Close()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Logf("test broker did not close in 2 s (mochi-mqtt lock bug); left it running")
	}
}

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
			closeBroker(t, server)
			continue
		}
		serveErr := make(chan error, 1)
		go func() { serveErr <- server.Serve() }()

		// wait until accept loop is up
		ok := waitDial(addr, 2*time.Second)
		if !ok {
			closeBroker(t, server)
			continue
		}
		cleanup := func() {
			closeBroker(t, server)
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

// mqttConnect is a minimal MQTT 3.1.1 CONNECT (clean session, empty client id).
var mqttConnect = []byte{0x10, 0x0c, 0x00, 0x04, 'M', 'Q', 'T', 'T', 0x04, 0x02, 0x00, 0x3c, 0x00, 0x00}

// waitDial waits until a plain-TCP broker at addr answers an MQTT CONNECT.
//
// It completes the handshake instead of dialing and hanging up: mochi-mqtt
// adds a connection to its client wait group on its own goroutine after
// accepting it, so a probe that is dropped at once can still be unattached
// when the test closes the broker, and Close's Wait then races that Add
// (seen in CI on 2026-11-04: TestStatusAfterDisconnect, DATA RACE in
// Listeners.CloseAll). Once the CONNACK arrives the connection is attached.
func waitDial(addr string, timeout time.Duration) bool {
	return waitBroker(addr, timeout, func() (net.Conn, error) {
		return net.DialTimeout("tcp", addr, time.Second)
	})
}

// waitDialTLS is waitDial for a broker with a TLS listener; it does not check the certificate.
func waitDialTLS(addr string, timeout time.Duration) bool {
	return waitBroker(addr, timeout, func() (net.Conn, error) {
		return tls.DialWithDialer(&net.Dialer{Timeout: time.Second}, "tcp", addr, &tls.Config{InsecureSkipVerify: true})
	})
}

func waitBroker(addr string, timeout time.Duration, dial func() (net.Conn, error)) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if c, err := dial(); err == nil {
			ok := probeConnack(c)
			c.Close()
			if ok {
				return true
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

// probeConnack sends CONNECT and reports whether the broker answered with a
// CONNACK, whatever its return code (a broker that refuses logins still answers).
func probeConnack(c net.Conn) bool {
	_ = c.SetDeadline(time.Now().Add(time.Second))
	if _, err := c.Write(mqttConnect); err != nil {
		return false
	}
	ack := make([]byte, 4)
	if _, err := io.ReadFull(c, ack); err != nil {
		return false
	}
	return ack[0] == 0x20
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
	waitConnected(t, d)
	if !d.Status().Connected {
		t.Fatal("expected Connected=true")
	}

	if err := d.SetTags([]string{"speths-screens/test/+"}); err != nil {
		t.Fatalf("SetTags: %v", err)
	}

	// publish a message via the same client
	if err := d.Write(ctx, "speths-screens/test/temp", "23.5"); err != nil {
		t.Fatalf("Write: %v", err)
	}

	select {
	case u := <-ch:
		if u.Path != "speths-screens/test/temp" {
			t.Errorf("path: got %q want speths-screens/test/temp", u.Path)
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
	waitConnected(t, d)

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
