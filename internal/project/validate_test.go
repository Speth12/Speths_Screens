package project

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// widgetDoc is a current-format project with one page holding the given widgets (JSON).
func widgetDoc(widgets string) []byte {
	return []byte(`{"schemaVersion":6,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[` + widgets + `]}]}`)
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
		{"one bad setting among good ones",
			widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"props":{"min":0,"max":10,"unit":"bar","label":"P","momentary":true}}`),
			[]string{`page "Main", widget w1 (gauge): unknown setting momentary`}},
		{"two bad settings among good ones",
			widgetDoc(`{"id":"w1","type":"tank","x":0,"y":0,"w":2,"h":2,"props":{"min":0,"thresholds":[{"value":1,"color":"#fff"}],"step":1,"momentary":true}}`),
			[]string{`page "Main", widget w1 (tank): unknown setting step`, `page "Main", widget w1 (tank): unknown setting momentary`}},
		{"five bad settings, in document order",
			widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"props":{"zeta":1,"alpha":1,"min":0,"mid":1,"beta":1,"omega":1}}`),
			[]string{
				`page "Main", widget w1 (gauge): unknown setting zeta`, `page "Main", widget w1 (gauge): unknown setting alpha`,
				`page "Main", widget w1 (gauge): unknown setting mid`, `page "Main", widget w1 (gauge): unknown setting beta`,
				`page "Main", widget w1 (gauge): unknown setting omega`,
			}},
		{"driven properties",
			widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"dynamics":{"min":{"expr":"{ns:a}"},"bgColor":{"expr":"{ns:a}","transform":{"kind":"thresholds","steps":[{"above":80,"value":"#f00"}],"below":"#888"}}}}`), nil},
		{"a shape with its settings and a driven fill",
			widgetDoc(`{"id":"w1","type":"shape","x":0,"y":0,"w":120,"h":80,"props":{"kind":"line","direction":"down","stroke":"token:alarm-critical","weight":3,"dashed":true,"arrowEnd":true,"fill":"#336699","cornerRadius":4},"dynamics":{"fill":{"expr":"{ns:a} ? 'token:process-running' : '#888888'"},"stroke":{"expr":"'#000000'"}}}`), nil},
		{"a shape of a kind there is none of, and a setting it does not have",
			widgetDoc(`{"id":"w1","type":"shape","x":0,"y":0,"w":2,"h":2,"props":{"kind":"star","points":"0,0"}}`),
			[]string{`page "Main", widget w1 (shape): props.kind: value must be one of 'rectangle', 'ellipse', 'line'`, `page "Main", widget w1 (shape): unknown setting points`}},
		{"a shape cannot drive what it does not have",
			widgetDoc(`{"id":"w1","type":"shape","x":0,"y":0,"w":2,"h":2,"dynamics":{"flow":{"expr":"1"}}}`),
			[]string{`page "Main", widget w1 (shape): dynamics: cannot drive flow`}},
		{"a property the widget type cannot drive",
			widgetDoc(`{"id":"w1","type":"led","x":0,"y":0,"w":1,"h":1,"dynamics":{"min":{"expr":"1"},"bgColor":{"expr":"2"}}}`),
			[]string{`page "Main", widget w1 (led): dynamics: cannot drive min`}},
		{"a transform without its fields",
			widgetDoc(`{"id":"w1","type":"gauge","x":0,"y":0,"w":2,"h":2,"dynamics":{"rotate":{"expr":"1","transform":{"kind":"linear"}}}}`),
			[]string{`page "Main", widget w1 (gauge): dynamics.rotate.transform: missing properties 'in', 'out'`}},
		{"misspelt setting",
			widgetDoc(`{"id":"w1","type":"led","x":0,"y":0,"w":2,"h":2,"props":{"trueColour":"#fff"}}`),
			[]string{`page "Main", widget w1 (led): unknown setting trueColour`}},
		{"wrong value in a setting",
			widgetDoc(`{"id":"b","type":"button","x":0,"y":0,"w":2,"h":2,"props":{"btnColor":"pink"}}`),
			[]string{`page "Main", widget b (button): props.btnColor: value must be one of 'blue', 'green', 'red', 'amber', 'zinc', 'purple', 'orange', 'white'`}},
		{"unknown action",
			widgetDoc(`{"id":"b","type":"button","x":0,"y":0,"w":2,"h":2,"events":{"onClick":[{"type":"jump"}]}}`),
			[]string{`page "Main", widget b (button): events.onClick.0.type: value must be one of 'write', 'toggle', 'increment', 'navigate', 'openUrl'`}},
		{"v1 field in a current file",
			widgetDoc(`{"id":"w1","type":"led","x":0,"y":0,"w":2,"h":2,"binding":"plc:B"}`),
			[]string{`page "Main", widget w1 (led): unknown field binding`}},
		{"custom widget part",
			[]byte(`{"schemaVersion":6,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "customWidgets":[{"id":"fp","name":"Pump","params":[],"widgets":[{"localId":"s","type":"tank","x":0,"y":0,"w":1,"h":1,"props":{"step":1}}]}]}`),
			[]string{`custom widget "Pump", widget s (tank): unknown setting step`}},
		{"preset widget",
			[]byte(`{"schemaVersion":6,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "presets":[{"id":"ps","name":"Start/Stop","widgets":[{"id":"b","type":"button","x":0,"y":0,"w":1,"h":1,"props":{"min":1}}]}]}`),
			[]string{`preset "Start/Stop", widget b (button): unknown setting min`}},
		{"empty preset",
			[]byte(`{"schemaVersion":6,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "presets":[{"id":"ps","name":"Empty","widgets":[]}]}`),
			[]string{`/presets/0/widgets: minItems: got 0, want 1`}},
		{"calculated tags as a list",
			[]byte(`{"schemaVersion":6,"version":"1","pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "datasources":[{"id":"sim","type":"virtual","label":"Sim","config":{"tags":[{"path":"t","expr":"1 + 2"}]}}]}`),
			nil},
		{"calculated tags still as a JSON string",
			[]byte(`{"schemaVersion":6,"version":"1","pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "datasources":[{"id":"sim","type":"virtual","label":"Sim","config":{"tags":"[]"}}]}`),
			[]string{`/datasources/0/config/tags: got string, want array`}},
		{"calculated tag with the old formula field",
			[]byte(`{"schemaVersion":6,"version":"1","pages":[{"id":"p1","name":"Main","widgets":[]}],
			  "datasources":[{"id":"sim","type":"virtual","label":"Sim","config":{"tags":[{"path":"t","formula":"1"}]}}]}`),
			[]string{`/datasources/0/config/tags/0: missing property 'expr'`, `/datasources/0/config/tags/0: unknown field formula`}},
		{"outside a widget",
			[]byte(`{"schemaVersion":6,"version":"1","datasources":[],"pages":[]}`),
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
