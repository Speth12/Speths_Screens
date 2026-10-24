package rest

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestChunkVars(t *testing.T) {
	const base = "https://plc/_pxc_api/v1.14/variables"
	long := strings.Repeat("x", 300)
	tests := []struct {
		name   string
		vars   []string
		limit  int
		chunks int
	}{
		{"empty", nil, 2000, 0},
		{"fits in one", []string{"A", "B", "C"}, 2000, 1},
		{"split in two", []string{"Var01", "Var02", "Var03", "Var04"}, len(base) + 50, 2},
		{"one too long for the limit", []string{"A", long, "B"}, 200, 3},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := chunkVars(base, "Arp.Plc.Eclr/", tc.vars, tc.limit)
			if len(got) != tc.chunks {
				t.Fatalf("got %d chunks %v, want %d", len(got), got, tc.chunks)
			}
			var all []string
			for _, c := range got {
				if len(c) == 0 {
					t.Error("empty chunk")
				}
				all = append(all, c...)
			}
			if strings.Join(all, ",") != strings.Join(tc.vars, ",") {
				t.Errorf("chunks %v lose or reorder vars %v", got, tc.vars)
			}
		})
	}
}

// Every variable of a long path list is read, and no URL is over the limit.
func TestLongPathListIsSplit(t *testing.T) {
	tests := []struct {
		name  string
		vars  int
		limit int
	}{
		{"default limit", 400, 2000},
		{"small limit", 60, 300},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var mu sync.Mutex
			var urlLens []int
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/_pxc_api/v1.14/variables" {
					http.NotFound(w, r)
					return
				}
				mu.Lock()
				urlLens = append(urlLens, len(r.URL.RequestURI()))
				mu.Unlock()
				prefix := r.URL.Query().Get("pathPrefix")
				var vars []string
				for _, v := range strings.Split(r.URL.Query().Get("paths"), ",") {
					vars = append(vars, fmt.Sprintf(`{"path":%q,"value":1}`, prefix+v))
				}
				fmt.Fprintf(w, `{"variables":[%s]}`, strings.Join(vars, ","))
			}))
			defer srv.Close()

			ch := make(chan tagstore.TagUpdate, 1024)
			d := New()
			d.pollEvery = testPoll
			d.maxURL = tc.limit
			if err := d.Connect(context.Background(), drivers.DriverConfig{
				Endpoint: srv.URL,
				Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
			}, ch); err != nil {
				t.Fatal(err)
			}
			defer d.Disconnect()
			var paths []string
			for i := 0; i < tc.vars; i++ {
				paths = append(paths, fmt.Sprintf("Arp.Plc.Eclr/MainInstance.Variable_%04d", i))
			}
			if err := d.SetTags(paths); err != nil {
				t.Fatal(err)
			}
			good := map[string]bool{}
			deadline := time.After(3 * time.Second)
			for len(good) < len(paths) {
				select {
				case u := <-ch:
					if u.State.Quality == "Good" {
						good[u.Path] = true
					}
				case <-deadline:
					t.Fatalf("only %d of %d tags read Good", len(good), len(paths))
				}
			}
			mu.Lock()
			defer mu.Unlock()
			if len(urlLens) < 2 {
				t.Errorf("%d requests, want the list split", len(urlLens))
			}
			for _, n := range urlLens {
				if full := len(srv.URL) + n; full > tc.limit {
					t.Errorf("URL of %d bytes, limit %d", full, tc.limit)
				}
			}
		})
	}
}
