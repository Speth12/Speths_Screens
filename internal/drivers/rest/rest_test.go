package rest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestSplitPath(t *testing.T) {
	cases := map[string][2]string{
		"a/b/c":   {"a/b/c", ""},
		"a/b#x.y": {"a/b", "x.y"},
		"plain":   {"plain", ""},
		"foo#":    {"foo", ""},
	}
	for in, want := range cases {
		gotURL, gotGJ := splitPath(in)
		if gotURL != want[0] || gotGJ != want[1] {
			t.Errorf("splitPath(%q)=(%q,%q) want (%q,%q)", in, gotURL, gotGJ, want[0], want[1])
		}
	}
}

func TestSubscribeAndPoll(t *testing.T) {
	var hits atomic.Int32
	var lastAuth string
	var mu sync.Mutex

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		mu.Lock()
		lastAuth = r.Header.Get("Authorization")
		mu.Unlock()
		switch r.URL.Path {
		case "/api/temp":
			fmt.Fprint(w, `{"value": 23.5}`)
		case "/api/multi":
			fmt.Fprint(w, `{"a": {"b": "ok"}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	ch := make(chan tagstore.TagUpdate, 32)
	d := New()
	d.pollEvery = 50 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := d.Connect(ctx, drivers.DriverConfig{
		Endpoint: srv.URL,
		Extra: map[string]string{
			"basePath":    "/api",
			"bearerToken": "test-token",
		},
	}, ch)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()

	if err := d.SetTags([]string{"temp", "multi#a.b"}); err != nil {
		t.Fatalf("SetTags: %v", err)
	}

	got := map[string]any{}
	deadline := time.After(1 * time.Second)
loop:
	for len(got) < 2 {
		select {
		case u := <-ch:
			got[u.Path] = u.State.Value
		case <-deadline:
			break loop
		}
	}

	if got["temp"] != 23.5 {
		t.Errorf("temp: got %v want 23.5", got["temp"])
	}
	if got["multi#a.b"] != "ok" {
		t.Errorf("multi#a.b: got %v want ok", got["multi#a.b"])
	}
	mu.Lock()
	if lastAuth != "Bearer test-token" {
		t.Errorf("auth header: got %q", lastAuth)
	}
	mu.Unlock()
}

func TestWritePUT(t *testing.T) {
	var receivedBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "want PUT", 400)
			return
		}
		body, _ := io.ReadAll(r.Body)
		receivedBody = strings.TrimSpace(string(body))
		w.WriteHeader(200)
	}))
	defer srv.Close()

	d := New()
	ctx := context.Background()
	if err := d.Connect(ctx, drivers.DriverConfig{Endpoint: srv.URL}, nil); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer d.Disconnect()

	if err := d.Write(ctx, "vars/X", 42); err != nil {
		t.Fatalf("Write: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(receivedBody), &parsed); err != nil {
		t.Fatalf("parse body %q: %v", receivedBody, err)
	}
	if parsed["value"].(float64) != 42 {
		t.Errorf("body: %v", parsed)
	}
}

// An unreachable endpoint: Connect still succeeds, the driver reports offline
// with a reason, and polled tags are Bad with that reason.
func TestStatusBadEndpoint(t *testing.T) {
	ch := make(chan tagstore.TagUpdate, 4)
	d := New()
	d.pollEvery = 50 * time.Millisecond
	d.backoffMin = 20 * time.Millisecond
	d.httpTimeout = 500 * time.Millisecond
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "http://127.0.0.1:1"}, ch); err != nil {
		t.Fatalf("Connect should not fail: %v", err)
	}
	defer d.Disconnect()

	if err := d.SetTags([]string{"x"}); err != nil {
		t.Fatalf("SetTags: %v", err)
	}
	select {
	case u := <-ch:
		if u.State.Quality != "Bad" || u.State.Reason == "" {
			t.Errorf("got quality %q reason %q, want Bad with a reason", u.State.Quality, u.State.Reason)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no Bad update within 5 s")
	}
	if st := d.Status(); st.Connected || st.LastError == "" {
		t.Errorf("Status = %+v, want Connected=false with LastError", st)
	}
}
