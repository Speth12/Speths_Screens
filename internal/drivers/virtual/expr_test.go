package virtual

import (
	"math"
	"testing"
)

func TestEval(t *testing.T) {
	vals := map[string]float64{
		"opcua:Temp":     100.0,
		"mb:AI0":         2047.0,
		"opcua:Pressure": 4.0,
	}

	cases := []struct {
		expr    string
		want    float64
		wantErr bool
	}{
		{"1+2", 3, false},
		{"10 - 3", 7, false},
		{"3 * 4", 12, false},
		{"10 / 4", 2.5, false},
		{"10 % 3", 1, false},
		{"-5 + 10", 5, false},
		{"(1+2)*3", 9, false},
		// Tag references
		{"{opcua:Temp} * 9/5 + 32", 212, false},
		{"clamp({mb:AI0} / 4095 * 100, 0, 100)", 49.99, false},
		{"{opcua:Pressure} * 14.5038", 58.0152, false},
		// Functions
		{"abs(-42)", 42, false},
		{"floor(3.9)", 3, false},
		{"ceil(3.1)", 4, false},
		{"round(3.5)", 4, false},
		{"sqrt(9)", 3, false},
		{"min(1, 2, 3)", 1, false},
		{"max(1, 2, 3)", 3, false},
		{"clamp(150, 0, 100)", 100, false},
		{"pow(2, 10)", 1024, false},
		// Missing tag → 0
		{"{opcua:Missing} + 5", 5, false},
		// Trig / log / sign / map / if
		{"sin(0)", 0, false},
		{"cos(0)", 1, false},
		{"log(1)", 0, false},
		{"log10(100)", 2, false},
		{"log2(8)", 3, false},
		{"sign(-7)", -1, false},
		{"sign(0)", 0, false},
		{"sign(3.14)", 1, false},
		{"if(1, 42, 0)", 42, false},
		{"if(0, 42, 99)", 99, false},
		{"map(50, 0, 100, 0, 10)", 5, false},
		{"map(0, 0, 100, -10, 10)", -10, false},
	}

	for _, c := range cases {
		got, err := Eval(c.expr, vals)
		if c.wantErr {
			if err == nil {
				t.Errorf("Eval(%q): expected error, got %v", c.expr, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("Eval(%q): unexpected error: %v", c.expr, err)
			continue
		}
		if math.Abs(got-c.want) > 0.01 {
			t.Errorf("Eval(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestParseRefs(t *testing.T) {
	refs := ParseRefs("{opcua:Temp} * 9/5 + {mb:AI0}")
	if len(refs) != 2 {
		t.Fatalf("expected 2 refs, got %d", len(refs))
	}
	if refs[0].Key != "opcua:Temp" {
		t.Errorf("refs[0].Key = %q, want opcua:Temp", refs[0].Key)
	}
	if refs[1].Key != "mb:AI0" {
		t.Errorf("refs[1].Key = %q, want mb:AI0", refs[1].Key)
	}
}
