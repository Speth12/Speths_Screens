// Package faceplate implements the Speth's Screens Faceplate Framework.
//
// A faceplate is a reusable pop-up view that is automatically generated for
// an asset instance.  Each asset template may register multiple faceplate
// views (Overview, Diagnostics, Trend, Alarms).  When an operator clicks on
// an asset widget, the runtime resolves the matching faceplates and returns
// the binding-substituted widget definitions to the operator panel.
//
// Faceplates are stored as widget arrays (same schema as a Page), with tag
// bindings expressed as template variables:
//
//	{{.NSPath}}.RunStatus      →  Plant.Line1.PumpA.RunStatus
//	{{.DriverID}}:Pump1.Run    →  opc1:Pump1.Run
package faceplate

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/Speth12/Speths_Screens/internal/assets"
)

// ViewType classifies the purpose of a faceplate view.
type ViewType string

const (
	ViewOverview    ViewType = "overview"
	ViewDiagnostics ViewType = "diagnostics"
	ViewTrend       ViewType = "trend"
	ViewAlarms      ViewType = "alarms"
)

// DisplayMode controls how the faceplate appears in the operator panel.
type DisplayMode string

const (
	ModeModal    DisplayMode = "modal"
	ModeDocked   DisplayMode = "docked"
	ModeEmbedded DisplayMode = "embedded"
)

// Widget mirrors the minimum fields needed from project.Widget without
// creating a circular import.  The full WidgetElement is stored as raw JSON.
type Widget = json.RawMessage

// View is one faceplate view (e.g. Overview) for an asset template.
type View struct {
	TemplateID  string      `json:"templateId"`
	ViewType    ViewType    `json:"viewType"`
	Title       string      `json:"title,omitempty"`
	DisplayMode DisplayMode `json:"displayMode"`
	Width       int         `json:"width,omitempty"`  // pixels; 0 = auto
	Height      int         `json:"height,omitempty"` // pixels; 0 = auto
	Widgets     []Widget    `json:"widgets"`
}

// ResolvedView is a View with all template variables substituted for a specific instance.
type ResolvedView struct {
	View
	InstanceID   string `json:"instanceId"`
	InstanceName string `json:"instanceName"`
}

// Registry holds all registered faceplate views.
type Registry struct {
	mu    sync.RWMutex
	views map[string][]*View // templateId -> []View
	ar    *assets.Registry
}

// New returns a faceplate registry backed by the given asset registry.
func New(ar *assets.Registry) *Registry {
	return &Registry{
		views: make(map[string][]*View),
		ar:    ar,
	}
}

// Register adds or replaces a faceplate view for a template.
// There can be at most one view per (templateId, viewType) pair.
func (r *Registry) Register(v *View) error {
	if v.TemplateID == "" {
		return errors.New("faceplate: templateId is required")
	}
	if v.ViewType == "" {
		return errors.New("faceplate: viewType is required")
	}
	if r.ar.GetTemplate(v.TemplateID) == nil {
		return fmt.Errorf("faceplate: template %q not found", v.TemplateID)
	}
	if v.DisplayMode == "" {
		v.DisplayMode = ModeModal
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	existing := r.views[v.TemplateID]
	for i, ev := range existing {
		if ev.ViewType == v.ViewType {
			existing[i] = v
			return nil
		}
	}
	r.views[v.TemplateID] = append(existing, v)
	return nil
}

// ListViews returns all faceplate views registered for a template.
func (r *Registry) ListViews(templateID string) []*View {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return append([]*View{}, r.views[templateID]...)
}

// Resolve returns all faceplate views for instanceID, with tag template variables
// substituted using the instance's NSPath, DriverID, and TagMap.
func (r *Registry) Resolve(instanceID string) ([]*ResolvedView, error) {
	ri, err := r.ar.Resolve(instanceID)
	if err != nil {
		return nil, err
	}

	vars := buildVars(ri)

	r.mu.RLock()
	views := append([]*View{}, r.views[ri.TemplateID]...)
	// Also include views inherited from parent templates
	if tmpl := r.ar.GetTemplate(ri.TemplateID); tmpl != nil {
		if tmpl.ParentID != "" {
			views = append(views, r.views[tmpl.ParentID]...)
		}
	}
	r.mu.RUnlock()

	out := make([]*ResolvedView, 0, len(views))
	for _, v := range views {
		rv := &ResolvedView{
			View:         *v,
			InstanceID:   instanceID,
			InstanceName: ri.Name,
		}
		rv.Widgets = substituteWidgets(v.Widgets, vars)
		out = append(out, rv)
	}
	return out, nil
}

// GetView resolves a single view by type for an instance.
func (r *Registry) GetView(instanceID string, vt ViewType) (*ResolvedView, error) {
	views, err := r.Resolve(instanceID)
	if err != nil {
		return nil, err
	}
	for _, v := range views {
		if v.ViewType == vt {
			return v, nil
		}
	}
	return nil, fmt.Errorf("faceplate: no %q view for instance %q", vt, instanceID)
}

// ── Serialisation ──────────────────────────────────────────────────────────

func (r *Registry) MarshalJSON() ([]byte, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return json.Marshal(r.views)
}

func (r *Registry) UnmarshalJSON(b []byte) error {
	var v map[string][]*View
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	r.mu.Lock()
	r.views = v
	r.mu.Unlock()
	return nil
}

// ── helpers ────────────────────────────────────────────────────────────────

// buildVars constructs the substitution map for a resolved instance.
func buildVars(ri *assets.ResolvedInstance) map[string]string {
	vars := map[string]string{
		"{{.NSPath}}":     ri.NSPath,
		"{{.Name}}":       ri.Name,
		"{{.DriverID}}":   ri.DriverID,
		"{{.InstanceID}}": ri.ID,
	}
	// {{.Tags.RunStatus}} → actual driver address or NSPath.RunStatus
	for _, prop := range ri.Properties {
		addr, ok := ri.TagMap[prop.Name]
		if !ok {
			if ri.NSPath != "" {
				addr = ri.NSPath + "." + prop.Name
			} else {
				addr = prop.Name
			}
		}
		vars["{{.Tags."+prop.Name+"}}"] = addr
		// Qualified binding: driverId:address
		if ri.DriverID != "" && !strings.Contains(addr, ":") {
			vars["{{.Bindings."+prop.Name+"}}"] = ri.DriverID + ":" + addr
		} else {
			vars["{{.Bindings."+prop.Name+"}}"] = addr
		}
	}
	return vars
}

// substituteWidgets deep-substitutes all template vars in widget JSON.
func substituteWidgets(widgets []Widget, vars map[string]string) []Widget {
	if len(widgets) == 0 {
		return nil
	}
	out := make([]Widget, len(widgets))
	for i, w := range widgets {
		s := string(w)
		for k, v := range vars {
			s = strings.ReplaceAll(s, k, v)
		}
		out[i] = Widget(s)
	}
	return out
}
