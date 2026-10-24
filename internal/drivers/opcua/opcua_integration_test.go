package opcua

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// TestOPCUALive runs against a real OPC UA server. Skipped unless
// X_HMI_OPCUA_ENDPOINT is set, e.g.
//
//	X_HMI_OPCUA_ENDPOINT=opc.tcp://192.168.88.10:4840 go test -run TestOPCUALive ./internal/drivers/opcua/...
func TestOPCUALive(t *testing.T) {
	endpoint := os.Getenv("X_HMI_OPCUA_ENDPOINT")
	if endpoint == "" {
		t.Skip("set X_HMI_OPCUA_ENDPOINT to run live OPC UA test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	ch := make(chan tagstore.TagUpdate, 64)
	d := New()
	if err := d.Connect(ctx, drivers.DriverConfig{
		Endpoint: endpoint,
		Extra: map[string]string{
			"securityMode":   os.Getenv("X_HMI_OPCUA_MODE"),   // default SignAndEncrypt
			"securityPolicy": os.Getenv("X_HMI_OPCUA_POLICY"), // default Basic256Sha256
		},
	}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()
	// The driver connects in the background.
	for !d.Status().Connected {
		if ctx.Err() != nil {
			t.Fatalf("not connected: %+v", d.Status())
		}
		time.Sleep(50 * time.Millisecond)
	}

	defs, err := d.Browse(ctx)
	if err != nil {
		t.Fatalf("Browse: %v", err)
	}
	if len(defs) == 0 {
		t.Fatal("Browse returned 0 nodes")
	}
	t.Logf("discovered %d variable nodes", len(defs))

	// subscribe to first 5
	n := len(defs)
	if n > 5 {
		n = 5
	}
	paths := make([]string, n)
	for i := range n {
		paths[i] = defs[i].Path
	}

	if err := d.SetTags(paths); err != nil {
		t.Fatalf("SetTags: %v", err)
	}

	deadline := time.After(15 * time.Second)
	updates := 0
loop:
	for {
		select {
		case u := <-ch:
			updates++
			t.Logf("update %d: %s = %v (%s)", updates, u.Path, u.State.Value, u.State.Quality)
			if updates >= 5 {
				break loop
			}
		case <-deadline:
			break loop
		}
	}
	if updates == 0 {
		t.Fatal("received 0 updates in 15s")
	}
}
