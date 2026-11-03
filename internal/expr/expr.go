// Package expr is the Speth's Screens expression language: a small,
// side-effect-free subset of JavaScript syntax used by driven properties,
// calculated tags and alarm conditions. An expression is parsed once by
// Compile and evaluated on each tag update; nothing is handed to eval.
//
// packages/expr is the TypeScript twin. Both are held to the golden cases
// in testdata/expr, so the IDE, the operator screen and the runtime give
// the same result for the same expression.
//
// Tags are written in braces ({ns:Tank1/Level}, {opcua:ns=6;s=X}); value
// is the widget's own tag. A result is a float64, bool or string, or
// unknown with a reason: a Bad or missing input, division by zero, or a
// type mismatch. && || and ?: evaluate only the side they need, so
// good({x}) && {x} > 5 is false, not unknown, while {x} is Bad.
package expr

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

// Input is a tag value with its quality ("Good", "Uncertain" or "Bad").
// Good and Uncertain values are used; Bad ones make the result unknown.
type Input struct {
	Value   any
	Quality string
}

// Env supplies tag values. Tag looks up a reference as written between
// the braces ("ns:Tank1/Level"); Value is the widget's own tag and is nil
// where there is none (calculated tags, alarms).
type Env struct {
	Tag   func(ref string) (Input, bool)
	Value func() (Input, bool)
}

// Expr is a compiled expression.
type Expr struct {
	root node
	// Refs lists the tags the expression reads, in order of first use,
	// as written between the braces.
	Refs []string
	// UsesValue is true when the expression reads value.
	UsesValue bool
	// Params lists the faceplate parameters ({name}) a template reads, in
	// order of first use. Always empty for Compile.
	Params []string
}

// Compile parses src. The error reads like "unexpected \")\" at column 6".
func Compile(src string) (*Expr, error) { return compile(src, false) }

// CompileTemplate parses an expression inside a faceplate, where {name}
// (a name, no colon) is one of the faceplate's parameters. The faceplate
// fills them in with tag paths before the expression is evaluated; a
// parameter evaluated as it is has no value.
func CompileTemplate(src string) (*Expr, error) { return compile(src, true) }

func compile(src string, params bool) (*Expr, error) {
	if utf8.RuneCountInString(src) > MaxLength {
		return nil, fmt.Errorf("expression longer than %d characters", MaxLength)
	}
	if strings.Trim(src, " \t\n\r") == "" { // the whitespace the lexer skips
		return nil, fmt.Errorf("empty expression")
	}
	toks, err := lex([]rune(src), params)
	if err != nil {
		return nil, err
	}
	p := &parser{toks: toks, seen: map[string]bool{}}
	root, err := p.parseExpr()
	if err != nil {
		return nil, err
	}
	if t := p.peek(); t.kind != tEOF {
		return nil, unexpected(t)
	}
	refs, ps := p.refs, p.params
	if refs == nil {
		refs = []string{}
	}
	if ps == nil {
		ps = []string{}
	}
	return &Expr{root: root, Refs: refs, UsesValue: p.value, Params: ps}, nil
}

// Eval evaluates the expression. It returns the value (float64, bool or
// string), or a non-empty reason when the result is unknown.
func (e *Expr) Eval(env Env) (any, string) {
	return e.root.eval(&env)
}

// ── nodes ───────────────────────────────────────────────────────────────────

type node interface {
	eval(env *Env) (any, string)
}

type litNode struct{ v any }

func (n *litNode) eval(*Env) (any, string) { return n.v, "" }

type refNode struct {
	key   string // between the braces; empty for value
	value bool
}

// lookup returns the input, or a reason when there is none.
func (n *refNode) lookup(env *Env) (Input, string) {
	if n.value {
		if env.Value == nil {
			return Input{}, "no widget value here"
		}
		in, ok := env.Value()
		if !ok {
			return Input{}, "input value has no value"
		}
		return in, ""
	}
	if env.Tag == nil {
		return Input{}, n.name() + " has no value"
	}
	in, ok := env.Tag(n.key)
	if !ok {
		return Input{}, n.name() + " has no value"
	}
	return in, ""
}

func (n *refNode) name() string {
	if n.value {
		return "input value"
	}
	return "input {" + n.key + "}"
}

func (n *refNode) eval(env *Env) (any, string) {
	in, why := n.lookup(env)
	if why != "" {
		return nil, why
	}
	if in.Quality == "Bad" {
		return nil, n.name() + " is Bad"
	}
	v, ok := normalize(in.Value)
	switch {
	case in.Value == nil:
		return nil, n.name() + " has no value"
	case !ok:
		return nil, n.name() + " has an unsupported value"
	}
	if f, isNum := v.(float64); isNum && (math.IsNaN(f) || math.IsInf(f, 0)) {
		return nil, n.name() + " is not a finite number"
	}
	return v, ""
}

// good reports whether the input is there and Good.
func (n *refNode) good(env *Env) bool {
	in, why := n.lookup(env)
	return why == "" && in.Quality == "Good" && in.Value != nil
}

// normalize turns a driver value into float64, bool or string.
func normalize(v any) (any, bool) {
	switch x := v.(type) {
	case float64, bool, string:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8:
		return float64(x), true
	case int16:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint8:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return nil, false
}

type unaryNode struct {
	op string
	x  node
}

func (n *unaryNode) eval(env *Env) (any, string) {
	v, why := n.x.eval(env)
	if why != "" {
		return nil, why
	}
	if n.op == "!" {
		return !truthy(v), ""
	}
	f, ok := num(v)
	if !ok {
		return nil, "- needs a number, got " + typeName(v)
	}
	return -f, ""
}

type logicNode struct {
	or   bool
	l, r node
}

func (n *logicNode) eval(env *Env) (any, string) {
	l, why := n.l.eval(env)
	if why != "" {
		return nil, why
	}
	if truthy(l) == n.or {
		return n.or, ""
	}
	r, why := n.r.eval(env)
	if why != "" {
		return nil, why
	}
	return truthy(r), ""
}

type condNode struct{ c, a, b node }

func (n *condNode) eval(env *Env) (any, string) {
	c, why := n.c.eval(env)
	if why != "" {
		return nil, why
	}
	if truthy(c) {
		return n.a.eval(env)
	}
	return n.b.eval(env)
}

type binNode struct {
	op   string
	l, r node
}

func (n *binNode) eval(env *Env) (any, string) {
	l, why := n.l.eval(env)
	if why != "" {
		return nil, why
	}
	r, why := n.r.eval(env)
	if why != "" {
		return nil, why
	}
	switch n.op {
	case "==":
		return equal(l, r), ""
	case "!=":
		return !equal(l, r), ""
	case "<", "<=", ">", ">=":
		c, why := compare(l, r)
		if why != "" {
			return nil, why
		}
		switch n.op {
		case "<":
			return c < 0, ""
		case "<=":
			return c <= 0, ""
		case ">":
			return c > 0, ""
		}
		return c >= 0, ""
	case "+":
		_, ls := l.(string)
		_, rs := r.(string)
		if ls || rs {
			return toString(l) + toString(r), ""
		}
	}
	a, aok := num(l)
	b, bok := num(r)
	if !aok || !bok {
		bad := l
		if aok {
			bad = r
		}
		return nil, n.op + " needs numbers, got " + typeName(bad)
	}
	var v float64
	switch n.op {
	case "+":
		v = a + b
	case "-":
		v = a - b
	case "*":
		v = a * b
	case "/", "%":
		if b == 0 {
			return nil, "division by zero"
		}
		if n.op == "/" {
			v = a / b
		} else {
			v = math.Mod(a, b)
		}
	}
	return finite(v)
}

type callNode struct {
	name string
	fn   *function
	args []node
}

func (n *callNode) eval(env *Env) (any, string) {
	if n.fn.tag {
		return n.args[0].(*refNode).good(env), ""
	}
	vals := make([]any, len(n.args))
	for i, a := range n.args {
		v, why := a.eval(env)
		if why != "" {
			return nil, why
		}
		vals[i] = v
	}
	return n.fn.eval(n.name, vals)
}

// ── value rules ─────────────────────────────────────────────────────────────

// num reads a number; booleans count as 0 and 1, because PLC BOOLs arrive
// as either.
func num(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

func truthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	}
	return false
}

func typeName(v any) string {
	switch v.(type) {
	case float64:
		return "number"
	case bool:
		return "boolean"
	}
	return "string"
}

// equal never converts between strings and numbers.
func equal(l, r any) bool {
	ls, lStr := l.(string)
	rs, rStr := r.(string)
	if lStr || rStr {
		return lStr && rStr && ls == rs
	}
	a, _ := num(l)
	b, _ := num(r)
	return a == b
}

// compare orders two numbers (booleans count) or two strings by code point.
func compare(l, r any) (int, string) {
	ls, lStr := l.(string)
	rs, rStr := r.(string)
	if lStr && rStr {
		return strings.Compare(ls, rs), "" // UTF-8 byte order is code point order
	}
	if lStr || rStr {
		return 0, "cannot compare " + typeName(l) + " with " + typeName(r)
	}
	a, _ := num(l)
	b, _ := num(r)
	switch {
	case a < b:
		return -1, ""
	case a > b:
		return 1, ""
	}
	return 0, ""
}

func finite(v float64) (any, string) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil, "result is not a finite number"
	}
	return v, ""
}

func toString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case bool:
		if x {
			return "true"
		}
		return "false"
	}
	return numString(v.(float64))
}
