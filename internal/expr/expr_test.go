package expr

import (
	"math"
	"testing"
)

var tags = map[string]float64{
	"T1": 100, "T2": 80, "T3": 60,
	"Level": 2.5, "Area": 4.0,
	"SP": 75, "PV": 90,
}

func lookup(path string) (float64, bool) {
	v, ok := tags[path]
	return v, ok
}

func eng() *Engine { return New(lookup) }

func TestArithmetic(t *testing.T) {
	cases := []struct {
		expr string
		want float64
	}{
		{"2 + 3", 5},
		{"10 - 4", 6},
		{"3 * 4", 12},
		{"10 / 4", 2.5},
		{"2 + 3 * 4", 14},
		{"(2 + 3) * 4", 20},
		{"-5 + 10", 5},
	}
	e := eng()
	for _, c := range cases {
		got, err := e.Eval(c.expr)
		if err != nil {
			t.Errorf("%q: %v", c.expr, err)
			continue
		}
		if math.Abs(got-c.want) > 1e-9 {
			t.Errorf("%q: want %v, got %v", c.expr, c.want, got)
		}
	}
}

func TestTagReference(t *testing.T) {
	e := eng()
	got, err := e.Eval("Level * Area")
	if err != nil {
		t.Fatal(err)
	}
	if got != 10.0 {
		t.Errorf("want 10, got %v", got)
	}
}

func TestBuiltinAverage(t *testing.T) {
	got, err := eng().Eval("Average(T1, T2, T3)")
	if err != nil {
		t.Fatal(err)
	}
	if got != 80 {
		t.Errorf("want 80, got %v", got)
	}
}

func TestBuiltinMinMax(t *testing.T) {
	e := eng()
	min, _ := e.Eval("Min(T1, T2, T3)")
	max, _ := e.Eval("Max(T1, T2, T3)")
	if min != 60 {
		t.Errorf("Min: want 60, got %v", min)
	}
	if max != 100 {
		t.Errorf("Max: want 100, got %v", max)
	}
}

func TestBuiltinSum(t *testing.T) {
	got, err := eng().Eval("Sum(T1, T2, T3)")
	if err != nil {
		t.Fatal(err)
	}
	if got != 240 {
		t.Errorf("want 240, got %v", got)
	}
}

func TestBuiltinIf(t *testing.T) {
	e := eng()
	// PV=90 > SP=75 → 1 (true) → return 1
	got, err := e.Eval("If(PV > SP, 1, 0)")
	if err != nil {
		t.Fatal(err)
	}
	if got != 1 {
		t.Errorf("want 1, got %v", got)
	}
}

func TestBuiltinClamp(t *testing.T) {
	got, err := eng().Eval("Clamp(T1, 0, 50)")
	if err != nil {
		t.Fatal(err)
	}
	if got != 50 {
		t.Errorf("want 50, got %v", got)
	}
}

func TestBuiltinAbs(t *testing.T) {
	e := New(func(string) (float64, bool) { return 0, false })
	got, _ := e.Eval("Abs(-42)")
	if got != 42 {
		t.Errorf("want 42, got %v", got)
	}
}

func TestComparisons(t *testing.T) {
	e := eng()
	cases := [][2]interface{}{
		{"T1 > T2", 1.0},
		{"T2 < T1", 1.0},
		{"T1 == 100", 1.0},
		{"T1 != T2", 1.0},
		{"T1 <= 100", 1.0},
		{"T1 >= 100", 1.0},
		{"T1 > 200", 0.0},
	}
	for _, c := range cases {
		got, err := e.Eval(c[0].(string))
		if err != nil {
			t.Errorf("%q: %v", c[0], err)
			continue
		}
		if got != c[1].(float64) {
			t.Errorf("%q: want %v, got %v", c[0], c[1], got)
		}
	}
}

func TestUnknownTag(t *testing.T) {
	_, err := eng().Eval("Unknown * 2")
	if err == nil {
		t.Error("expected error for unknown tag")
	}
}

func TestCircularDetection(t *testing.T) {
	m := NewManager(lookup, nil)
	m.Register("A", "T1 + 1")
	m.Register("B", "A + 1")
	if err := m.Register("A", "B + 1"); err == nil {
		t.Error("expected circular reference error")
	}
}

func TestVirtualTagNotify(t *testing.T) {
	localTags := map[string]float64{"X": 10}
	results := map[string]float64{}

	m := NewManager(
		func(p string) (float64, bool) { v, ok := localTags[p]; return v, ok },
		func(path string, val float64) { results[path] = val },
	)

	if err := m.Register("Doubled", "X * 2"); err != nil {
		t.Fatal(err)
	}
	localTags["X"] = 20
	m.Notify("X")
	if results["Doubled"] != 40 {
		t.Errorf("want 40, got %v", results["Doubled"])
	}
}
