package mqtt

import (
	"context"
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

// brokerAt starts a broker on addr and returns a function that stops it.
// It retries for a while because the port may still be closing.
func brokerAt(t *testing.T, addr string) func() {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		server := mochi.New(nil)
		if err := server.AddHook(new(auth.AllowHook), nil); err != nil {
			t.Fatalf("AddHook: %v", err)
		}
		err := server.AddListener(listeners.NewTCP(listeners.Config{ID: "t1", Address: addr}))
		if err == nil {
			serveErr := make(chan error, 1)
			go func() { serveErr <- server.Serve() }()
			if waitDial(addr, 2*time.Second) {
				return func() {
					_ = server.Close()
					select {
					case <-serveErr:
					case <-time.After(time.Second):
					}
				}
			}
		}
		_ = server.Close()
		if time.Now().After(deadline) {
			t.Fatalf("could not start broker on %s: %v", addr, err)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// After the broker restarts, the driver subscribes again and messages flow;
// while it is down, exact topics are Bad with their last value.
func TestResubscribeAfterBrokerRestart(t *testing.T) {
	port, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	stop := brokerAt(t, addr)
	defer func() { stop() }()

	ch := make(chan tagstore.TagUpdate, 64)
	d := New()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: "tcp://" + addr}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()
	if err := d.SetTags([]string{"plant/a", "plant/+/temp"}); err != nil {
		t.Fatal(err)
	}

	waitFor := func(what string, ok func(tagstore.TagUpdate) bool, within time.Duration) tagstore.TagUpdate {
		t.Helper()
		deadline := time.After(within)
		for {
			select {
			case u := <-ch:
				if ok(u) {
					return u
				}
			case <-deadline:
				t.Fatalf("%s: nothing within %v (status %+v)", what, within, d.Status())
				return tagstore.TagUpdate{}
			}
		}
	}
	isGood := func(path string, v any) func(tagstore.TagUpdate) bool {
		return func(u tagstore.TagUpdate) bool {
			return u.Path == path && u.State.Quality == "Good" && u.State.Value == v
		}
	}

	if err := d.Write(context.Background(), "plant/a", 5); err != nil {
		t.Fatal(err)
	}
	waitFor("first value", isGood("plant/a", float64(5)), 2*time.Second)

	stop()
	u := waitFor("Bad on lost connection", func(u tagstore.TagUpdate) bool { return u.State.Quality == "Bad" }, 3*time.Second)
	if u.Path != "plant/a" || u.State.Value != float64(5) || !strings.Contains(u.State.Reason, "connection lost") {
		t.Errorf("got %+v, want plant/a Bad with its last value 5 and the reason", u)
	}
	if d.Status().Connected {
		t.Error("Status says connected while the broker is down")
	}

	stop = brokerAt(t, addr)
	deadline := time.Now().Add(15 * time.Second)
	for !d.Status().Connected {
		if time.Now().After(deadline) {
			t.Fatal("did not reconnect within 15 s")
		}
		time.Sleep(50 * time.Millisecond)
	}
	// Subscriptions are restored right after the connect; give them a moment.
	time.Sleep(300 * time.Millisecond)
	if err := d.Write(context.Background(), "plant/a", 7); err != nil {
		t.Fatal(err)
	}
	waitFor("exact topic after reconnect", isGood("plant/a", float64(7)), 3*time.Second)
	if err := d.Write(context.Background(), "plant/x/temp", 21); err != nil {
		t.Fatal(err)
	}
	waitFor("wildcard topic after reconnect", isGood("plant/x/temp", float64(21)), 3*time.Second)
	if st := d.Status(); st.LastError != "" {
		t.Errorf("LastError = %q after reconnect, want empty", st.LastError)
	}
}
