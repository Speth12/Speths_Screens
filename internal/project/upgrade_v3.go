package project

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/Speth12/Speths_Screens/internal/expr"
)

// v2ToV3 moves calculated tags to a typed list of expressions and widget
// dynamics to driven properties (Phase 3 decisions 3, 5 and 8).
func (u *upgrader) v2ToV3(doc map[string]any) {
	u.calculatedTagsV3(doc)
	for _, pg := range objects(doc["pages"]) {
		for _, w := range objects(pg["widgets"]) {
			u.drivesV3(w, fmt.Sprintf("page %q, widget %v (%v)", str(pg["name"]), w["id"], w["type"]))
		}
	}
	for _, fp := range objects(doc["faceplates"]) {
		for _, w := range objects(fp["widgets"]) {
			u.drivesV3(w, fmt.Sprintf("faceplate %q, widget %v (%v)", str(fp["name"]), w["localId"], w["type"]))
		}
	}
	for _, ps := range objects(doc["presets"]) {
		for _, w := range objects(ps["widgets"]) {
			u.drivesV3(w, fmt.Sprintf("preset %q, widget %v (%v)", str(ps["name"]), w["id"], w["type"]))
		}
	}
}

// drivesV3 turns a widget's list of v2 dynamics into its map of driven
// properties, keeping what each kind did on screen.
func (u *upgrader) drivesV3(w map[string]any, where string) {
	list, ok := w["dynamics"].([]any)
	if !ok {
		return
	}
	drives := map[string]any{}
	props, _ := w["props"].(map[string]any)
	setProp := func(k string, v any) {
		if v == nil {
			return
		}
		if props == nil {
			props = map[string]any{}
			w["props"] = props
		}
		props[k] = v
	}
	drive := func(prop string, d map[string]any) {
		if _, dup := drives[prop]; dup {
			u.note("%s: two dynamics drive %s; kept the last", where, prop)
		}
		drives[prop] = d
	}
	for _, item := range list {
		d, _ := item.(map[string]any)
		kind := str(d["kind"])
		tag := str(d["binding"])
		if tag == "" {
			u.note("%s: dropped a %s dynamic without a tag", where, kind)
			continue
		}
		ref := tagRef(tag)
		switch kind {
		case "visibility":
			drive("visible", map[string]any{"expr": ref})
		case "disable":
			drive("disabled", map[string]any{"expr": ref})
		case "blink":
			drive("blink", map[string]any{"expr": ref})
			setProp("blinkPeriodMs", d["blinkPeriodMs"])
			setProp("blinkColor", d["blinkColor"])
		case "colorFill":
			// v2 drew a ring in these colors; the frame's border is the nearest.
			drive("borderColor", map[string]any{"expr": fmt.Sprintf("%s ? %s : %s",
				ref, jsQuote(orDefault(d["trueColor"], "#22c55e")), jsQuote(orDefault(d["falseColor"], "#3f3f46")))})
		case "rotation":
			drive("rotate", map[string]any{"expr": ref, "transform": map[string]any{
				"kind": "linear",
				"in":   []any{orDefault(d["minValue"], json.Number("0")), orDefault(d["maxValue"], json.Number("100"))},
				"out":  []any{orDefault(d["minAngle"], json.Number("-90")), orDefault(d["maxAngle"], json.Number("90"))},
			}})
		case "script":
			prop := str(orDefault(d["targetProp"], "bgColor"))
			old := str(orDefault(d["expression"], "value"))
			// In v2, value was this dynamic's tag; in v3 it is the widget's.
			e := replaceValue(RewriteJS(old), ref)
			if e != replaceValue(old, ref) {
				u.note("%s: dynamics.%s: rewrote %s as %s", where, prop, old, e)
			}
			if prop != "visible" {
				e = fmt.Sprintf("(%s) ? %s : %s", e, jsQuote(str(d["trueValue"])), jsQuote(str(d["falseValue"])))
			}
			if _, err := expr.Compile(e); err != nil {
				u.note("%s: dynamics.%s: %s; the property keeps its own setting until it is fixed", where, prop, err)
			}
			drive(prop, map[string]any{"expr": e})
		default:
			u.note("%s: dropped a dynamic of unknown kind %s", where, kind)
		}
	}
	if len(drives) == 0 {
		delete(w, "dynamics")
		return
	}
	w["dynamics"] = drives
}

// tagRef writes a v2 binding as a tag reference; faceplate bindings
// ({param}) already are one.
func tagRef(binding string) string {
	if strings.HasPrefix(binding, "{") && strings.HasSuffix(binding, "}") {
		return binding
	}
	return "{" + binding + "}"
}

// jsQuote writes s as a single-quoted string of the expression language.
func jsQuote(v any) string {
	s := str(v)
	return "'" + strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(s) + "'"
}

// replaceValue replaces the name value with ref, outside strings and tag
// references.
func replaceValue(src, ref string) string {
	var b strings.Builder
	r := []rune(src)
	isName := func(c rune) bool { return c == '_' || c == '$' || unicode.IsLetter(c) || unicode.IsDigit(c) }
	for i := 0; i < len(r); {
		switch c := r[i]; {
		case c == '"' || c == '\'' || c == '{':
			end := c
			if c == '{' {
				end = '}'
			}
			j := i + 1
			for j < len(r) && r[j] != end {
				if r[j] == '\\' && c != '{' {
					j++
				}
				j++
			}
			if j < len(r) {
				j++
			}
			b.WriteString(string(r[i:min(j, len(r))]))
			i = j
		case isName(c):
			j := i
			for j < len(r) && isName(r[j]) {
				j++
			}
			word := string(r[i:j])
			if word == "value" && (i == 0 || r[i-1] != '.') {
				b.WriteString(ref)
			} else {
				b.WriteString(word)
			}
			i = j
		default:
			b.WriteRune(c)
			i++
		}
	}
	return b.String()
}

// calculatedTagsV3 moves calculated tags from a JSON-encoded string of
// {path, formula} to a typed list of {path, expr}, rewriting common
// JavaScript into the expression language.
func (u *upgrader) calculatedTagsV3(doc map[string]any) {
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
