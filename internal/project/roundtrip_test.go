package project

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// TestProjectFilesRoundTrip loads each committed project file through the
// generated types and writes it back, after upgrading it to the current format. Every field must survive: the runtime
// serves the project to the operator from these structs, so a key missing
// from schema.json would be silently dropped.
func TestProjectFilesRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"demo project", "demo.xhmi.json"},
		{"example project", "project/project.example.json"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			file, err := os.ReadFile(filepath.Join("..", "..", tc.path))
			if err != nil {
				t.Fatalf("read: %v", err)
			}
			raw, _, err := Upgrade(file)
			if err != nil {
				t.Fatalf("upgrade: %v", err)
			}

			// Strict decode: a key that schema.json does not define fails here.
			dec := json.NewDecoder(bytes.NewReader(raw))
			dec.DisallowUnknownFields()
			var strict Project
			if err := dec.Decode(&strict); err != nil {
				t.Fatalf("strict decode: %v", err)
			}

			p, err := Parse(raw)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			out, err := json.Marshal(p)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}

			var want, got any
			if err := json.Unmarshal(raw, &want); err != nil {
				t.Fatalf("unmarshal original: %v", err)
			}
			if err := json.Unmarshal(out, &got); err != nil {
				t.Fatalf("unmarshal round-trip: %v", err)
			}
			if !reflect.DeepEqual(want, got) {
				t.Errorf("round-trip changed the project:\nwant %s\ngot  %s", raw, out)
			}
		})
	}
}
