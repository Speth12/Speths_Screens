package project

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	screens "github.com/Speth12/Speths_Screens"
)

// SchemaError is project JSON that does not follow schema.json. Problems
// are written for people: "page "Main", widget w1 (gauge): unknown setting
// momentary". The IDE's validateProject gives the same lines.
type SchemaError struct {
	Problems []string
}

func (e *SchemaError) Error() string {
	if len(e.Problems) == 1 {
		return "project does not follow schema.json: " + e.Problems[0]
	}
	return fmt.Sprintf("project does not follow schema.json (%d problems): %s", len(e.Problems), strings.Join(e.Problems, "; "))
}

var compiled = sync.OnceValues(func() (*jsonschema.Schema, error) {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(screens.SchemaJSON))
	if err != nil {
		return nil, fmt.Errorf("schema.json: %w", err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource("schema.json", doc); err != nil {
		return nil, fmt.Errorf("schema.json: %w", err)
	}
	return c.Compile("schema.json")
})

// ValidateJSON checks project JSON in the current format against schema.json.
func ValidateJSON(data []byte) error {
	sch, err := compiled()
	if err != nil {
		return err
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("unmarshal project: %w", err)
	}
	err = sch.Validate(inst)
	var ve *jsonschema.ValidationError
	if err == nil || !errors.As(err, &ve) {
		return err
	}
	var problems []string
	for _, leaf := range inDocumentOrder(leaves(ve), keyOrder(data)) {
		if _, ok := leaf.ErrorKind.(*kind.PropertyNames); ok {
			continue // drivenNameProblems names them, with the right location
		}
		p := describe(inst, leaf)
		if !slices.Contains(problems, p) {
			problems = append(problems, p)
		}
	}
	for _, p := range drivenNameProblems(inst) {
		if !slices.Contains(problems, p) {
			problems = append(problems, p)
		}
	}
	return &SchemaError{Problems: problems}
}

// drivenNameProblems names every driven property a widget's type cannot
// drive, in widget order and then by name. The schema library reports
// these too, but with a wrong location.
func drivenNameProblems(inst any) []string {
	allowed, err := drivenKeys()
	if err != nil {
		return []string{err.Error()}
	}
	root, _ := inst.(map[string]any)
	var out []string
	for _, owner := range []string{"pages", "faceplates", "presets"} {
		for i, o := range objects(root[owner]) {
			for j, w := range objects(o["widgets"]) {
				dyn, _ := w["dynamics"].(map[string]any)
				names := make([]string, 0, len(dyn))
				for name := range dyn {
					if !allowed[str(w["type"])][name] {
						names = append(names, name)
					}
				}
				sort.Strings(names)
				where, _ := locate(inst, []string{owner, strconv.Itoa(i), "widgets", strconv.Itoa(j)})
				for _, name := range names {
					out = append(out, where+": dynamics: cannot drive "+name)
				}
			}
		}
	}
	return out
}

// leaves returns the errors at the bottom of the tree, skipping the oneOf
// branches for other widget types (each fails on its type constant).
func leaves(ve *jsonschema.ValidationError) []*jsonschema.ValidationError {
	// A bad property name stops here: drivenNameProblems describes it.
	if _, ok := ve.ErrorKind.(*kind.PropertyNames); ok || len(ve.Causes) == 0 {
		return []*jsonschema.ValidationError{ve}
	}
	causes := ve.Causes
	if _, ok := ve.ErrorKind.(*kind.OneOf); ok {
		var right []*jsonschema.ValidationError
		for _, c := range causes {
			if !wrongTypeBranch(c) {
				right = append(right, c)
			}
		}
		if len(right) > 0 {
			causes = right
		}
	}
	var out []*jsonschema.ValidationError
	for _, c := range causes {
		out = append(out, leaves(c)...)
	}
	return out
}

// inDocumentOrder puts each run of unknown-property errors on the same
// object into the order the keys appear in the document. The schema
// library finds them by walking a map, so their order changes from run to
// run; the IDE's validator lists them in document order.
func inDocumentOrder(leaves []*jsonschema.ValidationError, order map[string]int) []*jsonschema.ValidationError {
	unknownOn := func(ve *jsonschema.ValidationError) (string, bool) {
		if _, ok := ve.ErrorKind.(*kind.FalseSchema); !ok || len(ve.InstanceLocation) == 0 {
			return "", false
		}
		return pointer(ve.InstanceLocation[:len(ve.InstanceLocation)-1]), true
	}
	for i := 0; i < len(leaves); {
		parent, ok := unknownOn(leaves[i])
		j := i + 1
		for ok && j < len(leaves) {
			if p, ok2 := unknownOn(leaves[j]); !ok2 || p != parent {
				break
			}
			j++
		}
		run := leaves[i:j]
		sort.SliceStable(run, func(a, b int) bool {
			return order[pointer(run[a].InstanceLocation)] < order[pointer(run[b].InstanceLocation)]
		})
		i = j
	}
	return leaves
}

// keyOrder maps the JSON pointer of every object member in data to its
// position within its object.
func keyOrder(data []byte) map[string]int {
	order := map[string]int{}
	dec := json.NewDecoder(bytes.NewReader(data))
	var walk func(path []string) error
	walk = func(path []string) error {
		tok, err := dec.Token()
		if err != nil {
			return err
		}
		switch tok {
		case json.Delim('{'):
			for i := 0; dec.More(); i++ {
				key, err := dec.Token()
				if err != nil {
					return err
				}
				k, _ := key.(string)
				member := append(append([]string{}, path...), k)
				order[pointer(member)] = i
				if err := walk(member); err != nil {
					return err
				}
			}
			_, err = dec.Token() // }
		case json.Delim('['):
			for i := 0; dec.More(); i++ {
				if err := walk(append(append([]string{}, path...), strconv.Itoa(i))); err != nil {
					return err
				}
			}
			_, err = dec.Token() // ]
		}
		return err
	}
	_ = walk(nil) // the document already parsed once; a failure only loses the order
	return order
}

func pointer(loc []string) string { return "/" + strings.Join(loc, "/") }

// wrongTypeBranch reports whether a oneOf branch failed because the widget
// is another type.
func wrongTypeBranch(ve *jsonschema.ValidationError) bool {
	if _, ok := ve.ErrorKind.(*kind.Const); ok && len(ve.InstanceLocation) > 0 && ve.InstanceLocation[len(ve.InstanceLocation)-1] == "type" {
		return true
	}
	for _, c := range ve.Causes {
		if wrongTypeBranch(c) {
			return true
		}
	}
	return false
}

var printer = message.NewPrinter(language.English)

// describe writes one problem, naming the page and widget it is in.
func describe(inst any, ve *jsonschema.ValidationError) string {
	where, rest := locate(inst, ve.InstanceLocation)
	var what string
	switch k := ve.ErrorKind.(type) {
	case *kind.FalseSchema:
		// An unevaluated (unknown) property.
		if len(rest) >= 2 && rest[len(rest)-2] == "props" {
			what = "unknown setting " + rest[len(rest)-1]
			rest = rest[:len(rest)-2]
		} else if len(rest) > 0 {
			what = "unknown field " + rest[len(rest)-1]
			rest = rest[:len(rest)-1]
		} else {
			what = "not allowed"
		}
	case *kind.AdditionalProperties:
		what = "unknown field " + strings.Join(k.Properties, ", ")
	default:
		what = ve.ErrorKind.LocalizedString(printer)
	}
	if len(rest) > 0 {
		what = strings.Join(rest, ".") + ": " + what
	}
	if where == "" {
		return what
	}
	return where + ": " + what
}

// locate names the page, faceplate or preset and the widget a location is in,
// and returns the rest of the location within it.
func locate(inst any, loc []string) (string, []string) {
	root, _ := inst.(map[string]any)
	owners := map[string]string{"pages": "page", "faceplates": "faceplate", "presets": "preset"}
	if kindName, ok := owners[loc0(loc)]; ok && len(loc) >= 4 && loc[2] == "widgets" {
		owner := item(root[loc[0]], loc[1])
		w := item(owner["widgets"], loc[3])
		id := w["id"]
		if loc[0] == "faceplates" {
			id = w["localId"]
		}
		return fmt.Sprintf("%s %q, widget %v (%v)", kindName, str(owner["name"]), id, w["type"]), loc[4:]
	}
	if len(loc) == 0 {
		return "", nil
	}
	return "/" + strings.Join(loc, "/"), nil
}

func loc0(loc []string) string {
	if len(loc) == 0 {
		return ""
	}
	return loc[0]
}

func item(list any, index string) map[string]any {
	l, _ := list.([]any)
	i, err := strconv.Atoi(index)
	if err != nil || i < 0 || i >= len(l) {
		return nil
	}
	m, _ := l[i].(map[string]any)
	return m
}
