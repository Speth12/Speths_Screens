package project

import (
	"encoding/json"
	"testing"
)

func TestTransformValueJSON(t *testing.T) {
	tests := []struct {
		in   string
		want any
	}{
		{`"#dc2626"`, "#dc2626"},
		{`""`, ""},
		{`80.5`, 80.5},
		{`-3`, -3.0},
		{`true`, true},
		{`false`, false},
	}
	for _, tc := range tests {
		t.Run(tc.in, func(t *testing.T) {
			var v TransformValue
			if err := json.Unmarshal([]byte(tc.in), &v); err != nil {
				t.Fatalf("Unmarshal: %v", err)
			}
			if v.Value() != tc.want {
				t.Fatalf("Value() = %#v, want %#v", v.Value(), tc.want)
			}
			out, err := json.Marshal(v)
			if err != nil || string(out) != tc.in {
				t.Errorf("Marshal = %s, %v; want %s", out, err, tc.in)
			}
		})
	}
	var v TransformValue
	if err := json.Unmarshal([]byte(`[1]`), &v); err == nil {
		t.Error("an array was accepted")
	}
}

// A project whose transforms hold text, numbers and flags loads, and writes
// them back unchanged.
func TestProjectWithTransformValuesRoundTrips(t *testing.T) {
	doc := []byte(`{"schemaVersion":3,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[
	  {"id":"w1","type":"led","x":0,"y":0,"w":1,"h":1,"dynamics":{
	    "bgColor":{"expr":"{plc:L}","transform":{"kind":"thresholds","steps":[{"above":80,"value":"#dc2626"}],"below":"#3f3f46"}},
	    "visible":{"expr":"{plc:M}","transform":{"kind":"map","cases":[{"equals":1,"value":true},{"equals":"off","value":false}],"default":true}},
	    "rotate":{"expr":"{plc:M}","transform":{"kind":"map","cases":[{"equals":true,"value":90}]}}}}]}]}`)
	p, err := Parse(doc)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	d := p.Pages[0].Widgets[0].Dynamics
	if got := d["bgColor"].Transform.Steps[0].Value.Value(); got != "#dc2626" {
		t.Errorf("step value %#v", got)
	}
	if got := d["visible"].Transform.Cases[1].Equals.Value(); got != "off" {
		t.Errorf("case equals %#v", got)
	}
	out, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Parse(out); err != nil {
		t.Errorf("written project does not load again: %v\n%s", err, out)
	}
}
