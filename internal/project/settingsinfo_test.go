package project

import (
	"strings"
	"testing"
)

func TestWidgetSettingsInfo(t *testing.T) {
	types, frame, err := WidgetSettingsInfo()
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]WidgetInfo{}
	for _, w := range types {
		by[w.Type] = w
	}
	tests := []struct {
		name, typ, key string
		want           func(Setting) bool
	}{
		{"a fixed list of values", "shape", "kind", func(s Setting) bool { return strings.Join(s.Values, ",") == "rectangle,ellipse,line" }},
		{"a format in its description", "pipe", "points", func(s Setting) bool { return s.Type == "string" && strings.Contains(s.About, "x,y pairs") }},
		{"the symbols there are", "symbol", "symbolId", func(s Setting) bool { return len(s.Values) == len(SymbolIDs) && strings.Contains(strings.Join(s.Values, ","), "centrifugal-pump") }},
		{"a number", "gauge", "max", func(s Setting) bool { return s.Type == "number" }},
		{"a list of objects says their fields", "trend", "tags", func(s Setting) bool {
			return strings.HasPrefix(s.Type, "array of object {") && strings.Contains(s.Type, "binding*") && strings.Contains(s.Type, "color*") && strings.Contains(s.Type, "label,")
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s, ok := by[tc.typ].Settings[tc.key]
			if !ok || !tc.want(s) {
				t.Errorf("%s.%s = %+v", tc.typ, tc.key, s)
			}
		})
	}
	if len(types) != 26 {
		t.Errorf("%d widget types", len(types))
	}
	if _, ok := frame["label"]; !ok {
		t.Error("the frame settings have no label")
	}
	if _, own := by["gauge"].Settings["label"]; own {
		t.Error("frame settings are listed with each type")
	}
	if !IsSymbol("centrifugal-pump") || IsSymbol("pump") {
		t.Error("IsSymbol")
	}
}
