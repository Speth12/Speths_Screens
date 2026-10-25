package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const v1Doc = `{"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[
  {"id":"g","type":"gauge","x":0,"y":0,"w":2,"h":2,"binding":"plc:T","config":{"min":0,"decimals":2}}]}]}`

func TestRunUpgrade(t *testing.T) {
	tests := []struct {
		name    string
		doc     string
		args    func(dir, file string) []string
		code    int
		stdout  string
		stderr  string
		written string // file that must hold the v2 project
		backup  bool
	}{
		{"in place, keeping a backup", v1Doc, func(_, f string) []string { return []string{f} }, 0,
			"dropped setting decimals", "", "project.json", true},
		{"to another file", v1Doc, func(d, f string) []string { return []string{"-o", filepath.Join(d, "v2.json"), f} }, 0,
			"wrote", "", "v2.json", false},
		{"already current", `{"schemaVersion":2,"version":"1","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}]}`,
			func(_, f string) []string { return []string{f} }, 0, "already format 2", "", "", false},
		{"newer format", `{"schemaVersion":7}`, func(_, f string) []string { return []string{f} }, 1,
			"", "reads up to 2", "", false},
		{"upgraded project that does not validate", `{"version":"1","datasources":[],"pages":[]}`,
			func(_, f string) []string { return []string{f} }, 1, "", "not written", "", false},
		{"no file", v1Doc, func(_, _ string) []string { return nil }, 2, "", "usage", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			file := filepath.Join(dir, "project.json")
			if err := os.WriteFile(file, []byte(tc.doc), 0o644); err != nil {
				t.Fatal(err)
			}
			var out, errOut bytes.Buffer
			if code := runUpgrade(tc.args(dir, file), &out, &errOut); code != tc.code {
				t.Fatalf("exit %d, want %d (stdout %q, stderr %q)", code, tc.code, out.String(), errOut.String())
			}
			if !strings.Contains(out.String(), tc.stdout) || !strings.Contains(errOut.String(), tc.stderr) {
				t.Errorf("stdout %q, stderr %q; want %q / %q", out.String(), errOut.String(), tc.stdout, tc.stderr)
			}
			if tc.written != "" {
				got, err := os.ReadFile(filepath.Join(dir, tc.written))
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(string(got), `"schemaVersion": 2`) || !strings.Contains(string(got), `"bindings"`) {
					t.Errorf("%s is not the v2 project:\n%s", tc.written, got)
				}
			} else if tc.code != 0 {
				if got, _ := os.ReadFile(file); string(got) != tc.doc {
					t.Error("the file changed although nothing should be written")
				}
			}
			bak, err := os.ReadFile(file + ".bak")
			if tc.backup != (err == nil) {
				t.Errorf("backup exists = %v, want %v", err == nil, tc.backup)
			}
			if tc.backup && string(bak) != tc.doc {
				t.Error("the backup is not the original")
			}
		})
	}
}
