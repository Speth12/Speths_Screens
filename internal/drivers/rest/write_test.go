package rest

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// The bodies below are what an AXC F 3152 (REST API v1.14) returned.
func TestPXCWriteReportsControllerErrors(t *testing.T) {
	const path = "Arp.Plc.Eclr/iREST_Write"
	tests := []struct {
		name    string
		status  int
		body    string
		wantErr string // empty: the write must succeed
	}{
		{"accepted", 200,
			`{"apiVersion":"1.14.0.0","variables":[{"path":"Arp.Plc.Eclr/iREST_Write","value":456}]}`, ""},
		{"accepted, empty body", 200, ``, ""},
		{"variable does not exist", 200,
			`{"apiVersion":"1.14.0.0","variables":[{"path":"Arp.Plc.Eclr/NoSuchVar","value":null,"error":{"domain":"variables","reason":"NotExists"}}]}`,
			"Arp.Plc.Eclr/NoSuchVar rejected: variables: NotExists"},
		{"error on the response", 200,
			`{"apiVersion":"1.14.0.0","error":{"code":400,"details":[{"domain":"protocol","reason":"invalidCommand"}]}}`,
			"rejected: protocol: invalidCommand"},
		{"HTTP error", 400,
			`{"error":{"code":400,"details":[{"domain":"protocol","reason":"invalidCommand"}]}}`,
			"status 400"},
		{"unreadable 200 body", 200, `<html>proxy error</html>`, "unreadable response"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var gotBody string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPut || r.URL.Path != "/_pxc_api/v1.14/variables" {
					http.NotFound(w, r)
					return
				}
				b, _ := io.ReadAll(r.Body)
				gotBody = string(b)
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer srv.Close()

			d := New()
			err := d.Connect(context.Background(), drivers.DriverConfig{
				Endpoint: srv.URL,
				Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
			}, make(chan tagstore.TagUpdate, 1))
			if err != nil {
				t.Fatalf("Connect: %v", err)
			}
			defer d.Disconnect()

			err = d.Write(context.Background(), path, 456)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("Write: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want it to contain %q", err, tc.wantErr)
			}
			if !strings.Contains(gotBody, `"path":"`+path+`"`) {
				t.Errorf("request body %s does not name %s", gotBody, path)
			}
		})
	}
}

// Each controller answer is marked with the kind the write pipeline uses.
func TestPXCWriteErrorKinds(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"variable does not exist", 200, `{"variables":[{"path":"X","error":{"domain":"variables","reason":"NotExists"}}]}`, drivers.ErrUnknownTag},
		{"wrong type", 200, `{"variables":[{"path":"X","error":{"domain":"variables","reason":"TypeMismatch"}}]}`, drivers.ErrBadValue},
		{"error on the response", 200, `{"error":{"code":400,"details":[{"domain":"protocol","reason":"invalidCommand"}]}}`, drivers.ErrRejected},
		{"HTTP error", 403, `forbidden`, drivers.ErrRejected},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer srv.Close()
			d := New()
			if err := d.Connect(context.Background(), drivers.DriverConfig{
				Endpoint: srv.URL,
				Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
			}, make(chan tagstore.TagUpdate, 1)); err != nil {
				t.Fatal(err)
			}
			defer d.Disconnect()
			err := d.Write(context.Background(), "Arp.Plc.Eclr/X", 1)
			if !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want it marked %v", err, tc.want)
			}
		})
	}
}

func TestWriteToUnreachableControllerIsNotConnected(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()
	d := New()
	d.backoffMin = time.Hour // stay "starting": the write itself must fail
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: "http://" + addr,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14"},
	}, make(chan tagstore.TagUpdate, 1)); err != nil {
		t.Fatal(err)
	}
	defer d.Disconnect()
	if err := d.Write(context.Background(), "Arp.Plc.Eclr/X", 1); !errors.Is(err, drivers.ErrNotConnected) {
		t.Errorf("err = %v, want it marked not connected", err)
	}
}
