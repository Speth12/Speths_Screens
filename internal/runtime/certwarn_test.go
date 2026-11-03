package runtime

import (
	"testing"

	"github.com/Speth12/Speths_Screens/internal/project"
)

func ds(id string, typ project.DatasourceType, endpoint string, check *project.CERTCheck, mode *project.SecurityMode) project.Datasource {
	return project.Datasource{ID: id, Label: id, Type: typ, Config: project.DatasourceConfig{Endpoint: &endpoint, CERTCheck: check, SecurityMode: mode}}
}

func TestCertWarnings(t *testing.T) {
	off, pinned, trusted := project.Off, project.Pinned, project.Trusted
	none, sae := project.SecurityModeNone, project.SignAndEncrypt
	tests := []struct {
		name string
		ds   project.Datasource
		warn bool
	}{
		{"REST https, unset", ds("a", project.REST, "https://10.0.0.210", nil, nil), true},
		{"REST https, off", ds("a", project.REST, "https://10.0.0.210", &off, nil), true},
		{"REST https, pinned", ds("a", project.REST, "https://10.0.0.210", &pinned, nil), false},
		{"REST http", ds("a", project.REST, "http://10.0.0.210", nil, nil), false},
		{"MQTT ssl, unset (trusted roots)", ds("a", project.Mqtt, "ssl://broker:8883", nil, nil), false},
		{"MQTT ssl, off", ds("a", project.Mqtt, "ssl://broker:8883", &off, nil), true},
		{"MQTT tcp, off", ds("a", project.Mqtt, "tcp://broker:1883", &off, nil), false},
		{"OPC UA secure, unset", ds("a", project.Opcua, "opc.tcp://plc:4840", nil, &sae), true},
		{"OPC UA secure, trusted", ds("a", project.Opcua, "opc.tcp://plc:4840", &trusted, &sae), false},
		{"OPC UA None", ds("a", project.Opcua, "opc.tcp://plc:4840", nil, &none), false},
	}
	for _, tc := range tests {
		got := len(certWarnings(&project.Project{Datasources: []project.Datasource{tc.ds}})) > 0
		if got != tc.warn {
			t.Errorf("%s: warning=%v, want %v", tc.name, got, tc.warn)
		}
	}
}

func TestBuildConfigPassesCertCheck(t *testing.T) {
	pinned := project.Pinned
	fp := "AB:CD"
	d := ds("a", project.REST, "https://10.0.0.210", &pinned, nil)
	d.Config.CERTFingerprint = &fp
	got := buildConfig(d).Extra
	want := map[string]string{"certCheck": "pinned", "certFingerprint": "AB:CD"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("Extra[%q] = %q, want %q (all: %v)", k, got[k], v, got)
		}
	}
	if _, ok := buildConfig(ds("b", project.REST, "https://x", nil, nil)).Extra["certCheck"]; ok {
		t.Error("certCheck set for a datasource without one")
	}
}
