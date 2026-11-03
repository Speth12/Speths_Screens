package opcua

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/gopcua/opcua/ua"

	"github.com/Speth12/Speths_Screens/internal/drivers"
)

func endpoint(policy string, mode ua.MessageSecurityMode, level byte) *ua.EndpointDescription {
	return &ua.EndpointDescription{
		SecurityPolicyURI: ua.FormatSecurityPolicyURI(policy),
		SecurityMode:      mode,
		SecurityLevel:     level,
		ServerCertificate: []byte("server certificate"),
	}
}

// No fallback: a server that does not offer what the project asks for is an
// error, never a quiet drop to security None.
func TestChooseEndpoint(t *testing.T) {
	noneOnly := []*ua.EndpointDescription{endpoint("None", ua.MessageSecurityModeNone, 0)}
	both := []*ua.EndpointDescription{
		endpoint("None", ua.MessageSecurityModeNone, 0),
		endpoint("Basic256Sha256", ua.MessageSecurityModeSignAndEncrypt, 10),
		endpoint("Basic256Sha256", ua.MessageSecurityModeSign, 5),
	}
	tests := []struct {
		name         string
		eps          []*ua.EndpointDescription
		mode, policy string
		want         ua.MessageSecurityMode
		err          string
	}{
		{"unset mode wants SignAndEncrypt", both, "", "", ua.MessageSecurityModeSignAndEncrypt, ""},
		{"Sign", both, "Sign", "", ua.MessageSecurityModeSign, ""},
		{"None asked for", both, "None", "", ua.MessageSecurityModeNone, ""},
		{"None asked for, policy ignored", noneOnly, "None", "Basic256Sha256", ua.MessageSecurityModeNone, ""},
		{"unset mode, server offers None only", noneOnly, "", "", 0, "server does not offer Basic256Sha256 / SignAndEncrypt; set securityMode None"},
		{"Sign, server offers None only", noneOnly, "Sign", "Basic256Sha256", 0, "server does not offer Basic256Sha256 / Sign"},
		{"policy None with a secure mode", both, "Sign", "None", 0, "securityPolicy None needs securityMode None"},
		{"policy not offered", both, "SignAndEncrypt", "Basic128Rsa15", 0, "server does not offer Basic128Rsa15"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ep, err := chooseEndpoint(tc.eps, tc.mode, tc.policy)
			if tc.err != "" {
				if err == nil || !strings.Contains(err.Error(), tc.err) {
					t.Fatalf("err %v, want %q", err, tc.err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if ep.SecurityMode != tc.want {
				t.Errorf("chose %v, want %v", ep.SecurityMode, tc.want)
			}
		})
	}
}

func TestCheckServerCert(t *testing.T) {
	der := []byte("server certificate")
	right := drivers.Fingerprint(der)
	policy := func(mode, pin string) *drivers.CertPolicy {
		p, err := drivers.NewCertPolicy(mode, pin, drivers.CertOff)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	tests := []struct {
		name     string
		certs    *drivers.CertPolicy
		der      []byte
		certErr  bool
		otherErr bool
	}{
		{"off", policy("off", ""), der, false, false},
		{"pinned, right", policy("pinned", right), der, false, false},
		{"pinned, wrong", policy("pinned", drivers.Fingerprint([]byte("other"))), der, true, false},
		{"pinned, nothing pinned yet", policy("pinned", ""), der, true, false},
		{"pinned, no certificate", policy("pinned", right), nil, false, true},
		{"off, no certificate", policy("off", ""), nil, false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkServerCert(tc.certs, tc.der)
			var ce *drivers.CertError
			if got := errors.As(err, &ce); got != tc.certErr {
				t.Errorf("err %v: CertError=%v, want %v", err, got, tc.certErr)
			}
			if got := err != nil && ce == nil; got != tc.otherErr {
				t.Errorf("err %v: other error=%v, want %v", err, got, tc.otherErr)
			}
			if tc.der != nil && tc.certs.Seen() != right {
				t.Errorf("Seen() = %q, want %q", tc.certs.Seen(), right)
			}
		})
	}
}

func TestConnectRefusesCertCheckWithoutSecurity(t *testing.T) {
	tests := []struct {
		extra map[string]string
		ok    bool
	}{
		{map[string]string{"securityMode": "None", "certCheck": "pinned"}, false},
		{map[string]string{"securityMode": "None", "certCheck": "trusted"}, false},
		{map[string]string{"securityMode": "None", "certCheck": "off"}, true},
		{map[string]string{"securityMode": "SignAndEncrypt", "certCheck": "pinned"}, true},
		{map[string]string{"certCheck": "strict"}, false},
	}
	for _, tc := range tests {
		d := New()
		err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: "opc.tcp://127.0.0.1:1", Extra: tc.extra}, nil)
		_ = d.Disconnect()
		if (err == nil) != tc.ok {
			t.Errorf("Connect(%v): err %v, want ok=%v", tc.extra, err, tc.ok)
		}
	}
}
