package expr

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

// goldenCase is one entry in testdata/expr/*.json, shared with the
// TypeScript engine (packages/expr/src/expr.test.ts). A tag or value is
// either a plain JSON value (Good) or {"value": ..., "quality": ...}; a
// tag missing from tags has no value; a missing value means no widget.
type goldenCase struct {
	Expr      string                     `json:"expr"`
	Tags      map[string]json.RawMessage `json:"tags"`
	Value     json.RawMessage            `json:"value"`
	Want      json.RawMessage            `json:"want"`
	Unknown   string                     `json:"unknown"`
	Error     string                     `json:"error"`
	Refs      *[]string                  `json:"refs"`
	UsesValue bool                       `json:"usesValue"`
	Near      bool                       `json:"near"` // compare to 12 significant digits (sin, cos, log, pow)
}

func input(t *testing.T, raw json.RawMessage) Input {
	t.Helper()
	var spec struct {
		Value   any     `json:"value"`
		Quality *string `json:"quality"`
	}
	if json.Unmarshal(raw, &spec) == nil && spec.Quality != nil {
		return Input{Value: spec.Value, Quality: *spec.Quality}
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("bad input %s: %v", raw, err)
	}
	return Input{Value: v, Quality: "Good"}
}

func TestGolden(t *testing.T) {
	files, _ := filepath.Glob("../../testdata/expr/*.json")
	if len(files) == 0 {
		t.Fatal("no golden files in testdata/expr")
	}
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		var cases []goldenCase
		if err := json.Unmarshal(data, &cases); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, c := range cases {
			t.Run(filepath.Base(f)+"/"+c.Expr, func(t *testing.T) {
				e, err := Compile(c.Expr)
				if c.Error != "" {
					if err == nil || err.Error() != c.Error {
						t.Fatalf("Compile error = %v, want %q", err, c.Error)
					}
					return
				}
				if err != nil {
					t.Fatalf("Compile: %v", err)
				}
				if c.Refs != nil && !reflect.DeepEqual(e.Refs, *c.Refs) {
					t.Errorf("Refs = %q, want %q", e.Refs, *c.Refs)
				}
				if e.UsesValue != c.UsesValue {
					t.Errorf("UsesValue = %v, want %v", e.UsesValue, c.UsesValue)
				}
				env := Env{Tag: func(ref string) (Input, bool) {
					raw, ok := c.Tags[ref]
					if !ok {
						return Input{}, false
					}
					return input(t, raw), true
				}}
				if c.Value != nil {
					env.Value = func() (Input, bool) { return input(t, c.Value), true }
				}
				got, why := e.Eval(env)
				if c.Unknown != "" {
					if why != c.Unknown {
						t.Fatalf("Eval = %v, %q; want unknown %q", got, why, c.Unknown)
					}
					return
				}
				if why != "" {
					t.Fatalf("Eval unknown: %s", why)
				}
				var want any
				if err := json.Unmarshal(c.Want, &want); err != nil {
					t.Fatalf("bad want %s: %v", c.Want, err)
				}
				if c.Near {
					g, gok := got.(float64)
					w, wok := want.(float64)
					if !gok || !wok || math.Abs(g-w) > 1e-12*math.Max(1, math.Abs(w)) {
						t.Fatalf("Eval = %#v, want about %#v", got, want)
					}
					return
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("Eval = %#v, want %#v", got, want)
				}
			})
		}
	}
}

func TestLength(t *testing.T) {
	tests := []struct {
		name string
		src  string
		ok   bool
	}{
		{"1000 characters", "1" + strings.Repeat(" ", 999), true},
		{"1001 characters", "1" + strings.Repeat(" ", 1000), false},
		{"1000 code points, more bytes", `"` + strings.Repeat("é", 998) + `"`, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Compile(tc.src)
			if tc.ok && err != nil {
				t.Fatalf("Compile: %v", err)
			}
			if !tc.ok && (err == nil || err.Error() != "expression longer than 1000 characters") {
				t.Fatalf("Compile error = %v", err)
			}
		})
	}
}

func TestDriverValues(t *testing.T) {
	tests := []struct {
		name string
		in   any
		want any
		why  string
	}{
		{"int16", int16(-5), -5.0, ""},
		{"uint32", uint32(7), 7.0, ""},
		{"float32", float32(0.5), 0.5, ""},
		{"json.Number", json.Number("12.5"), 12.5, ""},
		{"NaN from a PLC float", nan(), nil, "input {ns:a} is not a finite number"},
		{"a struct", struct{}{}, nil, "input {ns:a} has an unsupported value"},
	}
	e, err := Compile("{ns:a}")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, why := e.Eval(Env{Tag: func(string) (Input, bool) { return Input{Value: tc.in, Quality: "Good"}, true }})
			if why != tc.why || !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Eval = %v, %q; want %v, %q", got, why, tc.want, tc.why)
			}
		})
	}
}

func nan() float64 {
	zero := 0.0
	return zero / zero
}

// FuzzCompile checks that no input panics and that whatever compiles
// evaluates without panicking against tags of every kind.
func FuzzCompile(f *testing.F) {
	for _, s := range []string{"1 + 2", "{ns:a} > 5 ? 'hi' : format(value, 2)", "bit({ds:x}, 3) && good({ns:a})", "((", "'\\", "{a:", "0x1"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, src string) {
		e, err := Compile(src)
		if err != nil {
			if utf8.ValidString(src) && err.Error() == "" {
				t.Fatal("empty error")
			}
			return
		}
		for _, v := range []any{1.5, true, "s", nil, -1e300} {
			in := Input{Value: v, Quality: "Good"}
			e.Eval(Env{Tag: func(string) (Input, bool) { return in, true }, Value: func() (Input, bool) { return in, true }})
		}
	})
}
