package project

import "encoding/json"

// RedactSecrets returns a copy of p without datasource passwords and bearer
// tokens, for anything that leaves the runtime (GET /project, version
// history, the MCP server). p is not changed.
func RedactSecrets(p *Project) *Project {
	if p == nil {
		return nil
	}
	cp := *p
	cp.Datasources = make([]Datasource, len(p.Datasources))
	for i, ds := range p.Datasources {
		ds.Config.Password = nil
		ds.Config.BearerToken = nil
		cp.Datasources[i] = ds
	}
	return &cp
}

// KeepSecrets fills each datasource password and bearer token that next
// leaves empty from the datasource with the same id in prev, so a project
// read back without secrets can be deployed again.
func KeepSecrets(next, prev *Project) {
	if next == nil || prev == nil {
		return
	}
	old := map[string]DatasourceConfig{}
	for _, ds := range prev.Datasources {
		old[ds.ID] = ds.Config
	}
	for i := range next.Datasources {
		c := &next.Datasources[i].Config
		o, ok := old[next.Datasources[i].ID]
		if !ok {
			continue
		}
		if empty(c.Password) {
			c.Password = o.Password
		}
		if empty(c.BearerToken) {
			c.BearerToken = o.BearerToken
		}
	}
}

// RedactSecretsJSON redacts a stored project document; a document that does
// not parse as a project is returned as null rather than risk leaking it.
func RedactSecretsJSON(raw json.RawMessage) json.RawMessage {
	p, err := Parse(raw)
	if err != nil {
		return json.RawMessage("null")
	}
	b, err := json.Marshal(RedactSecrets(p))
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}

func empty(s *string) bool { return s == nil || *s == "" }
