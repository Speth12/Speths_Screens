package api

import (
	"context"
	goruntime "runtime"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/Speth12/Speths_Screens/internal/alarms"
	"github.com/Speth12/Speths_Screens/internal/eventbus"
)

func dialPath(t *testing.T, base, path string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, strings.Replace(base, "http://", "ws://", 1)+path, nil)
	if err != nil {
		t.Fatalf("Dial %s: %v", path, err)
	}
	return conn
}

// readUntil reads messages until ok returns true, or fails after 5 s.
func readUntil(t *testing.T, conn *websocket.Conn, ok func(map[string]any) bool) []map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var seen []map[string]any
	for {
		var m map[string]any
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			t.Fatalf("after %d messages: %v", len(seen), err)
		}
		seen = append(seen, m)
		if ok(m) {
			return seen
		}
	}
}

// A client that falls behind on /ws/alarms gets {"resync": true} and the
// full current state, never a silently shortened list.
func TestAlarmWebSocketResyncs(t *testing.T) {
	old := alarms.DefaultQueue
	alarms.DefaultQueue = 2
	t.Cleanup(func() { alarms.DefaultQueue = old })

	_, rt, hs := newTestServer(t)
	rt.Alarms.SetRules([]alarms.Rule{{ID: "r1", Name: "High", Binding: "plc:T", Condition: alarms.CondGT, Threshold: 100, Severity: alarms.SeverityWarning}})
	conn := dialPath(t, hs.URL, "/ws/alarms")
	defer conn.CloseNow()
	time.Sleep(50 * time.Millisecond) // subscribed

	for i := range 3000 { // far faster than the socket can carry
		rt.Alarms.Evaluate("plc:T", float64(90+20*(i%2)))
	}
	want := rt.Alarms.Events()[0]

	readUntil(t, conn, func(m map[string]any) bool { return m["resync"] == true })
	// After the resync the client ends on the engine's current state.
	readUntil(t, conn, func(m map[string]any) bool {
		return m["id"] == want.ID && m["active"] == want.Active && m["value"] == want.Value
	})
}

// A client that falls behind on /ws/events learns how many events it missed.
func TestEventWebSocketReportsOverflow(t *testing.T) {
	old := eventbus.DefaultQueue
	eventbus.DefaultQueue = 2
	t.Cleanup(func() { eventbus.DefaultQueue = old })

	_, rt, hs := newTestServer(t)
	conn := dialPath(t, hs.URL, "/ws/events")
	defer conn.CloseNow()
	time.Sleep(50 * time.Millisecond)

	for i := range 3000 {
		rt.Events.Publish(eventbus.Event{Type: eventbus.EventTagChanged, Target: "T", Payload: i})
	}
	seen := readUntil(t, conn, func(m map[string]any) bool { return m["type"] == "overflow" })
	last := seen[len(seen)-1]
	if p, _ := last["payload"].(map[string]any); p == nil || p["dropped"].(float64) <= 0 {
		t.Errorf("overflow notice without a count: %v", last)
	}
	// The newest event still arrives.
	readUntil(t, conn, func(m map[string]any) bool { return m["payload"] == float64(2999) })
}

// Both endpoints read from the client, so a clean close is answered at once
// (it used to wait for the 5 s timeout).
func TestAlarmAndEventWebSocketsCloseCleanly(t *testing.T) {
	_, _, hs := newTestServer(t)
	for _, path := range []string{"/ws/alarms", "/ws/events"} {
		conn := dialPath(t, hs.URL, path)
		start := time.Now()
		if err := conn.Close(websocket.StatusNormalClosure, "bye"); err != nil {
			t.Errorf("%s: close: %v", path, err)
		}
		if el := time.Since(start); el > time.Second {
			t.Errorf("%s: close took %v", path, el)
		}
	}
}

// /ws/events used to leak goroutines on every connection.
func TestEventWebSocketDoesNotLeakGoroutines(t *testing.T) {
	_, _, hs := newTestServer(t)
	open := func() {
		conn := dialPath(t, hs.URL, "/ws/events")
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}
	open() // warm up the HTTP server's own goroutines
	time.Sleep(100 * time.Millisecond)
	before := goruntime.NumGoroutine()
	for range 20 {
		open()
	}
	deadline := time.Now().Add(2 * time.Second)
	for goruntime.NumGoroutine() > before+3 {
		if time.Now().After(deadline) {
			t.Fatalf("goroutines: %d before 20 connections, %d after", before, goruntime.NumGoroutine())
		}
		time.Sleep(20 * time.Millisecond)
	}
}
