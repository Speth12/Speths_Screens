// Package assets implements the Speth's Screens Asset Framework.
//
// Assets model real physical objects (pumps, valves, tanks, motors).
// Each asset is an instance of a template.  Templates support inheritance.
// Assets publish their tags into the Unified Namespace automatically.
//
// Example hierarchy:
//
//	Motor (template)
//	 └─ VFDMotor (template, inherits Motor)
//	     └─ Pump-A (instance)
//
// Namespace paths published by Pump-A:
//
//	Plant.Line1.PumpA.RunStatus
//	Plant.Line1.PumpA.Speed
//	Plant.Line1.PumpA.Fault
package assets

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"sync"
)

// PropertyDef describes one property slot on a template.
type PropertyDef struct {
	Name        string `json:"name"`
	DataType    string `json:"dataType"`         // float, bool, string, int
	Unit        string `json:"unit,omitempty"`
	Description string `json:"description,omitempty"`
	Default     any    `json:"default,omitempty"`
}

// AlarmDef describes an alarm rule template bound to an asset tag.
type AlarmDef struct {
	Name      string  `json:"name"`
	Tag       string  `json:"tag"`       // relative: "Level", "Temp", etc.
	Condition string  `json:"condition"` // gt, lt, eq, ne
	Threshold float64 `json:"threshold"`
	Severity  string  `json:"severity"` // info, warning, critical
	Message   string  `json:"message,omitempty"`
}

// Template is a reusable asset blueprint.
type Template struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	ParentID    string        `json:"parentId,omitempty"` // inheritance
	Description string        `json:"description,omitempty"`
	Properties  []PropertyDef `json:"properties"`
	Alarms      []AlarmDef    `json:"alarms,omitempty"`
}

// Instance is a concrete asset created from a template.
type Instance struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	TemplateID string            `json:"templateId"`
	NSPath     string            `json:"nsPath"`               // root namespace path, e.g. "Plant.Line1.PumpA"
	DriverID   string            `json:"driverId,omitempty"`   // datasource to map tags from
	TagMap     map[string]string `json:"tagMap,omitempty"`     // property name -> driver address
	Overrides  map[string]any    `json:"overrides,omitempty"`  // property default overrides
	Meta       map[string]string `json:"meta,omitempty"`
}

// ResolvedInstance is an Instance with all inherited properties merged.
type ResolvedInstance struct {
	Instance
	Properties []PropertyDef
	Alarms     []AlarmDef
}

// Registry holds all templates and instances.
type Registry struct {
	mu        sync.RWMutex
	templates map[string]*Template
	instances map[string]*Instance
}

// New returns an empty registry with built-in base templates pre-loaded.
func New() *Registry {
	r := &Registry{
		templates: make(map[string]*Template),
		instances: make(map[string]*Instance),
	}
	r.loadBuiltins()
	return r
}

// ── Template management ────────────────────────────────────────────────────

// RegisterTemplate adds or replaces a template.
func (r *Registry) RegisterTemplate(t *Template) error {
	if t.ID == "" {
		return errors.New("assets: template ID is required")
	}
	if t.ParentID != "" {
		r.mu.RLock()
		_, ok := r.templates[t.ParentID]
		r.mu.RUnlock()
		if !ok {
			return fmt.Errorf("assets: parent template %q not found", t.ParentID)
		}
		// cycle check
		if err := r.checkInheritanceCycle(t.ID, t.ParentID); err != nil {
			return err
		}
	}
	r.mu.Lock()
	r.templates[t.ID] = t
	r.mu.Unlock()
	return nil
}

// GetTemplate returns a template by ID (nil if not found).
func (r *Registry) GetTemplate(id string) *Template {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.templates[id]
}

// ListTemplates returns all registered templates.
func (r *Registry) ListTemplates() []*Template {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Template, 0, len(r.templates))
	for _, t := range r.templates {
		out = append(out, t)
	}
	return out
}

// ResolveTemplate returns a template with all inherited properties merged
// (child properties override parent properties of the same name).
func (r *Registry) ResolveTemplate(id string) (*Template, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.resolveTemplate(id)
}

// ── Instance management ────────────────────────────────────────────────────

// CreateInstance registers a new asset instance.
func (r *Registry) CreateInstance(inst *Instance) error {
	if inst.ID == "" {
		return errors.New("assets: instance ID is required")
	}
	if inst.TemplateID == "" {
		return errors.New("assets: templateId is required")
	}
	r.mu.RLock()
	_, ok := r.templates[inst.TemplateID]
	r.mu.RUnlock()
	if !ok {
		return fmt.Errorf("assets: template %q not found", inst.TemplateID)
	}
	r.mu.Lock()
	r.instances[inst.ID] = inst
	r.mu.Unlock()
	return nil
}

// GetInstance returns an instance by ID (nil if not found).
func (r *Registry) GetInstance(id string) *Instance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.instances[id]
}

// ListInstances returns all registered instances.
func (r *Registry) ListInstances() []*Instance {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Instance, 0, len(r.instances))
	for _, inst := range r.instances {
		out = append(out, inst)
	}
	return out
}

// DeleteInstance removes an instance by ID.
func (r *Registry) DeleteInstance(id string) {
	r.mu.Lock()
	delete(r.instances, id)
	r.mu.Unlock()
}

// Resolve returns a fully-resolved instance (inherited props merged + overrides applied).
func (r *Registry) Resolve(instanceID string) (*ResolvedInstance, error) {
	r.mu.RLock()
	inst, ok := r.instances[instanceID]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("assets: instance %q not found", instanceID)
	}

	tmpl, err := r.ResolveTemplate(inst.TemplateID)
	if err != nil {
		return nil, err
	}

	// Apply overrides to property defaults
	props := make([]PropertyDef, len(tmpl.Properties))
	copy(props, tmpl.Properties)
	for i := range props {
		if v, ok := inst.Overrides[props[i].Name]; ok {
			props[i].Default = v
		}
	}

	return &ResolvedInstance{
		Instance:   *inst,
		Properties: props,
		Alarms:     tmpl.Alarms,
	}, nil
}

// NSTagPaths returns the namespace paths that this instance would publish.
// E.g. for NSPath="Plant.PumpA" and properties [RunStatus, Speed]:
//
//	["Plant.PumpA.RunStatus", "Plant.PumpA.Speed"]
func (r *Registry) NSTagPaths(instanceID string) ([]string, error) {
	ri, err := r.Resolve(instanceID)
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(ri.Properties))
	for _, p := range ri.Properties {
		if ri.NSPath != "" {
			paths = append(paths, ri.NSPath+"."+p.Name)
		} else {
			paths = append(paths, ri.Name+"."+p.Name)
		}
	}
	return paths, nil
}

// ── Serialisation ──────────────────────────────────────────────────────────

// MarshalJSON serialises the full registry (templates + instances).
func (r *Registry) MarshalJSON() ([]byte, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return json.Marshal(struct {
		Templates map[string]*Template `json:"templates"`
		Instances map[string]*Instance `json:"instances"`
	}{r.templates, r.instances})
}

// UnmarshalJSON restores a registry (builtins are re-added after load).
func (r *Registry) UnmarshalJSON(b []byte) error {
	var v struct {
		Templates map[string]*Template `json:"templates"`
		Instances map[string]*Instance `json:"instances"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	fresh := New() // start with builtins
	maps.Copy(fresh.templates, v.Templates)
	maps.Copy(fresh.instances, v.Instances)
	r.mu.Lock()
	r.templates = fresh.templates
	r.instances = fresh.instances
	r.mu.Unlock()
	return nil
}

// ── Builtins ───────────────────────────────────────────────────────────────

func (r *Registry) loadBuiltins() {
	builtins := []*Template{
		{
			ID:   "motor",
			Name: "Motor",
			Properties: []PropertyDef{
				{Name: "RunStatus", DataType: "bool", Description: "Motor running"},
				{Name: "Fault", DataType: "bool", Description: "Fault active"},
				{Name: "Current", DataType: "float", Unit: "A"},
			},
			Alarms: []AlarmDef{
				{Name: "Fault", Tag: "Fault", Condition: "eq", Threshold: 1, Severity: "warning", Message: "Motor fault active"},
			},
		},
		{
			ID:       "vfd-motor",
			Name:     "VFD Motor",
			ParentID: "motor",
			Properties: []PropertyDef{
				{Name: "Speed", DataType: "float", Unit: "RPM"},
				{Name: "Frequency", DataType: "float", Unit: "Hz"},
			},
		},
		{
			ID:   "pump",
			Name: "Pump",
			Properties: []PropertyDef{
				{Name: "RunStatus", DataType: "bool"},
				{Name: "Fault", DataType: "bool"},
				{Name: "FlowRate", DataType: "float", Unit: "L/min"},
			},
		},
		{
			ID:   "valve",
			Name: "Valve",
			Properties: []PropertyDef{
				{Name: "Position", DataType: "float", Unit: "%", Description: "0=closed, 100=open"},
				{Name: "Fault", DataType: "bool"},
			},
		},
		{
			ID:   "tank",
			Name: "Tank",
			Properties: []PropertyDef{
				{Name: "Level", DataType: "float", Unit: "m"},
				{Name: "Volume", DataType: "float", Unit: "m3"},
				{Name: "Temperature", DataType: "float", Unit: "°C"},
			},
			Alarms: []AlarmDef{
				{Name: "HighLevel", Tag: "Level", Condition: "gt", Threshold: 90, Severity: "warning", Message: "Tank level high"},
				{Name: "LowLevel", Tag: "Level", Condition: "lt", Threshold: 10, Severity: "warning", Message: "Tank level low"},
			},
		},
	}
	for _, t := range builtins {
		r.templates[t.ID] = t
	}
}

// ── internal helpers ───────────────────────────────────────────────────────

func (r *Registry) resolveTemplate(id string) (*Template, error) {
	t, ok := r.templates[id]
	if !ok {
		return nil, fmt.Errorf("assets: template %q not found", id)
	}
	if t.ParentID == "" {
		// deep copy so caller can't mutate the registry
		cp := *t
		cp.Properties = append([]PropertyDef{}, t.Properties...)
		cp.Alarms = append([]AlarmDef{}, t.Alarms...)
		return &cp, nil
	}
	parent, err := r.resolveTemplate(t.ParentID)
	if err != nil {
		return nil, err
	}
	// merge: parent props first, then child props (child wins on same name)
	merged := make(map[string]PropertyDef)
	for _, p := range parent.Properties {
		merged[p.Name] = p
	}
	for _, p := range t.Properties {
		merged[p.Name] = p
	}
	props := make([]PropertyDef, 0, len(merged))
	for _, p := range merged {
		props = append(props, p)
	}
	alarms := append(append([]AlarmDef{}, parent.Alarms...), t.Alarms...)
	return &Template{
		ID:         t.ID,
		Name:       t.Name,
		ParentID:   t.ParentID,
		Properties: props,
		Alarms:     alarms,
	}, nil
}

func (r *Registry) checkInheritanceCycle(newID, parentID string) error {
	visited := map[string]bool{newID: true}
	cur := parentID
	for cur != "" {
		if visited[cur] {
			return fmt.Errorf("assets: inheritance cycle detected at %q", cur)
		}
		visited[cur] = true
		t, ok := r.templates[cur]
		if !ok {
			return nil
		}
		cur = t.ParentID
	}
	return nil
}
