package project

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The format 4 checks shared with the IDE (testdata/format4/problems.json;
// packages/shared-types/src/expressions.test.ts reads the same cases).
func TestFormat4Problems(t *testing.T) {
	data, err := os.ReadFile("../../testdata/format4/problems.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name    string          `json:"name"`
		Project json.RawMessage `json:"project"`
		Want    []string        `json:"want"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			var doc map[string]any
			if err := json.Unmarshal(c.Project, &doc); err != nil {
				t.Fatal(err)
			}
			doc["schemaVersion"], doc["version"] = 4, "1"
			if doc["datasources"] == nil {
				doc["datasources"] = []any{}
			}
			doc["pages"] = []any{map[string]any{"id": "p1", "name": "Main", "widgets": []any{}}}
			b, _ := json.Marshal(doc)
			if err := ValidateJSON(b); err != nil {
				t.Fatalf("does not follow the schema: %v", err)
			}
			var p Project
			if err := json.Unmarshal(b, &p); err != nil {
				t.Fatal(err)
			}
			got := ExpressionProblems(&p)
			if got == nil {
				got = []string{}
			}
			if !reflect.DeepEqual(got, c.Want) {
				t.Errorf("problems:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(c.Want, "\n"))
			}
		})
	}
}

// Syntax errors are worded by goja; the IDE's (acorn) are tested there.
func TestSyntaxProblem(t *testing.T) {
	tests := []struct{ src, want string }{
		{"log(1)", ""},
		{"await writeTag('mem:A', 1)", ""},
		{"if (x > 1) return;", ""},
		{"", ""},
		{"if (x {", "line 1, column 7: Unexpected token {"},
		{"log(1)\nconst = 3", "line 2, column 7: Unexpected token ="},
	}
	for _, tc := range tests {
		if got := SyntaxProblem(tc.src); got != tc.want {
			t.Errorf("SyntaxProblem(%q) = %q, want %q", tc.src, got, tc.want)
		}
	}
}
