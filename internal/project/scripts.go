package project

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/dop251/goja"
)

// The format 4 checks (Phase 4): memory tags, session variables and
// runtime scripts. The IDE's expressionProblems gives the same lines,
// except for syntax errors, whose wording comes from each side's parser.

var sessionName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// stateProblems checks memory tags and session variables: unique names and
// initial values of their type.
func stateProblems(p *Project) []string {
	var out []string
	for _, ds := range p.Datasources {
		if ds.ID+":" == SessionPrefix {
			out = append(out, fmt.Sprintf("datasource %q: the id is kept for session variables", ds.ID))
		}
		seen := map[string]bool{}
		for _, t := range ds.Config.MemoryTags {
			where := fmt.Sprintf("datasource %q, memory tag %s", ds.ID, t.Path)
			if seen[t.Path] {
				out = append(out, where+": the path is used twice")
			}
			seen[t.Path] = true
			if problem := typeProblem(t.Type, t.Initial); problem != "" {
				out = append(out, where+": "+problem)
			}
		}
	}
	seen := map[string]bool{}
	for _, v := range p.SessionVars {
		where := fmt.Sprintf("session variable %q", v.Name)
		switch {
		case !sessionName.MatchString(v.Name):
			out = append(out, where+": a name is letters, digits and _, not starting with a digit")
		case seen[v.Name]:
			out = append(out, where+": the name is used twice")
		}
		seen[v.Name] = true
		if problem := typeProblem(v.Type, v.Initial); problem != "" {
			out = append(out, where+": "+problem)
		}
	}
	return out
}

// typeProblem says why an initial value is not of type t, or "".
func typeProblem(t Type, initial *TransformValue) string {
	if initial == nil {
		return ""
	}
	ok := false
	switch t {
	case Bool:
		ok = initial.Bool != nil
	case Int:
		ok = initial.Double != nil && *initial.Double == math.Trunc(*initial.Double)
	case Real:
		ok = initial.Double != nil
	case String:
		ok = initial.String != nil
	}
	if ok {
		return ""
	}
	return fmt.Sprintf("initial %s is not of type %s", showValue(initial), t)
}

// showValue writes a value as JavaScript would: text quoted, numbers and
// flags as they are.
func showValue(v *TransformValue) string {
	switch {
	case v.String != nil:
		return strconv.Quote(*v.String)
	case v.Bool != nil:
		return strconv.FormatBool(*v.Bool)
	case v.Double != nil:
		return strconv.FormatFloat(*v.Double, 'f', -1, 64)
	}
	return "null"
}

// scriptProblems checks runtime scripts: unique ids, triggers naming known
// datasources and alarm rules, and source that parses.
func scriptProblems(p *Project) []string {
	var out []string
	datasources := map[string]bool{"ns": true}
	for _, ds := range p.Datasources {
		datasources[ds.ID] = true
	}
	rules := map[string]bool{}
	for _, r := range p.AlarmRules {
		rules[r.ID] = true
	}
	seen := map[string]bool{}
	for _, s := range p.Scripts {
		where := fmt.Sprintf("script %q", s.ID)
		if seen[s.ID] {
			out = append(out, where+": the id is used twice")
		}
		seen[s.ID] = true
		for _, path := range s.Trigger.OnChange {
			ds, _, ok := strings.Cut(path, ":")
			if !ok || !datasources[ds] {
				out = append(out, fmt.Sprintf("%s: onChange: %s names no datasource", where, path))
			}
		}
		for _, id := range s.Trigger.OnAlarm {
			if !rules[id] {
				out = append(out, fmt.Sprintf("%s: onAlarm: no alarm rule %q", where, id))
			}
		}
		if problem := SyntaxProblem(s.Source); problem != "" {
			out = append(out, where+": "+problem)
		}
	}
	return out
}

// gojaPos is where goja reports a syntax error: "Line 2:7 ".
var gojaPos = regexp.MustCompile(`Line (\d+):(\d+) `)

// SyntaxProblem parses a runtime script as it runs, inside an async
// function (so top-level await and return work), and says where it fails:
// "line 1, column 7: Unexpected token {". "" when it parses.
func SyntaxProblem(source string) string {
	_, err := goja.Compile("script", "(async function () {\n"+source+"\n})", false)
	if err == nil {
		return ""
	}
	msg := err.Error()
	msg = strings.TrimPrefix(msg, "SyntaxError: ")
	msg = strings.TrimPrefix(msg, "script: ")
	if i := strings.Index(msg, " (and "); i >= 0 {
		msg = msg[:i]
	}
	if m := gojaPos.FindStringSubmatchIndex(msg); m != nil {
		line, _ := strconv.Atoi(msg[m[2]:m[3]])
		col := msg[m[4]:m[5]]
		msg = fmt.Sprintf("line %d, column %s: %s", line-1, col, msg[m[1]:])
	}
	return msg
}
