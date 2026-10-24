package project

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// widgetDoc is a v2 project with one page holding the given widgets (JSON).
func widgetDoc(widgets string) []byte {
	return []byte(`{"schemaVersion":2,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[` + widgets + `]}]}`)
}

func TestValidateJSON(t *testing.T) {
	tests := []struct {
		name string
		doc  []byte
		want []string // nil: valid
	}{
		{"valid widget", widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"props":{"min":0,"label":"T"},"bindings":{"value":"plc:T"}}`), nil},
		{"valid events", widgetDoc(`{"id":"b","type":"button","x":0,"y":0,"w":2,"h":2,"events":{"onPress":[{"type":"write","value":1}]}}`), nil},
		{"setting of another widget type",
			widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"props":{"momentary":true}}`),
			[]string{`page "Main", widget w1 (gauge): unknown setting momentary`}},
		{"misspelt setting",
			widgetDoc(`{"id":"w1","type":"led","x":0,"y":0,"w":2,"h":2,"props":{"trueColour":"#fff"}}`),
			[]string{`page "Main", widget w1 (led): unknown setting trueColour`}},
		{"wrong value in a setting",
			widgetDoc(`{"id":"b","type":"button","x":0,"y":0,"w":2,"h":2,"props":{"btnColor":"pink"}}`),
			[]string{`page "Main", widget b (button): props.btnColor: value must be one of 'blue', 'green', 'red', 'amber', 'zinc', 'purple', 'orange', 'white'`}},
		{"unknown action",
			widgetDoc(`{"id":"b","type":"button","x":0,"y":0,"w":2,"h":2,"events":{"onClick":[{"type":"jump"}]}}`),
			[]string{`page "Main", widget b (button): events.onClick.0.type: value must be one of 'write', 'toggle', 'increment', 'navigate', 'openUrl'`}},
		{"v1 field in a v2 file",
			widgetDoc(`{"id":"w1","type":"led","x":0,"y":0,"w":2,"h":2,"binding":"plc:B"}`),
			[]string{`page "Main", widget w1 (led): unknown field binding`}},
		{"faceplate widget",
			[]byte(`{"schemaVersion":2,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "faceplates":[{"id":"fp","name":"Pump","params":[],"widgets":[{"localId":"s","type":"tank","x":0,"y":0,"w":1,"h":1,"props":{"step":1}}]}]}`),
			[]string{`faceplate "Pump", widget s (tank): unknown setting step`}},
		{"outside a widget",
			[]byte(`{"schemaVersion":2,"version":"1","datasources":[],"pages":[]}`),
			[]string{`/pages: minItems: got 0, want 1`}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateJSON(tc.doc)
			if tc.want == nil {
				if err != nil {
					t.Fatalf("valid document refused: %v", err)
				}
				return
			}
			var se *SchemaError
			if !errors.As(err, &se) {
				t.Fatalf("err %v, want a SchemaError", err)
			}
			if !reflect.DeepEqual(se.Problems, tc.want) {
				t.Errorf("problems:\n%s\nwant:\n%s", strings.Join(se.Problems, "\n"), strings.Join(tc.want, "\n"))
			}
		})
	}
}

// Parse refuses a project that does not follow the schema, before decoding.
func TestParseRefusesInvalidProjects(t *testing.T) {
	_, err := Parse(widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"props":{"momentary":true}}`))
	if err == nil || !strings.Contains(err.Error(), "unknown setting momentary") {
		t.Fatalf("err %v, want the unknown setting", err)
	}
}
