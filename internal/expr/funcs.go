package expr

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// function is one built-in. min and max bound the argument count (max -1:
// no limit); tag means the single argument must be a tag reference.
type function struct {
	min, max int
	tag      bool
	eval     func(name string, args []any) (any, string)
}

var funcs map[string]*function

func init() {
	unary := func(f func(float64) float64) *function {
		return &function{min: 1, max: 1, eval: func(name string, a []any) (any, string) {
			x, why := numArg(name, a[0])
			if why != "" {
				return nil, why
			}
			return finite(f(x))
		}}
	}
	variadic := func(f func([]float64) float64) *function {
		return &function{min: 1, max: -1, eval: func(name string, a []any) (any, string) {
			xs := make([]float64, len(a))
			for i, v := range a {
				x, ok := num(v)
				if !ok {
					return nil, name + " needs numbers, got " + typeName(v)
				}
				xs[i] = x
			}
			return finite(f(xs))
		}}
	}
	funcs = map[string]*function{
		"abs":   unary(math.Abs),
		"floor": unary(math.Floor),
		"ceil":  unary(math.Ceil),
		"sqrt":  unary(math.Sqrt),
		"round": {min: 1, max: 2, eval: func(name string, a []any) (any, string) {
			x, why := numArg(name, a[0])
			if why != "" {
				return nil, why
			}
			d := 0
			if len(a) == 2 {
				if d, why = digitsArg(a[1], "round digits"); why != "" {
					return nil, why
				}
			}
			p := math.Pow10(d)
			return finite(math.Round(x*p) / p)
		}},
		"min": variadic(func(xs []float64) float64 {
			m := xs[0]
			for _, x := range xs[1:] {
				m = math.Min(m, x)
			}
			return m
		}),
		"max": variadic(func(xs []float64) float64 {
			m := xs[0]
			for _, x := range xs[1:] {
				m = math.Max(m, x)
			}
			return m
		}),
		"sum": variadic(sum),
		"avg": variadic(func(xs []float64) float64 { return sum(xs) / float64(len(xs)) }),
		"clamp": {min: 3, max: 3, eval: func(name string, a []any) (any, string) {
			var xs [3]float64
			for i, v := range a {
				x, ok := num(v)
				if !ok {
					return nil, name + " needs numbers, got " + typeName(v)
				}
				xs[i] = x
			}
			return finite(math.Max(xs[1], math.Min(xs[2], xs[0])))
		}},
		"bit": {min: 2, max: 2, eval: func(name string, a []any) (any, string) {
			w, why := numArg(name, a[0])
			if why != "" {
				return nil, why
			}
			if w != math.Trunc(w) || math.Abs(w) > 1<<53 {
				return nil, "bit needs a whole number, got " + numString(w)
			}
			n, ok := num(a[1])
			if !ok || n != math.Trunc(n) || n < 0 || n > 63 {
				return nil, "bit position must be a whole number from 0 to 63"
			}
			return (int64(w)>>uint(n))&1 == 1, ""
		}},
		"format": {min: 2, max: 2, eval: func(name string, a []any) (any, string) {
			x, why := numArg(name, a[0])
			if why != "" {
				return nil, why
			}
			d, why := digitsArg(a[1], "format decimals")
			if why != "" {
				return nil, why
			}
			return formatFixed(x, d)
		}},
		"good": {min: 1, max: 1, tag: true},
		// From the calculated-tag engine this language replaced. sin, cos,
		// tan, log and pow may differ from the browser in the last digit.
		"sin":   unary(math.Sin),
		"cos":   unary(math.Cos),
		"tan":   unary(math.Tan),
		"log":   unary(math.Log),
		"log10": unary(math.Log10),
		"log2":  unary(math.Log2),
		"sign": unary(func(x float64) float64 {
			switch {
			case x > 0:
				return 1
			case x < 0:
				return -1
			}
			return 0
		}),
		"pow": {min: 2, max: 2, eval: func(name string, a []any) (any, string) {
			var xs [2]float64
			for i, v := range a {
				x, ok := num(v)
				if !ok {
					return nil, name + " needs numbers, got " + typeName(v)
				}
				xs[i] = x
			}
			return finite(math.Pow(xs[0], xs[1]))
		}},
		// map(x, inLo, inHi, outLo, outHi) scales x linearly, without clamping;
		// an empty input range gives outLo.
		"map": {min: 5, max: 5, eval: func(name string, a []any) (any, string) {
			var xs [5]float64
			for i, v := range a {
				x, ok := num(v)
				if !ok {
					return nil, name + " needs numbers, got " + typeName(v)
				}
				xs[i] = x
			}
			span := xs[2] - xs[1]
			if span == 0 {
				return finite(xs[3])
			}
			return finite(xs[3] + (xs[0]-xs[1])/span*(xs[4]-xs[3]))
		}},
	}
}

func sum(xs []float64) float64 {
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s
}

func numArg(name string, v any) (float64, string) {
	x, ok := num(v)
	if !ok {
		return 0, name + " needs a number, got " + typeName(v)
	}
	return x, ""
}

// digitsArg reads a decimal-places argument: a whole number from 0 to 10.
func digitsArg(v any, what string) (int, string) {
	d, ok := num(v)
	if !ok || d != math.Trunc(d) || d < 0 || d > 10 {
		return 0, what + " must be a whole number from 0 to 10"
	}
	return int(d), ""
}

// check checks the argument count (and, for good, that the argument is a
// tag) at compile time.
func (f *function) check(name string, args []node) error {
	if f.tag {
		if _, ok := firstRef(args); !ok || len(args) != 1 {
			return fmt.Errorf("%s takes a tag, like %s({ns:path})", name, name)
		}
		return nil
	}
	n := len(args)
	if n >= f.min && (f.max < 0 || n <= f.max) {
		return nil
	}
	plural := func(k int) string {
		if k == 1 {
			return "argument"
		}
		return "arguments"
	}
	switch {
	case f.max < 0:
		return fmt.Errorf("%s takes at least %d %s, got %d", name, f.min, plural(f.min), n)
	case f.min == f.max:
		return fmt.Errorf("%s takes %d %s, got %d", name, f.min, plural(f.min), n)
	}
	return fmt.Errorf("%s takes %d or %d arguments, got %d", name, f.min, f.max, n)
}

func firstRef(args []node) (*refNode, bool) {
	if len(args) == 0 {
		return nil, false
	}
	r, ok := args[0].(*refNode)
	return r, ok
}

// formatFixed writes x with d decimals, rounding half away from zero, the
// same way round does. It goes through a whole number so that Go and
// TypeScript print the same digits.
func formatFixed(x float64, d int) (any, string) {
	n := math.Round(x * math.Pow10(d))
	if math.IsNaN(n) || math.Abs(n) > 1<<53 {
		return nil, "number too large to format"
	}
	digits := strconv.FormatUint(uint64(math.Abs(n)), 10)
	if len(digits) <= d {
		digits = strings.Repeat("0", d-len(digits)+1) + digits
	}
	s := digits
	if d > 0 {
		s = digits[:len(digits)-d] + "." + digits[len(digits)-d:]
	}
	if n < 0 {
		s = "-" + s
	}
	return s, ""
}

// numString writes a number the way JavaScript's String(x) does, so text
// built from numbers is the same in the browser and the runtime.
func numString(f float64) string {
	if f == 0 {
		return "0" // also -0
	}
	if a := math.Abs(f); a >= 1e-6 && a < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	s := strconv.FormatFloat(f, 'e', -1, 64) // 1.5e-07, 1e+21
	mant, exp, _ := strings.Cut(s, "e")
	return mant + "e" + exp[:1] + strings.TrimLeft(exp[1:], "0")
}
