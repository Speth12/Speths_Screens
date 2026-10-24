package runtime

import (
	"encoding/json"
	"log"
	"sort"
	"strings"
	"sync"

	"github.com/Speth12/Speths_Screens/internal/drivers/virtual"
	"github.com/Speth12/Speths_Screens/internal/project"
)

// Demand sources set from the loaded project. WebSocket clients and (later)
// scripts register their own sources.
const (
	SourceScreens    = "project:screens"
	SourceAlarms     = "project:alarms"
	SourceCalculated = "project:calculated"
)

// demand is the subscription manager: every consumer registers the bindings
// it needs under its own source name, and each driver is given the union of
// all sources' bindings that resolve to it. A tag stops being polled when
// its last source releases it.
type demand struct {
	mu      sync.Mutex
	sources map[string]map[string]struct{} // source → bindings

	// applyMu orders applyDemand calls: each one snapshots the sources after
	// taking it, so the last call always hands drivers the latest union.
	applyMu sync.Mutex
}

// TagDemand describes one binding someone needs, for diagnostics.
type TagDemand struct {
	Binding string   `json:"binding"`
	Driver  string   `json:"driver,omitempty"` // empty when the binding does not resolve
	Path    string   `json:"path,omitempty"`
	Sources []string `json:"sources"`
}

// SetDemand replaces the bindings a source needs. An empty list removes the
// source. Drivers are updated before it returns.
func (r *Runtime) SetDemand(source string, bindings []string) {
	r.demand.mu.Lock()
	if len(bindings) == 0 {
		delete(r.demand.sources, source)
	} else {
		set := make(map[string]struct{}, len(bindings))
		for _, b := range bindings {
			if b != "" {
				set[b] = struct{}{}
			}
		}
		r.demand.sources[source] = set
	}
	r.demand.mu.Unlock()
	r.applyDemand()
}

// setDemands replaces several sources at once and updates drivers once.
func (r *Runtime) setDemands(bySource map[string][]string) {
	r.demand.mu.Lock()
	for source, bindings := range bySource {
		set := make(map[string]struct{}, len(bindings))
		for _, b := range bindings {
			if b != "" {
				set[b] = struct{}{}
			}
		}
		if len(set) == 0 {
			delete(r.demand.sources, source)
		} else {
			r.demand.sources[source] = set
		}
	}
	r.demand.mu.Unlock()
	r.applyDemand()
}

// AddDemand adds bindings to a source.
func (r *Runtime) AddDemand(source string, bindings ...string) {
	r.demand.mu.Lock()
	set := r.demand.sources[source]
	if set == nil {
		set = map[string]struct{}{}
		r.demand.sources[source] = set
	}
	for _, b := range bindings {
		if b != "" {
			set[b] = struct{}{}
		}
	}
	r.demand.mu.Unlock()
	r.applyDemand()
}

// RemoveDemand removes bindings from a source.
func (r *Runtime) RemoveDemand(source string, bindings ...string) {
	r.demand.mu.Lock()
	if set := r.demand.sources[source]; set != nil {
		for _, b := range bindings {
			delete(set, b)
		}
		if len(set) == 0 {
			delete(r.demand.sources, source)
		}
	}
	r.demand.mu.Unlock()
	r.applyDemand()
}

// ReleaseDemand removes a source and everything it needed.
func (r *Runtime) ReleaseDemand(source string) { r.SetDemand(source, nil) }

// Demand lists every needed binding with its sources, sorted by binding.
func (r *Runtime) Demand() []TagDemand {
	r.demand.mu.Lock()
	bySrc := map[string][]string{}
	for src, set := range r.demand.sources {
		for b := range set {
			bySrc[b] = append(bySrc[b], src)
		}
	}
	r.demand.mu.Unlock()

	out := make([]TagDemand, 0, len(bySrc))
	for b, srcs := range bySrc {
		sort.Strings(srcs)
		td := TagDemand{Binding: b, Sources: srcs}
		td.Driver, td.Path, _ = r.resolveBinding(b)
		out = append(out, td)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Binding < out[j].Binding })
	return out
}

// applyDemand resolves the union of all sources and gives every driver its
// list. Drivers nothing needs get an empty list and go idle.
func (r *Runtime) applyDemand() {
	r.demand.applyMu.Lock()
	defer r.demand.applyMu.Unlock()

	r.demand.mu.Lock()
	all := map[string]struct{}{}
	for _, set := range r.demand.sources {
		for b := range set {
			all[b] = struct{}{}
		}
	}
	r.demand.mu.Unlock()

	perDriver := map[string][]string{}
	for b := range all {
		if id, path, ok := r.resolveBinding(b); ok {
			perDriver[id] = append(perDriver[id], path)
		}
	}
	for id, drv := range r.Drivers() {
		if err := drv.SetTags(perDriver[id]); err != nil {
			log.Printf("[RUNTIME] %s: set tags: %v", id, err)
		}
	}
}

// resolveBinding maps a binding to a datasource id and driver path.
// "ds:path" maps directly; "ns:x" goes through the namespace node's driver
// binding. Faceplate templates ("{param}") and unbound ns paths do not resolve.
func (r *Runtime) resolveBinding(b string) (driverID, path string, ok bool) {
	if strings.Contains(b, "{") {
		return "", "", false
	}
	if nsPath, isNS := strings.CutPrefix(b, "ns:"); isNS {
		n := r.Namespace.ResolvePath(nsPath)
		if n == nil || n.DriverID == "" || n.DriverAddr == "" {
			return "", "", false
		}
		return n.DriverID, n.DriverAddr, true
	}
	id, path, found := strings.Cut(b, ":")
	if !found || id == "" || path == "" {
		return "", "", false
	}
	return id, path, true
}

// projectDemand returns the bindings each project source needs.
func projectDemand(p *project.Project) map[string][]string {
	var screens []string
	addWidget := func(binding, visible *string, cfg *project.WidgetConfig, dyns []project.DynamicElement) {
		for _, b := range []*string{binding, visible} {
			if b != nil {
				screens = append(screens, *b)
			}
		}
		if cfg != nil {
			if cfg.ColorBinding != nil {
				screens = append(screens, *cfg.ColorBinding)
			}
			for _, s := range cfg.Tags {
				screens = append(screens, s.Binding)
			}
			for _, row := range cfg.Rows {
				screens = append(screens, row.Binding)
			}
			for _, b := range cfg.Params { // faceplate instance: param → binding
				screens = append(screens, b)
			}
		}
		for _, d := range dyns {
			for _, b := range []*string{d.Binding, d.WriteTo} {
				if b != nil {
					screens = append(screens, *b)
				}
			}
		}
	}
	for _, pg := range p.Pages {
		for _, w := range pg.Widgets {
			addWidget(w.Binding, w.VisibleBinding, w.Config, w.Dynamics)
		}
	}
	// Bindings inside faceplates; "{param}" templates are skipped when
	// resolving, since the instance params above cover them.
	for _, fp := range p.Faceplates {
		for _, w := range fp.Widgets {
			addWidget(w.Binding, w.VisibleBinding, w.Config, w.Dynamics)
		}
	}

	var alarms []string
	for _, a := range p.AlarmRules {
		alarms = append(alarms, a.Binding)
	}

	var calculated []string
	for _, ds := range p.Datasources {
		if ds.Type != project.DatasourceTypeVirtual || ds.Config.Tags == nil {
			continue
		}
		var specs []virtual.TagSpec
		if err := json.Unmarshal([]byte(*ds.Config.Tags), &specs); err != nil {
			continue // the virtual driver reports the bad config on Connect
		}
		for _, s := range specs {
			for _, ref := range virtual.ParseRefs(s.Formula) {
				calculated = append(calculated, ref.Key)
			}
		}
	}

	return map[string][]string{
		SourceScreens:    screens,
		SourceAlarms:     alarms,
		SourceCalculated: calculated,
	}
}
