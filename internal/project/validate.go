package project

import (
	"bytes"
	"errors"
	"fmt"
	"slices"
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
	for _, leaf := range leaves(ve) {
		p := describe(inst, leaf)
		if !slices.Contains(problems, p) {
			problems = append(problems, p)
		}
	}
	return &SchemaError{Problems: problems}
}

// leaves returns the errors at the bottom of the tree, skipping the oneOf
// branches for other widget types (each fails on its type constant).
func leaves(ve *jsonschema.ValidationError) []*jsonschema.ValidationError {
	if len(ve.Causes) == 0 {
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
