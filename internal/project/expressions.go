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
			if _, err := expr.Compile(t.Expr); err != nil {
				out = append(out, fmt.Sprintf("datasource %q, calculated tag %s: %s", ds.ID, t.Path, err))
			}
		}
	}
	for _, r := range p.AlarmRules {
		if _, err := expr.Compile(r.Expr); err != nil {
			out = append(out, fmt.Sprintf("alarm rule %q: %s", r.ID, err))
		}
	}
	drives := func(where string, dynamics map[string]Drive, params []string) {
		names := make([]string, 0, len(dynamics))
		for name := range dynamics {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if problem := driveProblem(dynamics[name].Expr, params); problem != "" {
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
func driveProblem(src string, params []string) string {
	if params == nil {
		if _, err := expr.Compile(src); err != nil {
			return err.Error()
		}
		return ""
	}
	e, err := expr.CompileTemplate(src)
	if err != nil {
		return err.Error()
	}
	for _, name := range e.Params {
		if !slices.Contains(params, name) {
			return fmt.Sprintf("{%s} is not a parameter of this faceplate", name)
		}
	}
	return ""
}
