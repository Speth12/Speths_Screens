package project

import (
	"encoding/json"
	"strings"
	"testing"
)

func sp(s string) *string { return &s }

func secretProject() *Project {
	return &Project{Version: "0.1.0", Datasources: []Datasource{
		{ID: "opcua", Type: Opcua, Config: DatasourceConfig{Endpoint: sp("opc.tcp://plc:4840"), Username: sp("hmi"), Password: sp("plc-pass")}},
		{ID: "rest", Type: REST, Config: DatasourceConfig{Endpoint: sp("https://plc"), BearerToken: sp("plc-token")}},
	}}
}

func TestRedactSecrets(t *testing.T) {
	p := secretProject()
	r := RedactSecrets(p)
	for _, ds := range r.Datasources {
		if ds.Config.Password != nil || ds.Config.BearerToken != nil {
			t.Errorf("%s still has a secret: %+v", ds.ID, ds.Config)
		}
	}
	if r.Datasources[0].Config.Username == nil || *r.Datasources[0].Config.Username != "hmi" {
		t.Error("the username was removed; only secrets should go")
	}
	if *p.Datasources[0].Config.Password != "plc-pass" || *p.Datasources[1].Config.BearerToken != "plc-token" {
		t.Error("RedactSecrets changed the original project")
	}
	if RedactSecrets(nil) != nil {
		t.Error("nil project")
	}
}

func TestKeepSecrets(t *testing.T) {
	tests := []struct {
		name      string
		next      DatasourceConfig
		id        string
		wantPass  *string
		wantToken *string
	}{
		{"blank password kept", DatasourceConfig{}, "opcua", sp("plc-pass"), nil},
		{"empty string kept", DatasourceConfig{Password: sp("")}, "opcua", sp("plc-pass"), nil},
		{"new password wins", DatasourceConfig{Password: sp("new-pass")}, "opcua", sp("new-pass"), nil},
		{"blank token kept", DatasourceConfig{}, "rest", nil, sp("plc-token")},
		{"new datasource gets nothing", DatasourceConfig{}, "other", nil, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			next := &Project{Datasources: []Datasource{{ID: tc.id, Config: tc.next}}}
			KeepSecrets(next, secretProject())
			c := next.Datasources[0].Config
			if !same(c.Password, tc.wantPass) || !same(c.BearerToken, tc.wantToken) {
				t.Errorf("password %v token %v, want %v %v", deref(c.Password), deref(c.BearerToken), deref(tc.wantPass), deref(tc.wantToken))
			}
		})
	}
}

func TestRedactSecretsJSON(t *testing.T) {
	raw, _ := json.Marshal(secretProject())
	out := string(RedactSecretsJSON(raw))
	if strings.Contains(out, "plc-pass") || strings.Contains(out, "plc-token") {
		t.Errorf("secrets left in %s", out)
	}
	if got := string(RedactSecretsJSON(json.RawMessage(`{"not":"a project"`))); got != "null" {
		t.Errorf("unparsable document gave %s, want null", got)
	}
}

func same(a, b *string) bool { return deref(a) == deref(b) && (a == nil) == (b == nil) }

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

// Users moved to the runtime (defect 9); project files that still list
// them keep loading and the list is ignored.
func TestProjectWithUsersStillLoads(t *testing.T) {
	doc := `{"version":"0.1.0","pages":[],"datasources":[],
	  "users":[{"id":"u1","name":"op","role":"operator","passwordHash":"$2a$10$abcdefghijklmnopqrstuv"}]}`
	p, err := Parse(json.RawMessage(doc))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	b, _ := json.Marshal(p)
	if strings.Contains(string(b), "passwordHash") {
		t.Errorf("users survived the round trip: %s", b)
	}
}
