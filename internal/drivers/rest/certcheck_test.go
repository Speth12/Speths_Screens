package rest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// The certificate check runs before anything is sent: with the wrong pin the
// controller sees no request at all, so the login never leaves the runtime.
func TestCertCheck(t *testing.T) {
	f := &authPLC{valid: map[string]time.Time{}}
	var requests atomic.Int32
	f.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		f.serve(w, r)
	}))
	t.Cleanup(f.srv.Close)
	right := drivers.Fingerprint(f.srv.Certificate().Raw)
	other := drivers.Fingerprint([]byte("another controller"))

	tests := []struct {
		name   string
		extra  map[string]string
		online bool
		reason string
	}{
		{"unset skips the check, as before", nil, true, ""},
		{"off", map[string]string{"certCheck": "off"}, true, ""},
		{"pinned to this controller", map[string]string{"certCheck": "pinned", "certFingerprint": right}, true, ""},
		{"pinned to another controller", map[string]string{"certCheck": "pinned", "certFingerprint": other}, false, "certificate changed"},
		{"pinned, nothing pinned yet", map[string]string{"certCheck": "pinned"}, false, "certificate not pinned yet"},
		{"trusted: self-signed is refused", map[string]string{"certCheck": "trusted"}, false, "x509"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			requests.Store(0)
			extra := map[string]string{"basePath": "/_pxc_api"}
			for k, v := range tc.extra {
				extra[k] = v
			}
			d := New()
			d.pollEvery = testPoll
			d.backoffMin, d.backoffMax = 20*time.Millisecond, 80*time.Millisecond
			ch := make(chan tagstore.TagUpdate, 1024)
			cfg := drivers.DriverConfig{Endpoint: f.srv.URL, Username: fakeUser, Password: fakePass, Extra: extra}
			if err := d.Connect(context.Background(), cfg, ch); err != nil {
				t.Fatalf("Connect: %v", err)
			}
			defer d.Disconnect()

			deadline := time.Now().Add(3 * time.Second)
			for {
				st := d.Status()
				if tc.online && st.Connected {
					break
				}
				if !tc.online && st.LastError != "" {
					if !strings.Contains(st.LastError, tc.reason) {
						t.Errorf("reason %q, want it to mention %q", st.LastError, tc.reason)
					}
					if n := requests.Load(); n != 0 {
						t.Errorf("controller got %d requests through a refused certificate", n)
					}
					break
				}
				if time.Now().After(deadline) {
					t.Fatalf("status %+v after 3 s, want online=%v", st, tc.online)
				}
				time.Sleep(10 * time.Millisecond)
			}
			if tc.extra["certCheck"] != "trusted" {
				if got := d.Status().CertFingerprint; got != right {
					t.Errorf("CertFingerprint %q, want the controller's %q", got, right)
				}
			}
		})
	}
}

func TestCertCheckRejectsUnknownMode(t *testing.T) {
	d := New()
	err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "https://10.0.0.210", Extra: map[string]string{"certCheck": "strict"}}, nil)
	if err == nil {
		_ = d.Disconnect()
		t.Fatal("Connect accepted certCheck strict")
	}
}
