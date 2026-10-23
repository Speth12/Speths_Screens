// Package virtual provides a computed-tag driver.
// Expressions reference live tag values with {dsId:tagPath} syntax.
// Arithmetic: +, -, *, /, %, unary -, parens.
// Functions:  abs(x), floor(x), ceil(x), round(x), min(x,y), max(x,y), clamp(x,lo,hi).
package virtual

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// Ref is a tag reference found in an expression.
type Ref struct {
	DsID string
	Path string
	Key  string // full "dsId:path"
}

// ParseRefs returns all {dsId:path} references in expr without evaluating it.
func ParseRefs(expr string) []Ref {
	var refs []Ref
	seen := map[string]bool{}
	for {
		i := strings.Index(expr, "{")
		if i < 0 {
			break
		}
		j := strings.Index(expr[i:], "}")
		if j < 0 {
			break
		}
		inner := expr[i+1 : i+j]
		expr = expr[i+j+1:]
		sep := strings.Index(inner, ":")
		if sep < 0 {
			continue
		}
		key := inner
		if !seen[key] {
			seen[key] = true
			refs = append(refs, Ref{
				DsID: inner[:sep],
				Path: inner[sep+1:],
				Key:  key,
			})
		}
	}
	return refs
}

// Eval evaluates expr, substituting tag values from the provided map.
// Values are expected to be numeric; non-numeric values are treated as 0.
func Eval(expr string, vals map[string]float64) (float64, error) {
	// Substitute {ds:path} with their numeric values.
	expanded := substituteRefs(expr, vals)
	p := &parser{input: strings.TrimSpace(expanded)}
	v, err := p.parseExpr()
	if err != nil {
		return 0, fmt.Errorf("expr eval %q: %w", expr, err)
	}
	return v, nil
}

func substituteRefs(expr string, vals map[string]float64) string {
	var sb strings.Builder
	for {
		i := strings.Index(expr, "{")
		if i < 0 {
			sb.WriteString(expr)
			break
		}
		sb.WriteString(expr[:i])
		j := strings.Index(expr[i:], "}")
		if j < 0 {
			sb.WriteString(expr[i:])
			break
		}
		key := expr[i+1 : i+j]
		v := vals[key] // 0 if not present
		sb.WriteString(strconv.FormatFloat(v, 'f', -1, 64))
		expr = expr[i+j+1:]
	}
	return sb.String()
}

// ── Recursive descent parser ───────────────────────────────────────────────

type parser struct {
	input string
	pos   int
}

func (p *parser) peek() byte {
	p.skipWS()
	if p.pos >= len(p.input) {
		return 0
	}
	return p.input[p.pos]
}

func (p *parser) skipWS() {
	for p.pos < len(p.input) && unicode.IsSpace(rune(p.input[p.pos])) {
		p.pos++
	}
}

func (p *parser) consume(ch byte) bool {
	p.skipWS()
	if p.pos < len(p.input) && p.input[p.pos] == ch {
		p.pos++
		return true
	}
	return false
}

// parseExpr: expr = term (('+' | '-') term)*
func (p *parser) parseExpr() (float64, error) {
	v, err := p.parseTerm()
	if err != nil {
		return 0, err
	}
	for {
		if p.consume('+') {
			r, err := p.parseTerm()
			if err != nil {
				return 0, err
			}
			v += r
		} else if p.consume('-') {
			r, err := p.parseTerm()
			if err != nil {
				return 0, err
			}
			v -= r
		} else {
			break
		}
	}
	return v, nil
}

// parseTerm: term = factor (('*' | '/' | '%') factor)*
func (p *parser) parseTerm() (float64, error) {
	v, err := p.parseFactor()
	if err != nil {
		return 0, err
	}
	for {
		if p.consume('*') {
			r, err := p.parseFactor()
			if err != nil {
				return 0, err
			}
			v *= r
		} else if p.consume('/') {
			r, err := p.parseFactor()
			if err != nil {
				return 0, err
			}
			if r == 0 {
				return math.NaN(), nil
			}
			v /= r
		} else if p.consume('%') {
			r, err := p.parseFactor()
			if err != nil {
				return 0, err
			}
			if r == 0 {
				return math.NaN(), nil
			}
			v = math.Mod(v, r)
		} else {
			break
		}
	}
	return v, nil
}

// parseFactor: factor = NUMBER | '(' expr ')' | '-' factor | IDENT '(' args ')'
func (p *parser) parseFactor() (float64, error) {
	p.skipWS()
	ch := p.peek()

	// Unary minus
	if ch == '-' {
		p.pos++
		v, err := p.parseFactor()
		return -v, err
	}

	// Parenthesised expression
	if ch == '(' {
		p.pos++
		v, err := p.parseExpr()
		if err != nil {
			return 0, err
		}
		if !p.consume(')') {
			return 0, fmt.Errorf("expected ')'")
		}
		return v, nil
	}

	// Number literal
	if ch == '.' || (ch >= '0' && ch <= '9') {
		return p.parseNumber()
	}

	// Function call or identifier
	if isLetter(ch) {
		return p.parseFunc()
	}

	return 0, fmt.Errorf("unexpected char %q at pos %d in %q", string(ch), p.pos, p.input)
}

func (p *parser) parseNumber() (float64, error) {
	start := p.pos
	for p.pos < len(p.input) {
		c := p.input[p.pos]
		if c == '.' || (c >= '0' && c <= '9') {
			p.pos++
			continue
		}
		// Allow e/E followed by optional sign for scientific notation (e.g. 1e+5)
		if (c == 'e' || c == 'E') && p.pos+1 < len(p.input) {
			p.pos++
			if p.pos < len(p.input) && (p.input[p.pos] == '+' || p.input[p.pos] == '-') {
				p.pos++
			}
			continue
		}
		break
	}
	return strconv.ParseFloat(p.input[start:p.pos], 64)
}

func (p *parser) parseName() string {
	start := p.pos
	for p.pos < len(p.input) && (isLetter(p.input[p.pos]) || p.input[p.pos] == '_' || (p.pos > start && p.input[p.pos] >= '0' && p.input[p.pos] <= '9')) {
		p.pos++
	}
	return p.input[start:p.pos]
}

func (p *parser) parseFunc() (float64, error) {
	name := p.parseName()
	if !p.consume('(') {
		return 0, fmt.Errorf("expected '(' after function %q", name)
	}
	var args []float64
	for p.peek() != ')' && p.peek() != 0 {
		if len(args) > 0 && !p.consume(',') {
			return 0, fmt.Errorf("expected ',' between arguments of %q", name)
		}
		v, err := p.parseExpr()
		if err != nil {
			return 0, err
		}
		args = append(args, v)
	}
	if !p.consume(')') {
		return 0, fmt.Errorf("expected ')' to close function %q", name)
	}
	return callFunc(name, args)
}

func callFunc(name string, args []float64) (float64, error) {
	switch name {
	case "abs":
		if len(args) != 1 {
			return 0, fmt.Errorf("abs() requires 1 arg")
		}
		return math.Abs(args[0]), nil
	case "floor":
		if len(args) != 1 {
			return 0, fmt.Errorf("floor() requires 1 arg")
		}
		return math.Floor(args[0]), nil
	case "ceil":
		if len(args) != 1 {
			return 0, fmt.Errorf("ceil() requires 1 arg")
		}
		return math.Ceil(args[0]), nil
	case "round":
		if len(args) != 1 {
			return 0, fmt.Errorf("round() requires 1 arg")
		}
		return math.Round(args[0]), nil
	case "sqrt":
		if len(args) != 1 {
			return 0, fmt.Errorf("sqrt() requires 1 arg")
		}
		return math.Sqrt(args[0]), nil
	case "min":
		if len(args) < 2 {
			return 0, fmt.Errorf("min() requires at least 2 args")
		}
		v := args[0]
		for _, a := range args[1:] {
			if a < v {
				v = a
			}
		}
		return v, nil
	case "max":
		if len(args) < 2 {
			return 0, fmt.Errorf("max() requires at least 2 args")
		}
		v := args[0]
		for _, a := range args[1:] {
			if a > v {
				v = a
			}
		}
		return v, nil
	case "clamp":
		if len(args) != 3 {
			return 0, fmt.Errorf("clamp(x, lo, hi) requires 3 args")
		}
		return math.Max(args[1], math.Min(args[2], args[0])), nil
	case "pow":
		if len(args) != 2 {
			return 0, fmt.Errorf("pow(base, exp) requires 2 args")
		}
		return math.Pow(args[0], args[1]), nil
	case "log":
		if len(args) != 1 {
			return 0, fmt.Errorf("log(x) requires 1 arg")
		}
		return math.Log(args[0]), nil
	case "log10":
		if len(args) != 1 {
			return 0, fmt.Errorf("log10(x) requires 1 arg")
		}
		return math.Log10(args[0]), nil
	case "log2":
		if len(args) != 1 {
			return 0, fmt.Errorf("log2(x) requires 1 arg")
		}
		return math.Log2(args[0]), nil
	case "sin":
		if len(args) != 1 {
			return 0, fmt.Errorf("sin(x) requires 1 arg")
		}
		return math.Sin(args[0]), nil
	case "cos":
		if len(args) != 1 {
			return 0, fmt.Errorf("cos(x) requires 1 arg")
		}
		return math.Cos(args[0]), nil
	case "tan":
		if len(args) != 1 {
			return 0, fmt.Errorf("tan(x) requires 1 arg")
		}
		return math.Tan(args[0]), nil
	case "if":
		// if(condition, trueVal, falseVal) — condition != 0 is true
		if len(args) != 3 {
			return 0, fmt.Errorf("if(cond, trueVal, falseVal) requires 3 args")
		}
		if args[0] != 0 {
			return args[1], nil
		}
		return args[2], nil
	case "sign":
		if len(args) != 1 {
			return 0, fmt.Errorf("sign(x) requires 1 arg")
		}
		if args[0] > 0 {
			return 1, nil
		} else if args[0] < 0 {
			return -1, nil
		}
		return 0, nil
	case "map":
		// map(x, inLo, inHi, outLo, outHi) — linear map
		if len(args) != 5 {
			return 0, fmt.Errorf("map(x, inLo, inHi, outLo, outHi) requires 5 args")
		}
		inSpan := args[2] - args[1]
		if inSpan == 0 {
			return args[3], nil
		}
		t := (args[0] - args[1]) / inSpan
		return args[3] + t*(args[4]-args[3]), nil
	default:
		return 0, fmt.Errorf("unknown function %q", name)
	}
}

func isLetter(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
}
