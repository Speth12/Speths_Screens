package project

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/Speth12/Speths_Screens/internal/expr"
)

// v2ToV3 moves calculated tags from a JSON-encoded string of
// {path, formula} to a typed list of {path, expr}, rewriting common
// JavaScript into the expression language (Phase 3 decisions 5 and 8).
func (u *upgrader) v2ToV3(doc map[string]any) {
	for _, ds := range objects(doc["datasources"]) {
		cfg, _ := ds["config"].(map[string]any)
		raw, ok := cfg["tags"].(string)
		if !ok {
			continue
		}
		where := fmt.Sprintf("datasource %q", str(ds["id"]))
		var specs []map[string]any
		dec := json.NewDecoder(bytes.NewReader([]byte(raw)))
		dec.UseNumber()
		if err := dec.Decode(&specs); err != nil {
			delete(cfg, "tags")
			u.note("%s: dropped its calculated tags, which were not valid JSON", where)
			continue
		}
		tags := make([]any, 0, len(specs))
		for _, s := range specs {
			path := str(s["path"])
			formula := str(s["formula"])
			tags = append(tags, map[string]any{"path": path, "expr": u.calcExpr(formula, str(ds["id"]), path, where)})
		}
		cfg["tags"] = tags
	}
}

// calcExpr rewrites one formula and notes what a person must check.
func (u *upgrader) calcExpr(formula, dsID, path, where string) string {
	where = fmt.Sprintf("%s, calculated tag %s", where, path)
	src := RewriteJS(formula)
	if src != formula {
		u.note("%s: rewrote %s as %s", where, formula, src)
	}
	e, err := expr.Compile(src)
	if err != nil {
		u.note("%s: %s; the tag stays Bad until the formula is fixed", where, err)
		return src
	}
	self := dsID + ":" + path
	for _, ref := range e.Refs {
		if ref == self {
			u.note("%s reads itself, so it stays Bad until it has a value; start it with (good({%s}) ? {%s} : 0)", where, self, self)
			break
		}
	}
	return src
}

var (
	jsMath    = regexp.MustCompile(`\bMath\.(abs|min|max|round|floor|ceil|sqrt|sin|cos|tan|log10|log2|log|pow|sign)\b\s*\(`)
	jsToFixed = regexp.MustCompile(`(\{[^{}]*\}|\bvalue\b|\d+(?:\.\d+)?|\([^()]*\))\.toFixed\(\s*(\d+)\s*\)`)
	jsStrict  = regexp.MustCompile(`(===|!==)`)
)

// RewriteJS rewrites the common JavaScript that old formulas and script
// dynamics used into the expression language: Math.abs(x) becomes abs(x)
// (and the other functions the language has), x.toFixed(n) becomes
// format(x, n), and === and !== become == and !=. Anything else is left
// for the expression compiler to report. The TypeScript upgrader's
// rewriteJS does the same.
func RewriteJS(src string) string {
	src = jsMath.ReplaceAllString(src, "${1}(")
	src = jsToFixed.ReplaceAllString(src, "format(${1}, ${2})")
	return jsStrict.ReplaceAllStringFunc(src, func(op string) string { return op[:2] })
}
