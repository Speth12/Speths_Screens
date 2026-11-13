package project

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"

	screens "github.com/Speth12/Speths_Screens"
)

// Setting describes one widget setting for someone building a screen without the editor (an AI
// client through MCP): its JSON type, the values it may take when they are a fixed list, and what it
// does, all from schema.json.
type Setting struct {
	Type   string   `json:"type,omitempty"`
	Values []string `json:"values,omitempty"`
	About  string   `json:"about,omitempty"`
}

// WidgetInfo is a widget type's own settings (not the frame settings every widget has).
type WidgetInfo struct {
	Type     string             `json:"type"`
	Settings map[string]Setting `json:"settings"`
}

type infoNode struct {
	Ref         string              `json:"$ref"`
	Type        any                 `json:"type"`
	Enum        []any               `json:"enum"`
	Description string              `json:"description"`
	Items       *infoNode           `json:"items"`
	Properties  map[string]infoNode `json:"properties"`
	AllOf       []infoNode          `json:"allOf"`
	OneOf       []infoNode          `json:"oneOf"`
	Const       string              `json:"const"`
	Required    []string            `json:"required"`
}

// WidgetSettingsInfo lists every widget type with its own settings described, and the frame
// settings every widget has.
func WidgetSettingsInfo() ([]WidgetInfo, map[string]Setting, error) {
	i, err := settingsInfo()
	return i.types, i.frame, err
}

type infoTables struct {
	types []WidgetInfo
	frame map[string]Setting
}

var settingsInfo = sync.OnceValues(func() (infoTables, error) {
	var types []WidgetInfo
	var s struct {
		Defs map[string]infoNode `json:"$defs"`
	}
	if err := json.Unmarshal(screens.SchemaJSON, &s); err != nil {
		return infoTables{}, fmt.Errorf("schema.json: %w", err)
	}
	ref := func(r string) string { return strings.TrimPrefix(r, "#/$defs/") }
	var describe func(n infoNode) Setting
	describe = func(n infoNode) Setting {
		out := Setting{About: n.Description}
		if n.Ref != "" {
			def := s.Defs[ref(n.Ref)]
			inner := describe(def)
			if out.About == "" {
				out.About = inner.About
			}
			if strings.Contains(inner.Type, "*") {
				out.About = strings.TrimSpace(out.About + " (fields marked * are required)")
			}
			out.Type, out.Values = inner.Type, inner.Values
			if out.Type == "" {
				out.Type = "object (" + ref(n.Ref) + ")"
			}
			return out
		}
		if t, ok := n.Type.(string); ok {
			out.Type = t
		}
		// An object says which fields it has, a required one marked *, so its form can be written
		// without the editor.
		if out.Type == "object" && len(n.Properties) > 0 {
			required := map[string]bool{}
			for _, k := range n.Required {
				required[k] = true
			}
			keys := make([]string, 0, len(n.Properties))
			for k := range n.Properties {
				if required[k] {
					k += "*"
				}
				keys = append(keys, k)
			}
			sort.Strings(keys)
			out.Type = "object {" + strings.Join(keys, ", ") + "}"
		}
		if out.Type == "array" && n.Items != nil {
			item := describe(*n.Items)
			out.Type = "array of " + strings.TrimSpace(item.Type)
			if item.Values != nil {
				out.Values = item.Values
			}
		}
		for _, v := range n.Enum {
			out.Values = append(out.Values, fmt.Sprint(v))
		}
		return out
	}
	frameDef := s.Defs["FrameProps"]
	frame := map[string]Setting{}
	for k, n := range frameDef.Properties {
		frame[k] = describe(n)
	}
	for _, branch := range s.Defs["TypedProps"].OneOf {
		typ := branch.Properties["type"].Const
		def := s.Defs[ref(branch.Properties["props"].Ref)]
		own := map[string]Setting{}
		for k, n := range def.Properties {
			own[k] = describe(n)
		}
		if typ == string(Symbol) {
			sid := own["symbolId"]
			sid.Values = SymbolIDs
			own["symbolId"] = sid
		}
		types = append(types, WidgetInfo{Type: typ, Settings: own})
	}
	sort.Slice(types, func(i, j int) bool { return types[i].Type < types[j].Type })
	return infoTables{types: types, frame: frame}, nil
})

// IsSymbol reports whether a symbol widget can draw this symbol id.
func IsSymbol(id string) bool {
	for _, s := range SymbolIDs {
		if s == id {
			return true
		}
	}
	return false
}
