package drivers

import (
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestFingerprintFormat(t *testing.T) {
	fp := Fingerprint([]byte("cert"))
	if len(fp) != 32*3-1 || strings.ToUpper(fp) != fp || strings.Count(fp, ":") != 31 {
		t.Fatalf("Fingerprint = %q, want 32 upper-case hex pairs joined by colons", fp)
	}
	for _, in := range []string{fp, strings.ToLower(fp), strings.ReplaceAll(fp, ":", ""), strings.ReplaceAll(fp, ":", " ")} {
		if got := NormalizeFingerprint(in); got != fp {
			t.Errorf("NormalizeFingerprint(%q) = %q, want %q", in, got, fp)
		}
	}
}

func TestNewCertPolicy(t *testing.T) {
	tests := []struct {
		mode, dflt, want string
		ok               bool
	}{
		{"", CertOff, CertOff, true},
		{"", CertTrusted, CertTrusted, true},
		{"pinned", CertOff, CertPinned, true},
		{"strict", CertOff, "", false},
	}
	for _, tc := range tests {
		p, err := NewCertPolicy(tc.mode, "", tc.dflt)
		if (err == nil) != tc.ok {
			t.Errorf("NewCertPolicy(%q): err %v, want ok=%v", tc.mode, err, tc.ok)
			continue
		}
		if tc.ok && p.Mode() != tc.want {
			t.Errorf("NewCertPolicy(%q, default %q).Mode() = %q, want %q", tc.mode, tc.dflt, p.Mode(), tc.want)
		}
	}
}

// Each policy against a real TLS server with a throwaway self-signed
// certificate.
func TestCertPolicyTLS(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { hits.Add(1) }))
	defer srv.Close()
	right := Fingerprint(srv.Certificate().Raw)
	other := Fingerprint([]byte("another device"))
	serverPool := x509.NewCertPool()
	serverPool.AddCert(srv.Certificate())

	tests := []struct {
		name    string
		mode    string
		pin     string
		roots   *x509.CertPool
		reason  string // "" = request goes through
		reaches bool
	}{
		{"off accepts anything", CertOff, "", nil, "", true},
		{"pinned to this certificate", CertPinned, strings.ToLower(right), nil, "", true},
		{"pinned to another certificate", CertPinned, other, nil, "certificate changed (expected " + other[:11] + "…, got " + right[:11] + "…)", false},
		{"pinned but nothing pinned yet", CertPinned, "", nil, "certificate not pinned yet", false},
		{"trusted by the given roots", CertTrusted, "", serverPool, "", true},
		{"not trusted", CertTrusted, "", x509.NewCertPool(), "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			hits.Store(0)
			p, err := NewCertPolicy(tc.mode, tc.pin, CertOff)
			if err != nil {
				t.Fatal(err)
			}
			p.roots = tc.roots
			c := &http.Client{Transport: &http.Transport{TLSClientConfig: p.TLSConfig()}}
			resp, err := c.Get(srv.URL)
			if resp != nil {
				resp.Body.Close()
			}
			if (err == nil) != tc.reaches || (hits.Load() > 0) != tc.reaches {
				t.Fatalf("err %v, server hit %d times; want reaches=%v", err, hits.Load(), tc.reaches)
			}
			if tc.reason != "" {
				var ce *CertError
				if !errors.As(err, &ce) {
					t.Fatalf("err %v is not a CertError", err)
				}
				if r, ok := NetReason("10.0.0.210", err); !ok || !strings.HasPrefix(r, tc.reason) {
					t.Errorf("reason %q, want it to start with %q", r, tc.reason)
				}
			}
			if tc.mode != CertTrusted || tc.reaches {
				if got := p.Seen(); got != right {
					t.Errorf("Seen() = %q, want the server's %q", got, right)
				}
			}
		})
	}
}
