package api

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// wsSources returns, for each binding, how many WebSocket sources need it.
func wsSources(rt *runtime.Runtime) map[string]int {
	out := map[string]int{}
	for _, d := range rt.Demand() {
		for _, src := range d.Sources {
			if strings.HasPrefix(src, "ws:") {
				out[d.Binding]++
			}
		}
	}
	return out
}

// waitDemand waits until the WebSocket demand equals want.
func waitDemand(t *testing.T, rt *runtime.Runtime, want map[string]int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		got := wsSources(rt)
		if len(got) == len(want) {
			same := true
			for k, v := range want {
				same = same && got[k] == v
			}
			if same {
				return
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("WebSocket demand = %v, want %v", got, want)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func dialWS(t *testing.T, ctx context.Context, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(ctx, strings.Replace(url, "http://", "ws://", 1)+"/ws/tags", nil)
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	return conn
}

func send(t *testing.T, ctx context.Context, c *websocket.Conn, msg map[string][]string) {
	t.Helper()
	if err := wsjson.Write(ctx, c, msg); err != nil {
		t.Fatalf("Write: %v", err)
	}
}

func TestWebSocketSubscriptionsCreateDemand(t *testing.T) {
	_, rt, hs := newTestServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	a := dialWS(t, ctx, hs.URL)
	b := dialWS(t, ctx, hs.URL)
	defer b.Close(websocket.StatusNormalClosure, "")

	send(t, ctx, a, map[string][]string{"subscribe": {"plc:X", "plc:Y"}})
	send(t, ctx, b, map[string][]string{"subscribe": {"plc:Y"}})
	waitDemand(t, rt, map[string]int{"plc:X": 1, "plc:Y": 2})

	send(t, ctx, a, map[string][]string{"unsubscribe": {"plc:X"}})
	waitDemand(t, rt, map[string]int{"plc:Y": 2})

	_ = a.Close(websocket.StatusNormalClosure, "")
	waitDemand(t, rt, map[string]int{"plc:Y": 1})

	_ = b.Close(websocket.StatusNormalClosure, "")
	waitDemand(t, rt, map[string]int{})
}

func TestDebugDemandEndpoint(t *testing.T) {
	_, rt, hs := newTestServer(t)
	rt.AddDemand("ws:test", "plc:A")

	resp, err := http.Get(hs.URL + "/api/v1/debug/demand")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var got []runtime.TagDemand
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Binding != "plc:A" || got[0].Driver != "plc" ||
		got[0].Path != "A" || !slices.Equal(got[0].Sources, []string{"ws:test"}) {
		t.Errorf("got %+v", got)
	}
}
