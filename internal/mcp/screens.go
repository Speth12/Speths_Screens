package mcp

// Tools that build screens: an AI client (Claude through MCP) can read the project's pages and
// widgets and add, change or delete them. Every change is made to a copy of the project running now
// and goes through the same path as a deploy from the IDE: it is validated (a change that leaves the
// project invalid is refused with the same problems the IDE shows, and nothing changes), loaded,
// saved as a new version (so it can be restored), written to the project file and audited. The MCP
// route needs project.deploy (engineer and above), as a deploy does.

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// Deployer deploys a project document as the IDE's Deploy does, under a label for its version.
type Deployer func(ctx context.Context, doc []byte, label string) error

// doc is the project as JSON objects, so a tool can change any part of it the schema allows.
type doc = map[string]any

func (h *Handler) current() (doc, error) {
	p := h.rt.Project()
	if p == nil {
		return nil, fmt.Errorf("no project is loaded; deploy one from the IDE first")
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	var d doc
	return d, json.Unmarshal(raw, &d)
}

// change applies edit to a copy of the running project and deploys it.
func (h *Handler) change(ctx context.Context, label string, edit func(d doc) (string, error)) (string, bool, error) {
	if h.deploy == nil {
		return "", true, fmt.Errorf("this runtime cannot change its project through MCP")
	}
	d, err := h.current()
	if err != nil {
		return "", true, err
	}
	said, err := edit(d)
	if err != nil {
		return "", true, err
	}
	raw, err := json.Marshal(d)
	if err != nil {
		return "", true, err
	}
	if err := h.deploy(ctx, raw, "MCP: "+label); err != nil {
		return "", true, fmt.Errorf("not changed: %v", err)
	}
	return said, false, nil
}

func list(v any) []any       { l, _ := v.([]any); return l }
func obj(v any) map[string]any { o, _ := v.(map[string]any); return o }
func text(v any) string      { s, _ := v.(string); return s }

func newID(prefix string) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return prefix + "-" + string(b)
}

// findPage finds a page by its id or its name.
func findPage(d doc, ref string) (map[string]any, int, error) {
	for i, p := range list(d["pages"]) {
		pg := obj(p)
		if text(pg["id"]) == ref || text(pg["name"]) == ref {
			return pg, i, nil
		}
	}
	return nil, -1, fmt.Errorf("no page %q", ref)
}

func findWidget(pg map[string]any, id string) (map[string]any, int, error) {
	for i, w := range list(pg["widgets"]) {
		if text(obj(w)["id"]) == id {
			return obj(w), i, nil
		}
	}
	return nil, -1, fmt.Errorf("no widget %q on page %q", id, text(pg["name"]))
}

func number(v any) (float64, bool) { f, ok := v.(float64); return f, ok }

// mergeInto sets keys of patch on target; a null removes the key. Objects under props are merged.
func mergeInto(target, patch map[string]any) {
	for k, v := range patch {
		switch {
		case v == nil:
			delete(target, k)
		case k == "props" && obj(v) != nil && obj(target[k]) != nil:
			merged := obj(target[k])
			for pk, pv := range obj(v) {
				if pv == nil {
					delete(merged, pk)
				} else {
					merged[pk] = pv
				}
			}
			if len(merged) == 0 {
				delete(target, k)
			}
		default:
			target[k] = v
		}
	}
}

func (h *Handler) screenTools() []tool {
	str := func(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
	num := func(desc string) map[string]any { return map[string]any{"type": "number", "description": desc} }
	anyObj := func(desc string) map[string]any { return map[string]any{"type": "object", "description": desc} }
	geometry := map[string]any{
		"x": num("Left edge (pixels in a pixel project, grid columns otherwise)"), "y": num("Top edge"),
		"w": num("Width"), "h": num("Height"),
	}
	with := func(base map[string]any, more map[string]any) map[string]any {
		out := map[string]any{}
		for k, v := range base {
			out[k] = v
		}
		for k, v := range more {
			out[k] = v
		}
		return out
	}
	return []tool{
		{Name: "list_pages", Description: "List the project's pages: id, name, icon, how many widgets, and whether the canvas is in pixels or grid cells.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}}},
		{Name: "get_page", Description: "Read one page with all its widgets (type, place, settings, tags, events, dynamics, access).",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{"page": str("Page id or name")}, "required": []string{"page"}}},
		{Name: "list_widget_types", Description: "List the widget types and the settings (props keys) each accepts.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}}},
		{Name: "add_page", Description: "Add a page; returns its id.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{
				"name": str("Page name"), "icon": str("Optional icon: home, graph, alarm, settings, pump, vessel, valve, motor, dial, list, chart, map, user, tools, bolt, flask"),
			}, "required": []string{"name"}}},
		{Name: "delete_page", Description: "Delete a page and its widgets. The last page cannot be deleted.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{"page": str("Page id or name")}, "required": []string{"page"}}},
		{Name: "add_widget", Description: "Add a widget to a page; returns its id. Tags are \"datasource:path\" or \"ns:name\". Events: {\"onClick\": [{\"type\": \"write\", \"tag\": \"...\", \"value\": 1}]}; action types write, toggle, increment, navigate (page), openUrl (url), openPopup (customWidgetId, params), closePopup.",
			InputSchema: map[string]any{"type": "object", "properties": with(geometry, map[string]any{
				"page": str("Page id or name"), "type": str("Widget type (see list_widget_types)"),
				"props":    anyObj("Settings, e.g. {\"label\": \"Pump 1\", \"unit\": \"rpm\"}"),
				"bindings": anyObj("{\"value\": tag, \"visible\": tag, \"color\": tag}"),
				"events":   anyObj("What it does when touched"),
			}), "required": []string{"page", "type", "x", "y", "w", "h"}}},
		{Name: "update_widget", Description: "Change a widget: its place, settings (merged; null removes one), tags, events, dynamics or access. Only what is given changes.",
			InputSchema: map[string]any{"type": "object", "properties": with(geometry, map[string]any{
				"page": str("Page id or name"), "id": str("Widget id"),
				"props": anyObj("Settings to set; null removes one"), "bindings": anyObj("Tags"), "events": anyObj("Events (replaces them)"),
				"dynamics": anyObj("Driven properties (replaces them)"), "access": anyObj("{\"view\": role, \"operate\": role}"),
			}), "required": []string{"page", "id"}}},
		{Name: "delete_widget", Description: "Delete a widget from a page.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{"page": str("Page id or name"), "id": str("Widget id")}, "required": []string{"page", "id"}}},
		{Name: "add_custom_widget", Description: "Add a custom widget (a reusable piece of screen, e.g. a faceplate) with a designed size in pixels; returns its id. Its parts are widgets with a localId instead of an id; a part's tag may be \"{param}\", filled in where it is used.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{
				"name": str("Name"), "width": num("Designed width in pixels"), "height": num("Designed height in pixels"),
				"params":  map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Parameter names"},
				"widgets": map[string]any{"type": "array", "items": map[string]any{"type": "object"}, "description": "Parts: {localId, type, x, y, w, h, props?, bindings?, events?}"},
			}, "required": []string{"name", "width", "height"}}},
	}
}

func (h *Handler) callScreenTool(ctx context.Context, name string, args map[string]any) (string, bool, error, bool) {
	out := func(v any) (string, bool, error, bool) {
		b, _ := json.MarshalIndent(v, "", "  ")
		return string(b), false, nil, true
	}
	switch name {
	case "list_pages":
		d, err := h.current()
		if err != nil {
			return "", true, err, true
		}
		pages := []map[string]any{}
		for _, p := range list(d["pages"]) {
			pg := obj(p)
			pages = append(pages, map[string]any{"id": pg["id"], "name": pg["name"], "icon": pg["icon"], "widgets": len(list(pg["widgets"]))})
		}
		units := "grid cells"
		if text(d["canvasSnap"]) == "pixel" {
			units = "pixels"
		}
		return out(map[string]any{"units": units, "pages": pages})

	case "get_page":
		d, err := h.current()
		if err != nil {
			return "", true, err, true
		}
		pg, _, err := findPage(d, text(args["page"]))
		if err != nil {
			return "", true, err, true
		}
		return out(pg)

	case "list_widget_types":
		keys, err := project.WidgetSettings()
		if err != nil {
			return "", true, err, true
		}
		names := make([]string, 0, len(keys))
		for t := range keys {
			names = append(names, t)
		}
		sort.Strings(names)
		types := make([]map[string]any, 0, len(names))
		for _, t := range names {
			types = append(types, map[string]any{"type": t, "settings": keys[t]})
		}
		return out(types)

	case "add_page":
		nm := strings.TrimSpace(text(args["name"]))
		if nm == "" {
			return "", true, fmt.Errorf("name is required"), true
		}
		id := newID("p")
		s, isErr, err := h.change(ctx, "add page "+nm, func(d doc) (string, error) {
			pg := map[string]any{"id": id, "name": nm, "widgets": []any{}}
			if icon := text(args["icon"]); icon != "" {
				pg["icon"] = icon
			}
			d["pages"] = append(list(d["pages"]), pg)
			return fmt.Sprintf("added page %q (id %s)", nm, id), nil
		})
		return s, isErr, err, true

	case "delete_page":
		s, isErr, err := h.change(ctx, "delete page "+text(args["page"]), func(d doc) (string, error) {
			pg, i, err := findPage(d, text(args["page"]))
			if err != nil {
				return "", err
			}
			pages := list(d["pages"])
			if len(pages) == 1 {
				return "", fmt.Errorf("the last page cannot be deleted")
			}
			d["pages"] = append(pages[:i:i], pages[i+1:]...)
			return fmt.Sprintf("deleted page %q", text(pg["name"])), nil
		})
		return s, isErr, err, true

	case "add_widget":
		id := newID("w")
		s, isErr, err := h.change(ctx, "add "+text(args["type"])+" to "+text(args["page"]), func(d doc) (string, error) {
			pg, _, err := findPage(d, text(args["page"]))
			if err != nil {
				return "", err
			}
			w := map[string]any{"id": id, "type": text(args["type"])}
			for _, k := range []string{"x", "y", "w", "h"} {
				v, ok := number(args[k])
				if !ok {
					return "", fmt.Errorf("%s is required", k)
				}
				w[k] = v
			}
			for _, k := range []string{"props", "bindings", "events"} {
				if o := obj(args[k]); len(o) > 0 {
					w[k] = o
				}
			}
			pg["widgets"] = append(list(pg["widgets"]), w)
			return fmt.Sprintf("added a %s (id %s) to page %q", text(args["type"]), id, text(pg["name"])), nil
		})
		return s, isErr, err, true

	case "update_widget":
		s, isErr, err := h.change(ctx, "change "+text(args["id"]), func(d doc) (string, error) {
			pg, _, err := findPage(d, text(args["page"]))
			if err != nil {
				return "", err
			}
			w, _, err := findWidget(pg, text(args["id"]))
			if err != nil {
				return "", err
			}
			patch := map[string]any{}
			for _, k := range []string{"x", "y", "w", "h", "props", "bindings", "events", "dynamics", "access"} {
				if v, ok := args[k]; ok {
					patch[k] = v
				}
			}
			if len(patch) == 0 {
				return "", fmt.Errorf("nothing to change")
			}
			mergeInto(w, patch)
			return fmt.Sprintf("changed widget %s", text(args["id"])), nil
		})
		return s, isErr, err, true

	case "delete_widget":
		s, isErr, err := h.change(ctx, "delete "+text(args["id"]), func(d doc) (string, error) {
			pg, _, err := findPage(d, text(args["page"]))
			if err != nil {
				return "", err
			}
			_, i, err := findWidget(pg, text(args["id"]))
			if err != nil {
				return "", err
			}
			ws := list(pg["widgets"])
			pg["widgets"] = append(ws[:i:i], ws[i+1:]...)
			return fmt.Sprintf("deleted widget %s", text(args["id"])), nil
		})
		return s, isErr, err, true

	case "add_custom_widget":
		nm := strings.TrimSpace(text(args["name"]))
		id := newID("cw")
		s, isErr, err := h.change(ctx, "add custom widget "+nm, func(d doc) (string, error) {
			if nm == "" {
				return "", fmt.Errorf("name is required")
			}
			params := []any{}
			for _, p := range list(args["params"]) {
				if n := text(p); n != "" {
					params = append(params, map[string]any{"name": n})
				}
			}
			cw := map[string]any{"id": id, "name": nm, "params": params, "widgets": list(args["widgets"]), "width": args["width"], "height": args["height"]}
			if cw["widgets"] == nil {
				cw["widgets"] = []any{}
			}
			d["customWidgets"] = append(list(d["customWidgets"]), cw)
			return fmt.Sprintf("added custom widget %q (id %s)", nm, id), nil
		})
		return s, isErr, err, true
	}
	return "", false, nil, false
}
