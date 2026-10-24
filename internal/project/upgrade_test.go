package project

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// The golden files in testdata/upgrade are shared with the TypeScript
// upgrader's tests: <name>.v1.json must upgrade to exactly <name>.v2.json.
func TestUpgradeGolden(t *testing.T) {
	notes := map[string][]string{
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
	files, _ := filepath.Glob("../../testdata/upgrade/*.v1.json")
	if len(files) != len(notes) {
		t.Fatalf("%d golden files, want %d", len(files), len(notes))
	}
	for _, f := range files {
		name := strings.TrimSuffix(filepath.Base(f), ".v1.json")
		t.Run(name, func(t *testing.T) {
			v1 := read(t, f)
			want := read(t, strings.Replace(f, ".v1.json", ".v2.json", 1))
			got, gotNotes, err := Upgrade(v1)
			if err != nil {
				t.Fatal(err)
			}
			if !sameJSON(t, got, want) {
				t.Errorf("upgrade differs from %s.v2.json:\n%s", name, got)
			}
			if !reflect.DeepEqual(gotNotes, notes[name]) {
				t.Errorf("notes:\n%s\nwant:\n%s", strings.Join(gotNotes, "\n"), strings.Join(notes[name], "\n"))
			}
			// A current file is left alone.
			again, againNotes, err := Upgrade(want)
			if err != nil || string(again) != string(want) || againNotes != nil {
				t.Errorf("upgrading the v2 file changed it (err %v, notes %v)", err, againNotes)
			}
			checkSettingsAllowed(t, got)
		})
	}
}

func TestUpgradeVersions(t *testing.T) {
	tests := []struct {
		name, doc, err string
	}{
		{"missing means 1", `{"version":"1","pages":[]}`, ""},
		{"1", `{"schemaVersion":1,"pages":[]}`, ""},
		{"current", `{"schemaVersion":2,"pages":[]}`, ""},
		{"newer", `{"schemaVersion":3,"pages":[]}`, "the project is format 3; this version of Speth's Screens reads up to 2"},
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
			if err := json.Unmarshal(out, &doc); err != nil || doc["schemaVersion"] != float64(2) {
				t.Errorf("got %s, want schemaVersion 2", out)
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
	if len(keys) != 17 {
		t.Errorf("%d widget types, want 17", len(keys))
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
