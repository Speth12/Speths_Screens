package cert

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func read(t *testing.T, path string) *x509.Certificate {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode(b)
	if block == nil {
		t.Fatalf("%s is not PEM", path)
	}
	c, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestEnsureGeneratesWithTheGivenNames(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem")
	if err := Ensure(certPath, keyPath, "urn:speths-screens:runtime", "Speth's Screens runtime"); err != nil {
		t.Fatal(err)
	}
	c := read(t, certPath)
	if c.Subject.CommonName != "Speth's Screens runtime" {
		t.Errorf("common name %q", c.Subject.CommonName)
	}
	if len(c.Subject.Organization) != 1 || c.Subject.Organization[0] != "Speth's Screens" {
		t.Errorf("organization %v", c.Subject.Organization)
	}
	if len(c.URIs) == 0 || c.URIs[0].String() != "urn:speths-screens:runtime" {
		t.Errorf("application URI %v, want it first among the SANs", c.URIs)
	}
}

// A controller trusts the certificate it was shown; a certificate that exists must never be remade or
// edited, or the trust, and the application URI the library sends from its first SAN, would change.
func TestEnsureLeavesAnExistingCertificateAlone(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem")
	// A certificate made before the rename, with the old names.
	if err := Ensure(certPath, keyPath, "urn:x-hmi:runtime", "x-hmi runtime"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(certPath)
	keyBefore, _ := os.ReadFile(keyPath)

	if err := Ensure(certPath, keyPath, "urn:speths-screens:runtime", "Speth's Screens runtime"); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(certPath)
	keyAfter, _ := os.ReadFile(keyPath)
	if string(before) != string(after) || string(keyBefore) != string(keyAfter) {
		t.Fatal("an existing certificate or key was rewritten")
	}
	c := read(t, certPath)
	if c.Subject.CommonName != "x-hmi runtime" || c.URIs[0].String() != "urn:x-hmi:runtime" {
		t.Errorf("the existing certificate lost its names: %q %v", c.Subject.CommonName, c.URIs)
	}
}

func TestEnsureGeneratesAgainWhenOnlyOneFileIsLeft(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem")
	if err := Ensure(certPath, keyPath, "urn:x-hmi:runtime", "x-hmi runtime"); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(keyPath); err != nil {
		t.Fatal(err)
	}
	if err := Ensure(certPath, keyPath, "urn:speths-screens:runtime", "Speth's Screens runtime"); err != nil {
		t.Fatal(err)
	}
	if c := read(t, certPath); c.URIs[0].String() != "urn:speths-screens:runtime" {
		t.Errorf("a pair with a missing file is replaced by a new pair: %v", c.URIs)
	}
}

func TestEnsureRefusesAnApplicationURIItCannotParse(t *testing.T) {
	dir := t.TempDir()
	if err := Ensure(filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem"), "://bad", "x"); err == nil {
		t.Error("want an error for an unparsable application URI")
	}
}
