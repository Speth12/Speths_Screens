package mqtt

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"math/big"
	"net"
	"strings"
	"testing"
	"time"

	mochi "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"

	"github.com/Speth12/Speths_Screens/internal/drivers"
)

// selfSigned makes a throwaway certificate for 127.0.0.1; nothing is saved.
func selfSigned(t *testing.T) tls.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IPAddresses:  []net.IP{net.IPv4(127, 0, 0, 1)},
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}

func TestCertCheck(t *testing.T) {
	cert := selfSigned(t)
	right := drivers.Fingerprint(cert.Certificate[0])
	other := drivers.Fingerprint([]byte("another broker"))
	addr := deadAddr(t)
	server := mochi.New(nil)
	if err := server.AddHook(new(auth.AllowHook), nil); err != nil {
		t.Fatal(err)
	}
	tlsCfg := &tls.Config{Certificates: []tls.Certificate{cert}}
	if err := server.AddListener(listeners.NewTCP(listeners.Config{ID: "tls", Address: addr, TLSConfig: tlsCfg})); err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.Serve() }()
	t.Cleanup(func() { _ = server.Close() })
	if !waitDial(addr, 2*time.Second) {
		t.Fatal("broker did not start")
	}

	tests := []struct {
		name   string
		extra  map[string]string
		online bool
		reason string
	}{
		{"unset checks trusted roots, as before", nil, false, "x509"},
		{"pinned to this broker", map[string]string{"certCheck": "pinned", "certFingerprint": right}, true, ""},
		{"pinned to another broker", map[string]string{"certCheck": "pinned", "certFingerprint": other}, false, "certificate changed"},
		{"off", map[string]string{"certCheck": "off"}, true, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			d := fastRetry()
			cfg := drivers.DriverConfig{Endpoint: "ssl://" + addr, Extra: tc.extra}
			if err := d.Connect(context.Background(), cfg, nil); err != nil {
				t.Fatalf("Connect: %v", err)
			}
			defer d.Disconnect()
			deadline := time.Now().Add(5 * time.Second)
			for {
				st := d.Status()
				if tc.online && st.Connected {
					break
				}
				if !tc.online && st.LastError != "" {
					if !strings.Contains(st.LastError, tc.reason) {
						t.Errorf("reason %q, want it to mention %q", st.LastError, tc.reason)
					}
					if n := server.Clients.Len(); n != 0 {
						t.Errorf("broker has %d clients through a refused certificate", n)
					}
					break
				}
				if time.Now().After(deadline) {
					t.Fatalf("status %+v after 5 s, want online=%v", st, tc.online)
				}
				time.Sleep(10 * time.Millisecond)
			}
			if tc.extra != nil {
				if got := d.Status().CertFingerprint; got != right {
					t.Errorf("CertFingerprint %q, want the broker's %q", got, right)
				}
			}
		})
	}
}
