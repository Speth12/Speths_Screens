package project

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/expr"
)

// ExpressionError is a project whose expressions do not compile. Problems
// read like schema problems: "page "Main", widget w1 (gauge):
// dynamics.bgColor: unknown function avrg at column 1". The IDE's
// expressionProblems gives the same lines.
type ExpressionError struct {
	Problems []string
}

func (e *ExpressionError) Error() string {
	if len(e.Problems) == 1 {
		return "project has an expression problem: " + e.Problems[0]
	}
	return fmt.Sprintf("project has %d expression problems: %s", len(e.Problems), strings.Join(e.Problems, "; "))
}

// ExpressionProblems compiles every expression in a project that follows
// schema.json: calculated tags, alarm rules, then the driven properties of page,
// faceplate and preset widgets (by property name). A faceplate widget's
// expressions are templates, and may read only the faceplate's parameters.
func ExpressionProblems(p *Project) []string {
	var out []string
	for _, ds := range p.Datasources {
		for _, t := range ds.Config.Tags {
			if problem := runtimeExprProblem(t.Expr); problem != "" {
				out = append(out, fmt.Sprintf("datasource %q, calculated tag %s: %s", ds.ID, t.Path, problem))
			}
		}
	}
	for _, r := range p.AlarmRules {
		if problem := runtimeExprProblem(r.Expr); problem != "" {
			out = append(out, fmt.Sprintf("alarm rule %q: %s", r.ID, problem))
		}
	}
	session := map[string]bool{}
	for _, v := range p.SessionVars {
		session[v.Name] = true
	}
	out = append(out, stateProblems(p)...)
	out = append(out, scriptProblems(p)...)
	drives := func(where string, dynamics map[string]Drive, params []string) {
		names := make([]string, 0, len(dynamics))
		for name := range dynamics {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if problem := driveProblem(dynamics[name].Expr, params, session); problem != "" {
				out = append(out, fmt.Sprintf("%s: dynamics.%s: %s", where, name, problem))
			}
		}
	}
	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			drives(fmt.Sprintf("page %q, widget %s (%s)", pg.Name, w.ID, w.Type), w.Dynamics, nil)
		}
	}
	for _, fp := range p.Faceplates {
		params := []string{}
		for _, prm := range fp.Params {
			params = append(params, prm.Name)
		}
		for _, w := range fp.Widgets {
			drives(fmt.Sprintf("faceplate %q, widget %s (%s)", fp.Name, w.LocalID, w.Type), w.Dynamics, params)
		}
	}
	for _, ps := range p.Presets {
		for _, w := range ps.Widgets {
			drives(fmt.Sprintf("preset %q, widget %s (%s)", ps.Name, w.ID, w.Type), w.Dynamics, nil)
		}
	}
	return out
}

// driveProblem compiles one driven property's expression. params is nil
// outside a faceplate; inside one, the expression is a template.
func driveProblem(src string, params []string, session map[string]bool) string {
	compile := expr.Compile
	if params != nil {
		compile = expr.CompileTemplate
	}
	e, err := compile(src)
	if err != nil {
		return err.Error()
	}
	for _, ref := range e.Refs {
		if name, ok := strings.CutPrefix(ref, SessionPrefix); ok && !session[name] {
			return fmt.Sprintf("{%s} names no session variable", ref)
		}
	}
	for _, name := range e.Params {
		if !slices.Contains(params, name) {
			return fmt.Sprintf("{%s} is not a parameter of this faceplate", name)
		}
	}
	return ""
}

// SessionPrefix starts the tag path of a session variable, {session:name}.
// Only screens hold session variables, so "session" is not a datasource id.
const SessionPrefix = "session:"

// runtimeExprProblem compiles an expression the runtime evaluates (a
// calculated tag or an alarm rule), which cannot read session variables.
func runtimeExprProblem(src string) string {
	e, err := expr.Compile(src)
	if err != nil {
		return err.Error()
	}
	for _, ref := range e.Refs {
		if strings.HasPrefix(ref, SessionPrefix) {
			return fmt.Sprintf("{%s} is a session variable, which only screens have", ref)
		}
	}
	return ""
}
