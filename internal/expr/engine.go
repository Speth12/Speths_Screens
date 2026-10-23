package expr

import (
	"fmt"
	"sync"
)

// VirtualTag is a calculated tag that re-evaluates when its dependencies change.
type VirtualTag struct {
	Path       string
	Expression string
	deps       []string // tag paths this expression depends on
}

// Manager tracks all virtual tags and recomputes them when dependencies fire.
type Manager struct {
	mu       sync.RWMutex
	tags     map[string]*VirtualTag // path -> virtual tag
	depIndex map[string][]string    // dep path -> []virtual tag paths that depend on it
	lookup   LookupFunc
	onChange func(path string, value float64) // called when a virtual tag updates
}

// NewManager creates a virtual tag manager.
// lookup resolves live tag values; onChange is called with the new computed value.
func NewManager(lookup LookupFunc, onChange func(path string, value float64)) *Manager {
	return &Manager{
		tags:     make(map[string]*VirtualTag),
		depIndex: make(map[string][]string),
		lookup:   lookup,
		onChange: onChange,
	}
}

// Register adds or replaces a virtual tag definition.
// The expression is parsed to extract dependencies.
func (m *Manager) Register(path, expression string) error {
	deps, err := m.extractDeps(expression)
	if err != nil {
		return err
	}
	// circular reference check
	if err := m.checkCircular(path, deps); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// remove old dep index entries for this path
	if old, ok := m.tags[path]; ok {
		for _, d := range old.deps {
			list := m.depIndex[d]
			filtered := list[:0]
			for _, p := range list {
				if p != path {
					filtered = append(filtered, p)
				}
			}
			m.depIndex[d] = filtered
		}
	}

	vt := &VirtualTag{Path: path, Expression: expression, deps: deps}
	m.tags[path] = vt
	for _, d := range deps {
		m.depIndex[d] = append(m.depIndex[d], path)
	}
	return nil
}

// Delete removes a virtual tag.
func (m *Manager) Delete(path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if vt, ok := m.tags[path]; ok {
		for _, d := range vt.deps {
			list := m.depIndex[d]
			filtered := list[:0]
			for _, p := range list {
				if p != path {
					filtered = append(filtered, p)
				}
			}
			m.depIndex[d] = filtered
		}
		delete(m.tags, path)
	}
}

// Notify is called whenever a source tag changes. It recomputes all virtual
// tags that depend (directly or indirectly) on changedPath.
func (m *Manager) Notify(changedPath string) {
	m.mu.RLock()
	dependents := append([]string{}, m.depIndex[changedPath]...)
	m.mu.RUnlock()

	eng := New(m.lookup)
	for _, vtPath := range dependents {
		m.mu.RLock()
		vt, ok := m.tags[vtPath]
		m.mu.RUnlock()
		if !ok {
			continue
		}
		val, err := eng.Eval(vt.Expression)
		if err == nil && m.onChange != nil {
			m.onChange(vtPath, val)
		}
	}
}

// Eval evaluates a one-off expression (for testing / API use).
func (m *Manager) Eval(expression string) (float64, error) {
	return New(m.lookup).Eval(expression)
}

// extractDeps does a dry-run evaluation with a recording lookup to find tags.
func (m *Manager) extractDeps(expression string) ([]string, error) {
	seen := map[string]bool{}
	var deps []string
	recorder := func(path string) (float64, bool) {
		if !seen[path] {
			seen[path] = true
			deps = append(deps, path)
		}
		return 0, true // return 0 so arithmetic doesn't fail
	}
	_, err := New(recorder).Eval(expression)
	return deps, err
}

// checkCircular returns an error if registering path with deps would create a cycle.
func (m *Manager) checkCircular(path string, deps []string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// DFS: if any dep transitively depends on path, it's circular.
	var visit func(current string, visited map[string]bool) bool
	visit = func(current string, visited map[string]bool) bool {
		if current == path {
			return true
		}
		if visited[current] {
			return false
		}
		visited[current] = true
		vt, ok := m.tags[current]
		if !ok {
			return false
		}
		for _, d := range vt.deps {
			if visit(d, visited) {
				return true
			}
		}
		return false
	}

	for _, d := range deps {
		if visit(d, map[string]bool{}) {
			return fmt.Errorf("expr: circular reference detected: %s -> %s", path, d)
		}
	}
	return nil
}
