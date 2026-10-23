// Package expr provides the Speth's Screens expression engine for calculated / virtual tags.
//
// Expressions are evaluated against a tag value lookup function:
//
//	eng := expr.New(func(path string) (float64, bool) { ... })
//	val, err := eng.Eval("Average(T1, T2, T3) * 1.8 + 32")
//
// Supported:
//   - Arithmetic:          + - * / ( )
//   - Comparison:          > < >= <= == !=
//   - Boolean:             && ||
//   - Built-in functions:  Average, Min, Max, Sum, If, Clamp, Abs, Round
//   - Tag references:      any unquoted identifier resolved via the lookup func
package expr

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// LookupFunc resolves a tag path to a float64.  Returns (value, true) if the
// tag is known, (0, false) otherwise.
type LookupFunc func(path string) (float64, bool)

// Engine evaluates expression strings.
type Engine struct {
	lookup LookupFunc
}

// New returns an Engine that resolves tag references with lookup.
func New(lookup LookupFunc) *Engine {
	return &Engine{lookup: lookup}
}

// Eval parses and evaluates expr against the engine's tag lookup.
func (e *Engine) Eval(expression string) (float64, error) {
	p := &parser{src: strings.TrimSpace(expression), lookup: e.lookup}
	v, err := p.parseOr()
	if err != nil {
		return 0, err
	}
	if p.pos < len(p.src) {
		return 0, fmt.Errorf("expr: unexpected character at %d: %q", p.pos, p.src[p.pos:])
	}
	return v, nil
}

// ── Parser ─────────────────────────────────────────────────────────────────

type parser struct {
	src    string
	pos    int
	lookup LookupFunc
}

func (p *parser) skipWS() {
	for p.pos < len(p.src) && unicode.IsSpace(rune(p.src[p.pos])) {
		p.pos++
	}
}

func (p *parser) peek() byte {
	p.skipWS()
	if p.pos >= len(p.src) {
		return 0
	}
	return p.src[p.pos]
}

func (p *parser) consume() byte {
	p.skipWS()
	if p.pos >= len(p.src) {
		return 0
	}
	c := p.src[p.pos]
	p.pos++
	return c
}

func (p *parser) expect(c byte) error {
	if p.consume() != c {
		return fmt.Errorf("expr: expected %q at pos %d", c, p.pos)
	}
	return nil
}

// parseOr handles &&, ||
func (p *parser) parseOr() (float64, error) {
	left, err := p.parseAnd()
	if err != nil {
		return 0, err
	}
	for {
		p.skipWS()
		if p.pos+1 < len(p.src) && p.src[p.pos:p.pos+2] == "||" {
			p.pos += 2
			right, err := p.parseAnd()
			if err != nil {
				return 0, err
			}
			if left != 0 || right != 0 {
				left = 1
			} else {
				left = 0
			}
		} else {
			break
		}
	}
	return left, nil
}

func (p *parser) parseAnd() (float64, error) {
	left, err := p.parseCompare()
	if err != nil {
		return 0, err
	}
	for {
		p.skipWS()
		if p.pos+1 < len(p.src) && p.src[p.pos:p.pos+2] == "&&" {
			p.pos += 2
			right, err := p.parseCompare()
			if err != nil {
				return 0, err
			}
			if left != 0 && right != 0 {
				left = 1
			} else {
				left = 0
			}
		} else {
			break
		}
	}
	return left, nil
}

func (p *parser) parseCompare() (float64, error) {
	left, err := p.parseAddSub()
	if err != nil {
		return 0, err
	}
	p.skipWS()
	ops := []string{">=", "<=", "==", "!=", ">", "<"}
	for _, op := range ops {
		if strings.HasPrefix(p.src[p.pos:], op) {
			p.pos += len(op)
			right, err := p.parseAddSub()
			if err != nil {
				return 0, err
			}
			switch op {
			case ">":
				if left > right { return 1, nil }
			case "<":
				if left < right { return 1, nil }
			case ">=":
				if left >= right { return 1, nil }
			case "<=":
				if left <= right { return 1, nil }
			case "==":
				if left == right { return 1, nil }
			case "!=":
				if left != right { return 1, nil }
			}
			return 0, nil
		}
	}
	return left, nil
}

func (p *parser) parseAddSub() (float64, error) {
	left, err := p.parseMulDiv()
	if err != nil {
		return 0, err
	}
	for {
		c := p.peek()
		if c != '+' && c != '-' {
			break
		}
		p.consume()
		right, err := p.parseMulDiv()
		if err != nil {
			return 0, err
		}
		if c == '+' {
			left += right
		} else {
			left -= right
		}
	}
	return left, nil
}

func (p *parser) parseMulDiv() (float64, error) {
	left, err := p.parseUnary()
	if err != nil {
		return 0, err
	}
	for {
		c := p.peek()
		if c != '*' && c != '/' {
			break
		}
		p.consume()
		right, err := p.parseUnary()
		if err != nil {
			return 0, err
		}
		if c == '*' {
			left *= right
		} else {
			if right == 0 {
				return 0, fmt.Errorf("expr: division by zero")
			}
			left /= right
		}
	}
	return left, nil
}

func (p *parser) parseUnary() (float64, error) {
	p.skipWS()
	if p.peek() == '-' {
		p.consume()
		v, err := p.parseAtom()
		return -v, err
	}
	return p.parseAtom()
}

func (p *parser) parseAtom() (float64, error) {
	p.skipWS()
	if p.pos >= len(p.src) {
		return 0, fmt.Errorf("expr: unexpected end of expression")
	}

	c := p.src[p.pos]

	// Parenthesised expression
	if c == '(' {
		p.pos++
		v, err := p.parseOr()
		if err != nil {
			return 0, err
		}
		if err := p.expect(')'); err != nil {
			return 0, err
		}
		return v, nil
	}

	// Numeric literal
	if c >= '0' && c <= '9' || c == '.' {
		return p.parseNumber()
	}

	// Identifier: built-in function or tag reference
	if unicode.IsLetter(rune(c)) || c == '_' {
		return p.parseIdentOrFunc()
	}

	return 0, fmt.Errorf("expr: unexpected character %q at pos %d", c, p.pos)
}

func (p *parser) parseNumber() (float64, error) {
	start := p.pos
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if (c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-' {
			p.pos++
		} else {
			break
		}
	}
	return strconv.ParseFloat(p.src[start:p.pos], 64)
}

func (p *parser) parseIdentOrFunc() (float64, error) {
	start := p.pos
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if unicode.IsLetter(rune(c)) || c == '_' || c == '.' || (c >= '0' && c <= '9') {
			p.pos++
		} else {
			break
		}
	}
	name := p.src[start:p.pos]

	p.skipWS()
	if p.pos < len(p.src) && p.src[p.pos] == '(' {
		return p.callBuiltin(name)
	}

	// Tag reference
	v, ok := p.lookup(name)
	if !ok {
		return 0, fmt.Errorf("expr: unknown tag %q", name)
	}
	return v, nil
}

func (p *parser) callBuiltin(name string) (float64, error) {
	p.pos++ // consume '('
	var args []float64
	for {
		p.skipWS()
		if p.peek() == ')' {
			p.consume()
			break
		}
		if len(args) > 0 {
			if p.peek() != ',' {
				return 0, fmt.Errorf("expr: expected ',' in argument list")
			}
			p.consume()
		}
		v, err := p.parseOr()
		if err != nil {
			return 0, err
		}
		args = append(args, v)
	}

	switch strings.ToLower(name) {
	case "average", "avg":
		if len(args) == 0 {
			return 0, fmt.Errorf("expr: Average requires at least 1 argument")
		}
		sum := 0.0
		for _, a := range args {
			sum += a
		}
		return sum / float64(len(args)), nil

	case "min":
		if len(args) == 0 {
			return 0, fmt.Errorf("expr: Min requires at least 1 argument")
		}
		m := args[0]
		for _, a := range args[1:] {
			if a < m {
				m = a
			}
		}
		return m, nil

	case "max":
		if len(args) == 0 {
			return 0, fmt.Errorf("expr: Max requires at least 1 argument")
		}
		m := args[0]
		for _, a := range args[1:] {
			if a > m {
				m = a
			}
		}
		return m, nil

	case "sum":
		s := 0.0
		for _, a := range args {
			s += a
		}
		return s, nil

	case "if":
		if len(args) != 3 {
			return 0, fmt.Errorf("expr: If(cond,then,else) requires 3 arguments")
		}
		if args[0] != 0 {
			return args[1], nil
		}
		return args[2], nil

	case "clamp":
		if len(args) != 3 {
			return 0, fmt.Errorf("expr: Clamp(val,min,max) requires 3 arguments")
		}
		v := args[0]
		if v < args[1] {
			return args[1], nil
		}
		if v > args[2] {
			return args[2], nil
		}
		return v, nil

	case "abs":
		if len(args) != 1 {
			return 0, fmt.Errorf("expr: Abs requires 1 argument")
		}
		return math.Abs(args[0]), nil

	case "round":
		if len(args) != 1 {
			return 0, fmt.Errorf("expr: Round requires 1 argument")
		}
		return math.Round(args[0]), nil

	case "sqrt":
		if len(args) != 1 {
			return 0, fmt.Errorf("expr: Sqrt requires 1 argument")
		}
		return math.Sqrt(args[0]), nil

	default:
		return 0, fmt.Errorf("expr: unknown function %q", name)
	}
}
