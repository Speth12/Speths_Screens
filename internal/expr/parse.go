package expr

import (
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
)

// Limits on what Compile accepts.
const (
	MaxLength = 1000 // characters (code points)
	MaxDepth  = 32   // nested parentheses, including calls
)

type tokKind int

const (
	tEOF tokKind = iota
	tNum
	tStr
	tTag
	tParam // a faceplate parameter, {name}, in a template
	tName
	tPunct // operators, brackets and any character the language does not use
)

type token struct {
	kind tokKind
	text string // source text for tName, tTag and tPunct; the literal for tStr
	num  float64
	col  int // 1-based code point column
}

// lex splits src into tokens. It fails only on broken strings, tag
// references and numbers; any other stray character becomes a tPunct
// token, so the parser reports problems in reading order.
func lex(src []rune, params bool) ([]token, error) {
	var toks []token
	i := 0
	for i < len(src) {
		c := src[i]
		col := i + 1
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case isDigit(c):
			t, n, err := lexNumber(src, i)
			if err != nil {
				return nil, err
			}
			toks = append(toks, t)
			i = n
		case c == '"' || c == '\'':
			var b strings.Builder
			j := i + 1
			for {
				if j >= len(src) {
					return nil, fmt.Errorf("unclosed string at column %d", col)
				}
				if src[j] == c {
					break
				}
				if src[j] == '\\' {
					if j+1 >= len(src) {
						return nil, fmt.Errorf("unclosed string at column %d", col)
					}
					switch e := src[j+1]; e {
					case '\\', '"', '\'':
						b.WriteRune(e)
					case 'n':
						b.WriteRune('\n')
					case 't':
						b.WriteRune('\t')
					default:
						return nil, fmt.Errorf("unknown escape \\%c at column %d", e, j+1)
					}
					j += 2
					continue
				}
				b.WriteRune(src[j])
				j++
			}
			toks = append(toks, token{kind: tStr, text: b.String(), col: col})
			i = j + 1
		case c == '{':
			j := i + 1
			for j < len(src) && src[j] != '}' {
				j++
			}
			if j >= len(src) {
				return nil, fmt.Errorf("unclosed tag reference at column %d", col)
			}
			ref := string(src[i+1 : j])
			if params && isParamName(ref) {
				toks = append(toks, token{kind: tParam, text: ref, col: col})
				i = j + 1
				continue
			}
			if err := checkRef(ref, col); err != nil {
				return nil, err
			}
			toks = append(toks, token{kind: tTag, text: ref, col: col})
			i = j + 1
		case isNameStart(c):
			j := i + 1
			for j < len(src) && isNamePart(src[j]) {
				j++
			}
			toks = append(toks, token{kind: tName, text: string(src[i:j]), col: col})
			i = j
		default:
			if i+1 < len(src) {
				if two := string(src[i : i+2]); two == "&&" || two == "||" || two == "==" || two == "!=" || two == "<=" || two == ">=" {
					toks = append(toks, token{kind: tPunct, text: two, col: col})
					i += 2
					continue
				}
			}
			toks = append(toks, token{kind: tPunct, text: string(c), col: col})
			i++
		}
	}
	return append(toks, token{kind: tEOF, col: len(src) + 1}), nil
}

// lexNumber reads a decimal number (digits, optional fraction and
// exponent) or a 0x hexadecimal integer starting at src[i].
func lexNumber(src []rune, i int) (token, int, error) {
	col := i + 1
	j := i
	if src[i] == '0' && i+2 < len(src) && (src[i+1] == 'x' || src[i+1] == 'X') && isHex(src[i+2]) {
		j = i + 2
		for j < len(src) && isHex(src[j]) {
			j++
		}
		v, err := strconv.ParseUint(string(src[i+2:j]), 16, 64)
		if err != nil || v > 1<<53 {
			return token{}, 0, fmt.Errorf("number too large at column %d", col)
		}
		return token{kind: tNum, num: float64(v), text: string(src[i:j]), col: col}, j, nil
	}
	for j < len(src) && isDigit(src[j]) {
		j++
	}
	if j+1 < len(src) && src[j] == '.' && isDigit(src[j+1]) {
		j++
		for j < len(src) && isDigit(src[j]) {
			j++
		}
	}
	if j < len(src) && (src[j] == 'e' || src[j] == 'E') {
		k := j + 1
		if k < len(src) && (src[k] == '+' || src[k] == '-') {
			k++
		}
		if k < len(src) && isDigit(src[k]) {
			for k < len(src) && isDigit(src[k]) {
				k++
			}
			j = k
		}
	}
	text := string(src[i:j])
	v, err := strconv.ParseFloat(text, 64)
	if err != nil || math.IsInf(v, 0) {
		return token{}, 0, fmt.Errorf("number too large at column %d", col)
	}
	return token{kind: tNum, num: v, text: text, col: col}, j, nil
}

// checkRef checks the text between a tag reference's braces: ns:path or
// datasource:path, where the datasource id is letters, digits, _, - or .
func checkRef(ref string, col int) error {
	ds, path, ok := strings.Cut(ref, ":")
	if !ok || ds == "" || strings.IndexFunc(ds, func(r rune) bool { return !isNamePart(r) && r != '-' && r != '.' }) >= 0 {
		return fmt.Errorf("not a tag: {%s} (tags are written {ns:path} or {datasource:path}) at column %d", ref, col)
	}
	if path == "" {
		return fmt.Errorf("empty tag path at column %d", col)
	}
	return nil
}

// isParamName reports whether s is a faceplate parameter name: letters,
// digits and _.
func isParamName(s string) bool {
	return s != "" && strings.IndexFunc(s, func(r rune) bool { return !isNamePart(r) }) < 0
}

func isDigit(c rune) bool     { return c >= '0' && c <= '9' }
func isHex(c rune) bool       { return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') }
func isNameStart(c rune) bool { return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }
func isNamePart(c rune) bool  { return isNameStart(c) || isDigit(c) }

// ── parser ──────────────────────────────────────────────────────────────────

type parser struct {
	toks   []token
	pos    int
	depth  int
	refs   []string
	seen   map[string]bool
	value  bool // the expression reads `value`
	params []string
}

func (p *parser) peek() token { return p.toks[p.pos] }

func (p *parser) next() token {
	t := p.toks[p.pos]
	if t.kind != tEOF {
		p.pos++
	}
	return t
}

func (p *parser) is(text string) bool {
	t := p.peek()
	return t.kind == tPunct && t.text == text
}

func unexpected(t token) error {
	if t.kind == tEOF {
		return fmt.Errorf("unexpected end of expression")
	}
	switch t.kind {
	case tStr:
		return fmt.Errorf("unexpected string at column %d", t.col)
	case tTag, tParam:
		return fmt.Errorf("unexpected tag {%s} at column %d", t.text, t.col)
	}
	return fmt.Errorf("unexpected \"%s\" at column %d", t.text, t.col)
}

func (p *parser) expect(text string) error {
	if !p.is(text) {
		return unexpected(p.peek())
	}
	p.next()
	return nil
}

func (p *parser) parseExpr() (node, error) {
	c, err := p.parseOr()
	if err != nil || !p.is("?") {
		return c, err
	}
	p.next()
	a, err := p.parseExpr()
	if err != nil {
		return nil, err
	}
	if err := p.expect(":"); err != nil {
		return nil, err
	}
	b, err := p.parseExpr()
	if err != nil {
		return nil, err
	}
	return &condNode{c, a, b}, nil
}

func (p *parser) parseOr() (node, error) {
	l, err := p.parseAnd()
	for err == nil && p.is("||") {
		p.next()
		var r node
		if r, err = p.parseAnd(); err == nil {
			l = &logicNode{or: true, l: l, r: r}
		}
	}
	return l, err
}

func (p *parser) parseAnd() (node, error) {
	l, err := p.parseCmp()
	for err == nil && p.is("&&") {
		p.next()
		var r node
		if r, err = p.parseCmp(); err == nil {
			l = &logicNode{l: l, r: r}
		}
	}
	return l, err
}

func isCmp(t token) bool {
	if t.kind != tPunct {
		return false
	}
	switch t.text {
	case "==", "!=", "<", "<=", ">", ">=":
		return true
	}
	return false
}

func (p *parser) parseCmp() (node, error) {
	l, err := p.parseSum()
	if err != nil || !isCmp(p.peek()) {
		return l, err
	}
	op := p.next().text
	r, err := p.parseSum()
	if err != nil {
		return nil, err
	}
	if t := p.peek(); isCmp(t) {
		return nil, fmt.Errorf("comparisons cannot be chained at column %d", t.col)
	}
	return &binNode{op, l, r}, nil
}

func (p *parser) parseSum() (node, error) {
	l, err := p.parseProduct()
	for err == nil && (p.is("+") || p.is("-")) {
		op := p.next().text
		var r node
		if r, err = p.parseProduct(); err == nil {
			l = &binNode{op, l, r}
		}
	}
	return l, err
}

func (p *parser) parseProduct() (node, error) {
	l, err := p.parseUnary()
	for err == nil && (p.is("*") || p.is("/") || p.is("%")) {
		op := p.next().text
		var r node
		if r, err = p.parseUnary(); err == nil {
			l = &binNode{op, l, r}
		}
	}
	return l, err
}

func (p *parser) parseUnary() (node, error) {
	if p.is("!") || p.is("-") {
		op := p.next().text
		x, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		return &unaryNode{op, x}, nil
	}
	return p.parsePrimary()
}

// open enters a parenthesis at column col.
func (p *parser) open(col int) error {
	p.depth++
	if p.depth > MaxDepth {
		return fmt.Errorf("nested deeper than %d levels at column %d", MaxDepth, col)
	}
	return nil
}

func (p *parser) parsePrimary() (node, error) {
	t := p.next()
	switch t.kind {
	case tNum:
		return &litNode{t.num}, nil
	case tStr:
		return &litNode{t.text}, nil
	case tTag:
		if !p.seen[t.text] {
			p.seen[t.text] = true
			p.refs = append(p.refs, t.text)
		}
		return &refNode{key: t.text}, nil
	case tParam:
		if !slices.Contains(p.params, t.text) {
			p.params = append(p.params, t.text)
		}
		return &refNode{key: t.text}, nil
	case tName:
		switch t.text {
		case "true":
			return &litNode{true}, nil
		case "false":
			return &litNode{false}, nil
		case "value":
			p.value = true
			return &refNode{value: true}, nil
		}
		fn, known := funcs[t.text]
		if !p.is("(") {
			if known {
				return nil, fmt.Errorf("%s must be called, like %s(x) at column %d", t.text, t.text, t.col)
			}
			return nil, fmt.Errorf("unknown name %s (tags are written {ns:path}) at column %d", t.text, t.col)
		}
		if !known {
			return nil, fmt.Errorf("unknown function %s at column %d", t.text, t.col)
		}
		if err := p.open(p.next().col); err != nil {
			return nil, err
		}
		var args []node
		if !p.is(")") {
			for {
				a, err := p.parseExpr()
				if err != nil {
					return nil, err
				}
				args = append(args, a)
				if !p.is(",") {
					break
				}
				p.next()
			}
		}
		if err := p.expect(")"); err != nil {
			return nil, err
		}
		p.depth--
		if err := fn.check(t.text, args); err != nil {
			return nil, fmt.Errorf("%s at column %d", err, t.col)
		}
		return &callNode{name: t.text, fn: fn, args: args}, nil
	case tPunct:
		if t.text == "(" {
			if err := p.open(t.col); err != nil {
				return nil, err
			}
			x, err := p.parseExpr()
			if err != nil {
				return nil, err
			}
			if err := p.expect(")"); err != nil {
				return nil, err
			}
			p.depth--
			return x, nil
		}
	}
	return nil, unexpected(t)
}
