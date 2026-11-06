package project

import (
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// goldenExpressionProblems are the expression problems in each current
// golden file; the IDE's tests hold the same list.
var goldenExpressionProblems = map[string][]string{
	"all-rules":   nil,
	"demo":        nil,
	"example":     nil,
	"dan-project": nil,
	"calc-tags":   {`datasource "sim", calculated tag pick: unknown function if at column 1`},
	"alarms":      nil,
	"dynamics":    {`page "Main", widget bad (led): dynamics.borderColor: unexpected "." at column 9`},
}

func TestExpressionProblemsInGoldenFiles(t *testing.T) {
	files, _ := filepath.Glob(fmt.Sprintf("../../testdata/upgrade/*.v%d.json", CurrentSchemaVersion))
	if len(files) != len(goldenExpressionProblems) {
		t.Fatalf("%d golden files, want %d", len(files), len(goldenExpressionProblems))
	}
	for _, f := range files {
		name := strings.TrimSuffix(filepath.Base(f), fmt.Sprintf(".v%d.json", CurrentSchemaVersion))
		t.Run(name, func(t *testing.T) {
			_, _, err := ParseNotes(read(t, f))
			want := goldenExpressionProblems[name]
			var ee *ExpressionError
			switch {
			case want == nil && err != nil:
				t.Fatalf("Parse: %v", err)
			case want != nil && !errors.As(err, &ee):
				t.Fatalf("Parse error %v, want expression problems", err)
			case want != nil && !reflect.DeepEqual(ee.Problems, want):
				t.Errorf("problems:\n%s\nwant:\n%s", strings.Join(ee.Problems, "\n"), strings.Join(want, "\n"))
			}
		})
	}
}

func TestExpressionProblems(t *testing.T) {
	tests := []struct {
		name string
		p    Project
		want []string
	}{
		{"all fine", Project{
			Datasources: []Datasource{{ID: "sim", Config: DatasourceConfig{Tags: []CalculatedTag{{Path: "a", Expr: "1 + {plc:X}"}}}}},
			Pages:       []Page{{Name: "Main", Widgets: []Widget{{ID: "w1", Type: Gauge, Dynamics: map[string]Drive{"bgColor": {Expr: "value > 5 ? 'red' : 'grey'"}}}}}},
		}, nil},
		{"by property name", Project{
			Pages: []Page{{Name: "Main", Widgets: []Widget{{ID: "w1", Type: Gauge, Dynamics: map[string]Drive{
				"textColor": {Expr: "1 +"}, "bgColor": {Expr: "avrg(1)"}, "visible": {Expr: "true"},
			}}}}},
		}, []string{
			`page "Main", widget w1 (gauge): dynamics.bgColor: unknown function avrg at column 1`,
			`page "Main", widget w1 (gauge): dynamics.textColor: unexpected end of expression`,
		}},
		{"a parameter outside a custom widget", Project{
			Pages: []Page{{Name: "Main", Widgets: []Widget{{ID: "w1", Type: LED, Dynamics: map[string]Drive{"blink": {Expr: "{run}"}}}}}},
		}, []string{`page "Main", widget w1 (led): dynamics.blink: not a tag: {run} (tags are written {ns:path} or {datasource:path}) at column 1`}},
		{"custom widget templates", Project{
			CustomWidgets: []CustomWidgetElement{{Name: "Pump", Params: []CustomWidgetParam{{Name: "run"}}, Widgets: []CustomWidgetPart{
				{LocalID: "a", Type: LED, Dynamics: map[string]Drive{"blink": {Expr: "{run} && {ns:Auto}"}}},
				{LocalID: "b", Type: LED, Dynamics: map[string]Drive{"blink": {Expr: "{speed} > 1"}}},
				{LocalID: "c", Type: LED, Dynamics: map[string]Drive{"blink": {Expr: "{run} +"}}},
			}}},
		}, []string{
			`custom widget "Pump", widget b (led): dynamics.blink: {speed} is not a parameter of this custom widget`,
			`custom widget "Pump", widget c (led): dynamics.blink: unexpected end of expression`,
		}},
		{"presets", Project{
			Presets: []Preset{{Name: "Lamp", Widgets: []Widget{{ID: "w", Type: LED, Dynamics: map[string]Drive{"visible": {Expr: "=1"}}}}}},
		}, []string{`preset "Lamp", widget w (led): dynamics.visible: unexpected "=" at column 1`}},
		{"calculated tags", Project{
			Datasources: []Datasource{{ID: "sim", Label: "Sim", Config: DatasourceConfig{Tags: []CalculatedTag{{Path: "x", Expr: "if(1, 2, 3)"}}}}},
		}, []string{`datasource "sim", calculated tag x: unknown function if at column 1`}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ExpressionProblems(&tc.p); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(tc.want, "\n"))
			}
		})
	}
}
