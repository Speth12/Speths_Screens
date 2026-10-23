// Package cert generates a self-signed X.509 certificate for OPC UA clients.
// The application URI must be embedded as a SAN — without it, OPC UA
// SignAndEncrypt connections are rejected by most servers.
package cert

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/url"
	"os"
	"time"
)

// Ensure generates cert/key files at the given paths if they do not already exist.
// appURI is embedded in the cert as a Subject Alternative Name.
func Ensure(certPath, keyPath, appURI, commonName string) error {
	if exists(certPath) && exists(keyPath) {
		return nil
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("rsa.GenerateKey: %w", err)
	}

	appURL, err := url.Parse(appURI)
	if err != nil {
		return fmt.Errorf("parse appURI %q: %w", appURI, err)
	}

	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().Unix()),
		Subject: pkix.Name{
			CommonName:   commonName,
			Organization: []string{"x-hmi"},
		},
		NotBefore: time.Now().Add(-time.Hour),
		NotAfter:  time.Now().Add(365 * 24 * time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature |
			x509.KeyUsageContentCommitment |
			x509.KeyUsageKeyEncipherment |
			x509.KeyUsageDataEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		URIs:                  []*url.URL{appURL},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("CreateCertificate: %w", err)
	}

	if err = writePEM(certPath, "CERTIFICATE", certDER); err != nil {
		return err
	}
	if err = writePEM(keyPath, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(key)); err != nil {
		return err
	}
	return nil
}

func writePEM(path, typ string, data []byte) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return pem.Encode(f, &pem.Block{Type: typ, Bytes: data})
}

func exists(path string) bool { _, err := os.Stat(path); return err == nil }
