package project

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"

	screens "github.com/Speth12/Speths_Screens"
)

// CurrentSchemaVersion is the project format this build writes. A file
// without schemaVersion is version 1.
const CurrentSchemaVersion = 2

// Upgrade turns project JSON in any older format into the current one. It
// returns the JSON unchanged when it is current, and notes describing
// anything the upgrade dropped. A file newer than this build is an error.
//
// The TypeScript upgrader (packages/shared-types/src/upgrade.ts) does the
// same; both are held to the golden files in testdata/upgrade.
func Upgrade(data []byte) ([]byte, []string, error) {
	var doc map[string]any
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber() // keep numbers exactly as written
	if err := dec.Decode(&doc); err != nil {
		return nil, nil, fmt.Errorf("unmarshal project: %w", err)
	}
	version := 1
	if v, ok := doc["schemaVersion"].(json.Number); ok {
		n, err := v.Int64()
		if err != nil || n < 1 {
			return nil, nil, fmt.Errorf("schemaVersion %s is not a format version", v)
		}
		version = int(n)
	}
	if version > CurrentSchemaVersion {
		return nil, nil, fmt.Errorf("the project is format %d; this version of Speth's Screens reads up to %d", version, CurrentSchemaVersion)
	}
	if version == CurrentSchemaVersion {
		return data, nil, nil
	}
	allowed, err := propsKeys()
	if err != nil {
		return nil, nil, err
	}
	u := &upgrader{allowed: allowed}
	u.v1ToV2(doc)
	doc["schemaVersion"] = CurrentSchemaVersion
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false) // keep "value > 5" readable
	if err := enc.Encode(doc); err != nil {
		return nil, nil, fmt.Errorf("marshal project: %w", err)
	}
	return bytes.TrimSpace(out.Bytes()), u.notes, nil
}

type upgrader struct {
	allowed map[string]map[string]bool // widget type → its settings
	notes   []string
}

func (u *upgrader) note(format string, args ...any) {
	u.notes = append(u.notes, fmt.Sprintf(format, args...))
}

// v1ToV2 moves every widget, on pages and in faceplates, to the v2 format.
func (u *upgrader) v1ToV2(doc map[string]any) {
	for _, pg := range objects(doc["pages"]) {
		for _, w := range objects(pg["widgets"]) {
			u.widget(w, fmt.Sprintf("page %q, widget %v", str(pg["name"]), w["id"]))
		}
	}
	for _, fp := range objects(doc["faceplates"]) {
		for _, w := range objects(fp["widgets"]) {
			u.widget(w, fmt.Sprintf("faceplate %q, widget %v", str(fp["name"]), w["localId"]))
		}
	}
}

// v1 keys that move out of config, or that no widget reads.
var (
	movedConfigKeys  = map[string]bool{"colorBinding": true, "objectFit": true}
	buttonActionKeys = map[string]bool{"action": true, "momentary": true, "onValue": true, "offValue": true, "navigateTo": true}
	unusedConfigKeys = map[string]bool{"format": true, "decimals": true, "placeholder": true}
	dynamicActions   = map[string]string{"onClick": "onClick", "onPressed": "onPress", "onReleased": "onRelease"}
	actionFields     = []string{"actionType", "writeTo", "writeValue", "step", "pageId", "url"}
)

func (u *upgrader) widget(w map[string]any, where string) {
	typ := str(w["type"])
	where = fmt.Sprintf("%s (%s)", where, typ)
	cfg, _ := w["config"].(map[string]any)
	if cfg == nil {
		cfg = map[string]any{}
	}
	props := map[string]any{}
	bindings := map[string]any{}
	events := map[string][]any{}

	// Tags.
	if b := str(w["binding"]); b != "" {
		if typ == "textDisplay" && !strings.Contains(b, ":") {
			// v1 showed a binding without ":" as literal text.
			if str(cfg["staticText"]) == "" {
				props["staticText"] = b
			}
		} else {
			bindings["value"] = b
		}
	}
	if b := str(w["visibleBinding"]); b != "" {
		bindings["visible"] = b
	}
	if b := str(cfg["colorBinding"]); b != "" {
		bindings["color"] = b
	}
	if fit := str(cfg["objectFit"]); fit != "" && str(cfg["fit"]) == "" {
		cfg["fit"] = fit
	}

	// A button's own action becomes events.
	if typ == "button" {
		for name, actions := range buttonEvents(cfg) {
			events[name] = append(events[name], actions...)
		}
	}

	// Settings: only the ones this widget type has. "" meant "default".
	keys := make([]string, 0, len(cfg))
	for k := range cfg {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := cfg[k]
		switch {
		case movedConfigKeys[k] || (typ == "button" && buttonActionKeys[k]):
		case v == "" || v == nil:
		case unusedConfigKeys[k]:
			u.note("%s: dropped setting %s, which no widget reads", where, k)
		case !u.allowed[typ][k]:
			u.note("%s: dropped setting %s, which this widget type does not have", where, k)
		default:
			props[k] = v
		}
	}

	// Dynamics: actions become events, the rest stays.
	var dynamics []any
	for _, d := range objects(w["dynamics"]) {
		kind := str(d["kind"])
		if event, ok := dynamicActions[kind]; ok {
			if a := u.dynamicAction(d, where); a != nil {
				events[event] = append(events[event], a)
			}
			continue
		}
		for _, f := range actionFields {
			delete(d, f)
		}
		dynamics = append(dynamics, d)
	}

	for _, k := range []string{"binding", "visibleBinding", "config", "dynamics", "props", "bindings", "events"} {
		delete(w, k)
	}
	if len(props) > 0 {
		w["props"] = props
	}
	if len(bindings) > 0 {
		w["bindings"] = bindings
	}
	if len(events) > 0 {
		ev := map[string]any{}
		for k, v := range events {
			ev[k] = v
		}
		w["events"] = ev
	}
	if len(dynamics) > 0 {
		w["dynamics"] = dynamics
	}
}

// buttonEvents turns a v1 button's action settings into events: navigate on
// click, momentary writes on press and release, or a toggle on click.
func buttonEvents(cfg map[string]any) map[string][]any {
	if str(cfg["action"]) == "navigate" {
		if page := str(cfg["navigateTo"]); page != "" {
			return map[string][]any{"onClick": {map[string]any{"type": "navigate", "page": page}}}
		}
		return nil
	}
	on, off := orDefault(cfg["onValue"], json.Number("1")), orDefault(cfg["offValue"], json.Number("0"))
	if momentary, ok := cfg["momentary"].(bool); ok && !momentary {
		return map[string][]any{"onClick": {map[string]any{"type": "toggle", "on": on, "off": off}}}
	}
	return map[string][]any{
		"onPress":   {map[string]any{"type": "write", "value": on}},
		"onRelease": {map[string]any{"type": "write", "value": off}},
	}
}

// dynamicAction turns a v1 action dynamic into a v2 action, or nil (with a
// note) when v1 would have done nothing.
func (u *upgrader) dynamicAction(d map[string]any, where string) map[string]any {
	tag := str(d["writeTo"])
	switch at := str(d["actionType"]); at {
	case "writeValue", "toggleValue", "incrementValue":
		if tag == "" {
			u.note("%s: dropped a %s action without a tag to write", where, at)
			return nil
		}
		a := map[string]any{"tag": tag}
		switch at {
		case "writeValue":
			a["type"], a["value"] = "write", d["writeValue"]
		case "toggleValue":
			a["type"] = "toggle"
		case "incrementValue":
			a["type"] = "increment"
			if step, ok := d["step"]; ok {
				a["step"] = step
			}
		}
		return a
	case "navigate":
		if page := str(d["pageId"]); page != "" {
			return map[string]any{"type": "navigate", "page": page}
		}
	case "openUrl":
		if url := str(d["url"]); url != "" {
			return map[string]any{"type": "openUrl", "url": url}
		}
	}
	u.note("%s: dropped an incomplete %s action", where, str(d["kind"]))
	return nil
}

// propsKeys reads, from the embedded schema, which settings each widget
// type has: its settings type's own keys plus those it includes (allOf).
var propsKeys = sync.OnceValues(func() (map[string]map[string]bool, error) {
	var s struct {
		Defs map[string]schemaNode `json:"$defs"`
	}
	if err := json.Unmarshal(screens.SchemaJSON, &s); err != nil {
		return nil, fmt.Errorf("schema.json: %w", err)
	}
	typed, ok := s.Defs["TypedProps"]
	if !ok {
		return nil, fmt.Errorf("schema.json: no TypedProps")
	}
	var collect func(name string, into map[string]bool)
	collect = func(name string, into map[string]bool) {
		def := s.Defs[name]
		for k := range def.Properties {
			into[k] = true
		}
		for _, a := range def.AllOf {
			collect(strings.TrimPrefix(a.Ref, "#/$defs/"), into)
		}
	}
	out := map[string]map[string]bool{}
	for _, branch := range typed.OneOf {
		typ := branch.Properties["type"].Const
		ref := strings.TrimPrefix(branch.Properties["props"].Ref, "#/$defs/")
		if typ == "" || ref == "" {
			return nil, fmt.Errorf("schema.json: TypedProps branch without type or props")
		}
		keys := map[string]bool{}
		collect(ref, keys)
		out[typ] = keys
	}
	return out, nil
})

type schemaNode struct {
	Ref        string                `json:"$ref"`
	Const      string                `json:"const"`
	Properties map[string]schemaNode `json:"properties"`
	AllOf      []schemaNode          `json:"allOf"`
	OneOf      []schemaNode          `json:"oneOf"`
}

func objects(v any) []map[string]any {
	list, _ := v.([]any)
	out := make([]map[string]any, 0, len(list))
	for _, x := range list {
		if m, ok := x.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func orDefault(v, def any) any {
	if v == nil || v == "" {
		return def
	}
	return v
}
