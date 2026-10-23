package project

import (
	"encoding/json"
	"testing"
)

func TestParseMinimal(t *testing.T) {
	raw := `{
		"version": "0.1.0",
		"datasources": [],
		"pages": [{"id":"p1","name":"Main","widgets":[]}]
	}`
	p, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Version != "0.1.0" {
		t.Errorf("version: got %q want 0.1.0", p.Version)
	}
	if len(p.Pages) != 1 {
		t.Errorf("pages: got %d want 1", len(p.Pages))
	}
}

func TestParseMissingVersion(t *testing.T) {
	raw := `{"datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}]}`
	_, err := Parse([]byte(raw))
	if err == nil {
		t.Fatal("expected error for missing version")
	}
}

func TestParseNoPagesRejected(t *testing.T) {
	raw := `{"version":"0.1.0","datasources":[],"pages":[]}`
	_, err := Parse([]byte(raw))
	if err == nil {
		t.Fatal("expected error for empty pages")
	}
}

func TestParseDuplicateDatasourceID(t *testing.T) {
	raw := `{
		"version":"0.1.0",
		"datasources":[
			{"id":"opcua","type":"opcua","label":"OPC UA","config":{}},
			{"id":"opcua","type":"opcua","label":"OPC UA 2","config":{}}
		],
		"pages":[{"id":"p1","name":"Main","widgets":[]}]
	}`
	_, err := Parse([]byte(raw))
	if err == nil {
		t.Fatal("expected error for duplicate datasource id")
	}
}

func TestParseDatasourceConfig(t *testing.T) {
	ep := "opc.tcp://192.168.88.10:4840"
	raw, _ := json.Marshal(map[string]any{
		"version": "0.1.0",
		"datasources": []any{map[string]any{
			"id":    "opcua",
			"type":  "opcua",
			"label": "AXC OPC UA",
			"config": map[string]any{
				"endpoint":       ep,
				"securityMode":   "SignAndEncrypt",
				"securityPolicy": "Basic256Sha256",
			},
		}},
		"pages": []any{map[string]any{"id": "p1", "name": "Main", "widgets": []any{}}},
	})
	p, err := Parse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.Datasources) != 1 {
		t.Fatalf("datasources: got %d want 1", len(p.Datasources))
	}
	ds := p.Datasources[0]
	if ds.Config.Endpoint == nil || *ds.Config.Endpoint != ep {
		t.Errorf("endpoint: got %v want %q", ds.Config.Endpoint, ep)
	}
}

func TestParseWidget(t *testing.T) {
	raw := `{
		"version":"0.1.0",
		"datasources":[],
		"pages":[{
			"id":"p1","name":"Main",
			"widgets":[{
				"id":"w1","type":"gauge",
				"x":0,"y":0,"w":4,"h":3,
				"binding":"opcua:ns=2;s=PLCnext.iTest"
			}]
		}]
	}`
	p, err := Parse([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	w := p.Pages[0].Widgets[0]
	if w.Type != "gauge" {
		t.Errorf("type: got %q want gauge", w.Type)
	}
	if w.Binding == nil || *w.Binding != "opcua:ns=2;s=PLCnext.iTest" {
		t.Errorf("binding: got %v", w.Binding)
	}
}
