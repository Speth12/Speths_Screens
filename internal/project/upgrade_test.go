package project

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// upgradeNotes are the notes for upgrading each golden file, keyed by
// <name>.v<version>; the TypeScript upgrader's tests hold the same list.
var upgradeNotes = func() map[string][]string {
	v1ToV2 := map[string][]string{
		"all-rules": {
			`dropped the project's users list: users live on the runtime`,
			`page "Main", widget g1 (gauge): dropped setting decimals, which no widget reads`,
			`page "Main", widget g1 (gauge): dropped setting momentary, which this widget type does not have`,
			`page "Main", widget b3 (button): dropped setting min, which this widget type does not have`,
			`page "Main", widget i2 (image): dropped setting placeholder, which no widget reads`,
			`page "Main", widget n1 (numericDisplay): dropped a writeValue action without a tag to write`,
		},
		"demo":        {`page "Control Panel", widget c-text-in (textInput): dropped setting placeholder, which no widget reads`},
		"example":     {`page "PLC Demo", widget w-numeric (numericDisplay): dropped setting decimals, which no widget reads`, `page "PLC Demo", widget w-textinput (textInput): dropped setting placeholder, which no widget reads`},
		"dan-project": {`page "PLC Demo", widget w-numeric (numericDisplay): dropped setting decimals, which no widget reads`, `page "PLC Demo", widget w-textinput (textInput): dropped setting placeholder, which no widget reads`},
	}
	v2ToV3 := map[string][]string{
		"all-rules":   nil,
		"demo":        {`datasource "sim", calculated tag phase reads itself, so it stays Bad until it has a value; start it with (good({sim:phase}) ? {sim:phase} : 0)`},
		"example":     nil,
		"dan-project": nil,
		"calc-tags": {
			`datasource "sim", calculated tag absFlow: rewrote Math.abs({mb:Flow}) + Math.max(1, 2) as abs({mb:Flow}) + max(1, 2)`,
			`datasource "sim", calculated tag label: rewrote {mb:Flow}.toFixed(1) + ' m3/h' as format({mb:Flow}, 1) + ' m3/h'`,
			`datasource "sim", calculated tag isRun: rewrote {mb:State} === 1 as {mb:State} == 1`,
			`datasource "sim", calculated tag phase reads itself, so it stays Bad until it has a value; start it with (good({sim:phase}) ? {sim:phase} : 0)`,
			`datasource "sim", calculated tag pick: unknown function if at column 1; the tag stays Bad until the formula is fixed`,
			`datasource "broken": dropped its calculated tags, which were not valid JSON`,
		},
		"alarms": {
			`alarm rule "odd": unknown condition "between", read as gt`,
			`alarm rule "untagged": dropped, it had no tag`,
		},
		"dynamics": {
			`theme scada-dark is gone; the project now uses high-performance`,
			`page "Main", widget ring (led): two dynamics drive borderColor; kept the last`,
			`page "Main", widget scr (numericDisplay): dynamics.visible: rewrote Math.abs(value) === 0 as abs({plc:Press}) == 0`,
			`page "Main", widget scr (numericDisplay): dynamics.textColor: rewrote value.toFixed(1) == '20.0' && 'value' != {ns:value} as format({plc:T}, 1) == '20.0' && 'value' != {ns:value}`,
			`page "Main", widget bad (led): dropped a blink dynamic without a tag`,
			`page "Main", widget bad (led): dynamics.borderColor: unexpected "." at column 9; the property keeps its own setting until it is fixed`,
		},
	}
	all := map[string][]string{}
	for name, n := range v2ToV3 {
		all[name+".v5"] = nil // v5 to v6 renames faceplates to custom widgets (no note)
		all[name+".v4"] = nil // v4 to v5 only changes the theme from an id to an object (no note)
		all[name+".v3"] = nil // v3 to v4 only moves the version
		all[name+".v2"] = n
		if first, ok := v1ToV2[name]; ok {
			all[name+".v1"] = append(append([]string{}, first...), n...)
		}
	}
	return all
}()

// The golden files in testdata/upgrade are shared with the TypeScript
// upgrader's tests: every <name>.v<N>.json must upgrade to exactly the
// newest file of that name, <name>.v6.json.
func TestUpgradeGolden(t *testing.T) {
	newest, _ := filepath.Glob(fmt.Sprintf("../../testdata/upgrade/*.v%d.json", CurrentSchemaVersion))
	if len(newest) != 7 {
		t.Fatalf("%d current golden files, want 7", len(newest))
	}
	tested := 0
	for _, wantFile := range newest {
		name := strings.TrimSuffix(filepath.Base(wantFile), fmt.Sprintf(".v%d.json", CurrentSchemaVersion))
		want := read(t, wantFile)
		for v := 1; v < CurrentSchemaVersion; v++ {
			key := fmt.Sprintf("%s.v%d", name, v)
			src := filepath.Join(filepath.Dir(wantFile), key+".json")
			if _, err := os.Stat(src); err != nil {
				continue
			}
			tested++
			t.Run(key, func(t *testing.T) {
				got, gotNotes, err := Upgrade(read(t, src))
				if err != nil {
					t.Fatal(err)
				}
				if !sameJSON(t, got, want) {
					t.Errorf("upgrade differs from %s:\n%s", filepath.Base(wantFile), got)
				}
				if wantNotes := upgradeNotes[key]; !reflect.DeepEqual(gotNotes, wantNotes) {
					t.Errorf("notes:\n%s\nwant:\n%s", strings.Join(gotNotes, "\n"), strings.Join(wantNotes, "\n"))
				}
				checkSettingsAllowed(t, got)
				if err := ValidateJSON(got); err != nil {
					t.Errorf("upgraded file does not validate: %v", err)
				}
			})
		}
		t.Run(name+" current", func(t *testing.T) {
			again, againNotes, err := Upgrade(want)
			if err != nil || string(again) != string(want) || againNotes != nil {
				t.Errorf("upgrading the current file changed it (err %v, notes %v)", err, againNotes)
			}
		})
	}
	if tested != len(upgradeNotes) {
		t.Errorf("tested %d upgrades, but notes list %d", tested, len(upgradeNotes))
	}
}

func TestRewriteJS(t *testing.T) {
	tests := []struct{ in, want string }{
		{"Math.abs(x)", "abs(x)"},
		{"Math.round( {a} ) + Math.log10({b})", "round( {a} ) + log10({b})"},
		{"Math.PI * 2", "Math.PI * 2"}, // not a function the language has: left for the compiler to report
		{"Math.random()", "Math.random()"},
		{"{a}.toFixed(2)", "format({a}, 2)"},
		{"value.toFixed( 1 )", "format(value, 1)"},
		{"({a} * 2).toFixed(0)", "format(({a} * 2), 0)"},
		{"3.14159.toFixed(2)", "format(3.14159, 2)"},
		{"{a} === 1 && {b} !== 2", "{a} == 1 && {b} != 2"},
		{"{a} == 1", "{a} == 1"},
	}
	for _, tc := range tests {
		if got := RewriteJS(tc.in); got != tc.want {
			t.Errorf("RewriteJS(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestUpgradeVersions(t *testing.T) {
	tests := []struct {
		name, doc, err string
	}{
		{"missing means 1", `{"version":"1","pages":[]}`, ""},
		{"1", `{"schemaVersion":1,"pages":[]}`, ""},
		{"2", `{"schemaVersion":2,"pages":[]}`, ""},
		{"3", `{"schemaVersion":3,"pages":[]}`, ""},
		{"4", `{"schemaVersion":4,"pages":[]}`, ""},
		{"5", `{"schemaVersion":5,"pages":[]}`, ""},
		{"current", `{"schemaVersion":6,"pages":[]}`, ""},
		{"newer", `{"schemaVersion":7,"pages":[]}`, "the project is format 7; this version of Speth's Screens reads up to 6"},
		{"not a version", `{"schemaVersion":0}`, "is not a format version"},
		{"not JSON", `{`, "unmarshal project"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			out, _, err := Upgrade([]byte(tc.doc))
			if tc.err != "" {
				if err == nil || !strings.Contains(err.Error(), tc.err) {
					t.Fatalf("err %v, want %q", err, tc.err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var doc map[string]any
			if err := json.Unmarshal(out, &doc); err != nil || doc["schemaVersion"] != float64(6) {
				t.Errorf("got %s, want schemaVersion 6", out)
			}
		})
	}
}

func TestPropsKeysFromSchema(t *testing.T) {
	keys, err := propsKeys()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		typ, key string
		ok       bool
	}{
		{"gauge", "min", true},
		{"gauge", "label", true}, // a frame setting every widget has
		{"gauge", "momentary", false},
		{"button", "btnColor", true},
		{"button", "onValue", false}, // now an event
		{"numericInput", "max", true},
		{"textInput", "label", true},
		{"textInput", "unit", false},
	}
	if len(keys) != 26 {
		t.Errorf("%d widget types, want 26", len(keys))
	}
	for _, tc := range tests {
		if keys[tc.typ][tc.key] != tc.ok {
			t.Errorf("%s has %s = %v, want %v", tc.typ, tc.key, keys[tc.typ][tc.key], tc.ok)
		}
	}
}

func checkSettingsAllowed(t *testing.T, doc []byte) {
	t.Helper()
	keys, _ := propsKeys()
	var p struct {
		Pages []struct {
			Widgets []struct {
				Type  string         `json:"type"`
				Props map[string]any `json:"props"`
			} `json:"widgets"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(doc, &p); err != nil {
		t.Fatal(err)
	}
	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			for k := range w.Props {
				if !keys[w.Type][k] {
					t.Errorf("%s widget kept setting %s", w.Type, k)
				}
			}
		}
	}
}

func read(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func sameJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(x, y)
}

func TestUpgradeV4Theme(t *testing.T) {
	tests := []struct {
		name, in, want string
	}{
		{"an id becomes the calm preset in light mode", `{"schemaVersion":4,"theme":"high-performance","pages":[]}`, `{"mode":"light","preset":"calm"}`},
		{"an object is left alone", `{"schemaVersion":4,"theme":{"preset":"modern","font":"roboto"},"pages":[]}`, `{"font":"roboto","preset":"modern"}`},
		{"no theme stays none", `{"schemaVersion":4,"pages":[]}`, `null`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, notes, err := Upgrade([]byte(tt.in))
			if err != nil {
				t.Fatal(err)
			}
			var doc map[string]any
			if err := json.Unmarshal(out, &doc); err != nil {
				t.Fatal(err)
			}
			got, _ := json.Marshal(doc["theme"])
			if string(got) != tt.want || len(notes) != 0 {
				t.Errorf("theme %s, notes %v; want %s and no notes", got, notes, tt.want)
			}
		})
	}
}
