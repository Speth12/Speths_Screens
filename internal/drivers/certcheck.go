package drivers

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"strings"
	"sync/atomic"
)

// How a driver checks the server's certificate (a datasource's certCheck).
const (
	CertOff     = "off"     // accept any certificate
	CertPinned  = "pinned"  // accept only the certificate with the pinned fingerprint
	CertTrusted = "trusted" // accept certificates the system trusts
)

// CertError is a certificate the check refused. Want is empty when nothing
// is pinned yet.
type CertError struct {
	Want, Got string
}

func (e *CertError) Error() string {
	if e.Want == "" {
		return fmt.Sprintf("certificate not pinned yet (the server presents %s); test the datasource in the IDE to pin it", shortPrint(e.Got))
	}
	return fmt.Sprintf("certificate changed (expected %s, got %s)", shortPrint(e.Want), shortPrint(e.Got))
}

// Fingerprint is the SHA-256 of a DER certificate, as upper-case hex pairs
// joined by colons.
func Fingerprint(der []byte) string {
	sum := sha256.Sum256(der)
	return colons(hex.EncodeToString(sum[:]))
}

// NormalizeFingerprint accepts a fingerprint with or without colons or
// spaces, in either case, and returns it as Fingerprint writes it.
func NormalizeFingerprint(s string) string {
	s = strings.NewReplacer(":", "", " ", "", "-", "").Replace(s)
	return colons(s)
}

func colons(h string) string {
	h = strings.ToUpper(h)
	var b strings.Builder
	for i := 0; i < len(h); i += 2 {
		if i > 0 {
			b.WriteByte(':')
		}
		b.WriteString(h[i:min(i+2, len(h))])
	}
	return b.String()
}

// shortPrint is the first four bytes, enough to tell certificates apart.
func shortPrint(fp string) string {
	if len(fp) > 11 {
		return fp[:11] + "…"
	}
	return fp
}

// CertPolicy checks server certificates for one datasource and remembers
// the last one it saw, so the IDE can show it and pin it.
type CertPolicy struct {
	mode  string
	pin   string
	roots *x509.CertPool // nil: the system's; set in tests
	seen  atomic.Pointer[string]
}

// NewCertPolicy builds the policy for a datasource. An empty mode uses dflt,
// the driver's behavior before the setting existed.
func NewCertPolicy(mode, pin, dflt string) (*CertPolicy, error) {
	if mode == "" {
		mode = dflt
	}
	switch mode {
	case CertOff, CertPinned, CertTrusted:
	default:
		return nil, fmt.Errorf("certCheck %q is not off, pinned or trusted", mode)
	}
	p := &CertPolicy{mode: mode}
	if pin != "" {
		p.pin = NormalizeFingerprint(pin)
	}
	return p, nil
}

// Mode returns off, pinned or trusted.
func (p *CertPolicy) Mode() string { return p.mode }

// Seen returns the fingerprint of the last certificate the server presented.
func (p *CertPolicy) Seen() string {
	if s := p.seen.Load(); s != nil {
		return *s
	}
	return ""
}

// Check records der and checks it. Drivers that see the certificate outside
// a TLS handshake (OPC UA) call it directly.
func (p *CertPolicy) Check(der []byte) error {
	fp := Fingerprint(der)
	p.seen.Store(&fp)
	switch p.mode {
	case CertPinned:
		if fp != p.pin {
			return &CertError{Want: p.pin, Got: fp}
		}
	case CertTrusted:
		cert, err := x509.ParseCertificate(der)
		if err != nil {
			return fmt.Errorf("server certificate: %w", err)
		}
		if _, err := cert.Verify(x509.VerifyOptions{Roots: p.roots, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}}); err != nil {
			return fmt.Errorf("server certificate not trusted: %w", err)
		}
	}
	return nil
}

// TLSConfig returns the client TLS settings for the policy. Off and pinned
// skip Go's own verification and use Check instead; trusted keeps Go's
// verification, including the host name.
func (p *CertPolicy) TLSConfig() *tls.Config {
	record := func(rawCerts [][]byte) {
		if len(rawCerts) > 0 {
			fp := Fingerprint(rawCerts[0])
			p.seen.Store(&fp)
		}
	}
	if p.mode == CertTrusted {
		return &tls.Config{RootCAs: p.roots, VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			record(raw)
			return nil
		}}
	}
	return &tls.Config{
		InsecureSkipVerify: true, //nolint:gosec // checked by VerifyPeerCertificate (pinned) or explicitly off
		VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			if len(raw) == 0 {
				return fmt.Errorf("server sent no certificate")
			}
			return p.Check(raw[0])
		},
	}
}
