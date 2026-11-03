package mqtt

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	mochi "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// waitConnected waits for the background connect.
func waitConnected(t *testing.T, d *Driver) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !d.Status().Connected {
		if time.Now().After(deadline) {
			t.Fatalf("not connected within 10 s (status %+v)", d.Status())
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// fastRetry returns a driver that retries every 50 to 200 ms.
func fastRetry() *Driver {
	d := New()
	d.backoffMin, d.backoffMax = 50*time.Millisecond, 200*time.Millisecond
	return d
}

func deadAddr(t *testing.T) string {
	t.Helper()
	port, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	return fmt.Sprintf("127.0.0.1:%d", port)
}

// mochiAt starts a broker on addr with the given auth hook options (nil:
// allow everyone) and returns it; the test stops it.
func mochiAt(t *testing.T, addr string, ledger *auth.Ledger) *mochi.Server {
	t.Helper()
	server := mochi.New(nil)
	var err error
	if ledger == nil {
		err = server.AddHook(new(auth.AllowHook), nil)
	} else {
		err = server.AddHook(new(auth.Hook), &auth.Options{Ledger: ledger})
	}
	if err != nil {
		t.Fatalf("AddHook: %v", err)
	}
	if err := server.AddListener(listeners.NewTCP(listeners.Config{ID: "t1", Address: addr})); err != nil {
		t.Fatalf("AddListener: %v", err)
	}
	go func() { _ = server.Serve() }()
	if !waitDial(addr, 2*time.Second) {
		t.Fatalf("broker on %s did not start", addr)
	}
	t.Cleanup(func() { _ = server.Close() })
	return server
}

func TestConnectChecksEndpoint(t *testing.T) {
	tests := []struct {
		endpoint string
		ok       bool
	}{
		{"", false},
		{"tcp://", false},
		{"tcp://127.0.0.1:1883", true},
		{"ssl://127.0.0.1:1", true},
		{"127.0.0.1:1", true}, // a project's host and port
	}
	for _, tc := range tests {
		d := New()
		err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: tc.endpoint}, nil)
		if (err == nil) != tc.ok {
			t.Errorf("Connect(%q) error = %v, want ok=%v", tc.endpoint, err, tc.ok)
		}
		_ = d.Disconnect()
	}
}

// With the broker down at start, Connect returns at once, tags are Bad with
// the reason, writes fail as not connected, and the driver connects and
// subscribes on its own once the broker is up.
func TestBrokerDownAtStart(t *testing.T) {
	addr := deadAddr(t)
	ch := make(chan tagstore.TagUpdate, 64)
	d := fastRetry()
	start := time.Now()
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "tcp://" + addr}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()
	if took := time.Since(start); took > 500*time.Millisecond {
		t.Errorf("Connect took %v; it should not wait for the broker", took)
	}
	if err := d.SetTags([]string{"plant/a", "plant/+/temp"}); err != nil {
		t.Fatalf("SetTags before the first connect: %v", err)
	}

	select {
	case u := <-ch:
		if u.Path != "plant/a" || u.State.Quality != "Bad" || !strings.Contains(u.State.Reason, "refused") {
			t.Errorf("got %+v, want plant/a Bad with a refused reason", u)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("no Bad update while the broker is down (status %+v)", d.Status())
	}
	if st := d.Status(); st.Connected || !strings.Contains(st.LastError, "refused") {
		t.Errorf("status %+v, want offline with a refused reason", st)
	}
	if err := d.Write(context.Background(), "plant/a", 1); !errors.Is(err, drivers.ErrNotConnected) {
		t.Errorf("Write while offline: %v, want not connected", err)
	}

	mochiAt(t, addr, nil)
	waitConnected(t, d)
	if st := d.Status(); st.LastError != "" {
		t.Errorf("LastError = %q after connecting, want empty", st.LastError)
	}
	for _, w := range []struct {
		topic string
		value float64
	}{{"plant/a", 5}, {"plant/x/temp", 21}} {
		if err := d.Write(context.Background(), w.topic, w.value); err != nil {
			t.Fatal(err)
		}
		deadline := time.After(3 * time.Second)
		for got := false; !got; {
			select {
			case u := <-ch:
				got = u.Path == w.topic && u.State.Quality == "Good" && u.State.Value == w.value
			case <-deadline:
				t.Fatalf("%s: no Good %v after connecting", w.topic, w.value)
			}
		}
	}
}

// A broker that refuses the login keeps the driver offline with that reason,
// still retrying.
func TestLoginRefused(t *testing.T) {
	addr := deadAddr(t)
	mochiAt(t, addr, &auth.Ledger{Auth: auth.AuthRules{{Username: "hmi", Password: "right", Allow: true}}})
	d := fastRetry()
	cfg := drivers.DriverConfig{Endpoint: "tcp://" + addr, Username: "hmi", Password: "wrong"}
	if err := d.Connect(context.Background(), cfg, nil); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(d.Status().LastError, "refused the login") {
		if time.Now().After(deadline) {
			t.Fatalf("status %+v, want the refused login", d.Status())
		}
		time.Sleep(20 * time.Millisecond)
	}
	time.Sleep(500 * time.Millisecond) // a few more retries
	if st := d.Status(); st.Connected || !strings.Contains(st.LastError, "refused the login") {
		t.Errorf("status %+v after retries, want still offline with the refused login", st)
	}
}

// Disconnect stops the retries: a broker that comes up afterwards never sees
// the driver.
func TestDisconnectStopsRetrying(t *testing.T) {
	addr := deadAddr(t)
	d := fastRetry()
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "tcp://" + addr}, nil); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for d.Status().LastError == "" {
		if time.Now().After(deadline) {
			t.Fatal("no failed attempt within 5 s")
		}
		time.Sleep(20 * time.Millisecond)
	}
	start := time.Now()
	if err := d.Disconnect(); err != nil {
		t.Fatal(err)
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("Disconnect took %v", took)
	}
	server := mochiAt(t, addr, nil)
	time.Sleep(time.Second)
	if n := server.Clients.Len(); n != 0 {
		t.Errorf("broker has %d clients after Disconnect, want 0", n)
	}
	if d.Status().Connected {
		t.Error("Status says connected after Disconnect")
	}
}
