// Package namespace implements the Speth's Screens Unified Namespace (UNS).
//
// Every tag, asset, folder, and virtual tag in the system lives in a
// single hierarchical tree addressed by dot-separated paths:
//
//	Plant1.Line1.Tank101.Level
//
// Drivers publish their raw addresses into the namespace during project
// load; the namespace owns the canonical path.
package namespace

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// NodeType classifies a namespace node.
type NodeType string

const (
	NodeFolder     NodeType = "folder"
	NodeAsset      NodeType = "asset"
	NodeTag        NodeType = "tag"
	NodeVirtualTag NodeType = "virtual"
)

// Node is one entry in the namespace tree.
type Node struct {
	Path        string            `json:"path"`
	Name        string            `json:"name"`
	Type        NodeType          `json:"type"`
	DataType    string            `json:"dataType,omitempty"`  // float, bool, string, int
	Description string            `json:"description,omitempty"`
	Unit        string            `json:"unit,omitempty"`
	DriverID    string            `json:"driverId,omitempty"`   // source driver
	DriverAddr  string            `json:"driverAddr,omitempty"` // raw driver address
	Expression  string            `json:"expression,omitempty"` // for virtual tags
	Meta        map[string]string `json:"meta,omitempty"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`

	// runtime-only, not serialised
	children map[string]*Node // keyed by child name
	parent   *Node
}

// Tree is the concurrent-safe namespace tree.
type Tree struct {
	mu    sync.RWMutex
	nodes map[string]*Node // flat index: path -> node
	root  *Node
}

// New returns an empty namespace tree with a root folder at "".
func New() *Tree {
	root := &Node{
		Path:      "",
		Name:      "",
		Type:      NodeFolder,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		children:  make(map[string]*Node),
	}
	return &Tree{
		nodes: map[string]*Node{"": root},
		root:  root,
	}
}

// CreateNode creates a node at the given dot-separated path.
// Intermediate folder nodes are created automatically.
func (t *Tree) CreateNode(path string, typ NodeType, opts ...Option) (*Node, error) {
	if path == "" {
		return nil, errors.New("namespace: path must not be empty")
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, exists := t.nodes[path]; exists {
		return nil, fmt.Errorf("namespace: node already exists: %s", path)
	}

	// ensure parent chain
	parts := strings.Split(path, ".")
	name := parts[len(parts)-1]
	parent, err := t.ensureFolders(parts[:len(parts)-1])
	if err != nil {
		return nil, err
	}

	now := time.Now()
	n := &Node{
		Path:      path,
		Name:      name,
		Type:      typ,
		CreatedAt: now,
		UpdatedAt: now,
		children:  make(map[string]*Node),
		parent:    parent,
	}
	for _, o := range opts {
		o(n)
	}
	parent.children[name] = n
	t.nodes[path] = n
	return n, nil
}

// GetOrCreate returns the node at path, creating it (as typ) if absent.
func (t *Tree) GetOrCreate(path string, typ NodeType, opts ...Option) (*Node, error) {
	t.mu.RLock()
	if n, ok := t.nodes[path]; ok {
		t.mu.RUnlock()
		return n, nil
	}
	t.mu.RUnlock()
	return t.CreateNode(path, typ, opts...)
}

// DeleteNode removes a leaf node. Returns error if the node has children.
func (t *Tree) DeleteNode(path string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	n, ok := t.nodes[path]
	if !ok {
		return fmt.Errorf("namespace: node not found: %s", path)
	}
	if len(n.children) > 0 {
		return fmt.Errorf("namespace: node %s has children; delete them first", path)
	}
	if n.parent != nil {
		delete(n.parent.children, n.Name)
	}
	delete(t.nodes, path)
	return nil
}

// MoveNode renames/relocates a node (and all its descendants).
func (t *Tree) MoveNode(oldPath, newPath string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	n, ok := t.nodes[oldPath]
	if !ok {
		return fmt.Errorf("namespace: node not found: %s", oldPath)
	}
	if _, exists := t.nodes[newPath]; exists {
		return fmt.Errorf("namespace: destination already exists: %s", newPath)
	}

	// collect all descendants
	affected := map[string]*Node{}
	t.collectSubtree(n, affected)

	// detach from old parent
	if n.parent != nil {
		delete(n.parent.children, n.Name)
	}

	// compute new name and re-attach under new parent
	newParts := strings.Split(newPath, ".")
	newName := newParts[len(newParts)-1]
	newParent, err := t.ensureFolders(newParts[:len(newParts)-1])
	if err != nil {
		return err
	}

	// rewrite paths for the whole subtree
	for oldP, node := range affected {
		suffix := strings.TrimPrefix(oldP, oldPath)
		newP := newPath + suffix
		delete(t.nodes, oldP)
		node.Path = newP
		t.nodes[newP] = node
	}
	n.Name = newName
	n.parent = newParent
	newParent.children[newName] = n
	return nil
}

// ResolvePath returns the node at path, or nil if not found.
func (t *Tree) ResolvePath(path string) *Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.nodes[path]
}

// GetChildren returns the immediate children of path.
func (t *Tree) GetChildren(path string) ([]*Node, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	n, ok := t.nodes[path]
	if !ok {
		return nil, fmt.Errorf("namespace: node not found: %s", path)
	}
	out := make([]*Node, 0, len(n.children))
	for _, c := range n.children {
		out = append(out, c)
	}
	return out, nil
}

// Search returns all nodes whose path or name contains query (case-insensitive).
// typ is optional; pass "" to search all types.
func (t *Tree) Search(query string, typ NodeType) []*Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	q := strings.ToLower(query)
	var out []*Node
	for _, n := range t.nodes {
		if n.Path == "" {
			continue
		}
		if typ != "" && n.Type != typ {
			continue
		}
		if strings.Contains(strings.ToLower(n.Path), q) ||
			strings.Contains(strings.ToLower(n.Name), q) {
			out = append(out, n)
		}
	}
	return out
}

// All returns every non-root node (snapshot).
func (t *Tree) All() []*Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := make([]*Node, 0, len(t.nodes))
	for _, n := range t.nodes {
		if n.Path != "" {
			out = append(out, n)
		}
	}
	return out
}

// Len returns the number of non-root nodes.
func (t *Tree) Len() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.nodes) - 1
}

// PublishDriverTag upserts a tag node in the namespace, mapping a driver
// address to a canonical namespace path.
func (t *Tree) PublishDriverTag(nsPath, driverID, driverAddr, dataType string) (*Node, error) {
	return t.GetOrCreate(nsPath, NodeTag,
		WithDriver(driverID, driverAddr),
		WithDataType(dataType),
	)
}

// ── Serialisation ──────────────────────────────────────────────────────────

type serialNode struct {
	Path        string            `json:"path"`
	Type        NodeType          `json:"type"`
	DataType    string            `json:"dataType,omitempty"`
	Description string            `json:"description,omitempty"`
	Unit        string            `json:"unit,omitempty"`
	DriverID    string            `json:"driverId,omitempty"`
	DriverAddr  string            `json:"driverAddr,omitempty"`
	Expression  string            `json:"expression,omitempty"`
	Meta        map[string]string `json:"meta,omitempty"`
}

// MarshalJSON serialises the tree as a flat list of nodes.
func (t *Tree) MarshalJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	var list []serialNode
	for _, n := range t.nodes {
		if n.Path == "" {
			continue
		}
		list = append(list, serialNode{
			Path:        n.Path,
			Type:        n.Type,
			DataType:    n.DataType,
			Description: n.Description,
			Unit:        n.Unit,
			DriverID:    n.DriverID,
			DriverAddr:  n.DriverAddr,
			Expression:  n.Expression,
			Meta:        n.Meta,
		})
	}
	return json.Marshal(list)
}

// UnmarshalJSON restores a tree from a flat list of nodes.
func (t *Tree) UnmarshalJSON(b []byte) error {
	var list []serialNode
	if err := json.Unmarshal(b, &list); err != nil {
		return err
	}
	fresh := New()
	for _, s := range list {
		_, err := fresh.GetOrCreate(s.Path, s.Type,
			WithDataType(s.DataType),
			WithDescription(s.Description),
			WithUnit(s.Unit),
			WithDriver(s.DriverID, s.DriverAddr),
			WithExpression(s.Expression),
			WithMeta(s.Meta),
		)
		if err != nil {
			return err
		}
	}
	t.mu.Lock()
	t.nodes = fresh.nodes
	t.root = fresh.root
	t.mu.Unlock()
	return nil
}

// ── internal helpers ───────────────────────────────────────────────────────

// ensureFolders creates any missing intermediate folder nodes.
// Must be called with t.mu held for writing.
func (t *Tree) ensureFolders(parts []string) (*Node, error) {
	current := t.root
	for i, p := range parts {
		child, ok := current.children[p]
		if !ok {
			path := strings.Join(parts[:i+1], ".")
			now := time.Now()
			child = &Node{
				Path:      path,
				Name:      p,
				Type:      NodeFolder,
				CreatedAt: now,
				UpdatedAt: now,
				children:  make(map[string]*Node),
				parent:    current,
			}
			current.children[p] = child
			t.nodes[path] = child
		}
		current = child
	}
	return current, nil
}

func (t *Tree) collectSubtree(n *Node, out map[string]*Node) {
	out[n.Path] = n
	for _, c := range n.children {
		t.collectSubtree(c, out)
	}
}

// ── Functional options ─────────────────────────────────────────────────────

// Option is a functional option for CreateNode / GetOrCreate.
type Option func(*Node)

func WithDataType(dt string) Option {
	return func(n *Node) { if dt != "" { n.DataType = dt } }
}
func WithDescription(d string) Option {
	return func(n *Node) { n.Description = d }
}
func WithUnit(u string) Option {
	return func(n *Node) { n.Unit = u }
}
func WithDriver(id, addr string) Option {
	return func(n *Node) { n.DriverID = id; n.DriverAddr = addr }
}
func WithExpression(expr string) Option {
	return func(n *Node) { n.Expression = expr }
}
func WithMeta(m map[string]string) Option {
	return func(n *Node) { if m != nil { n.Meta = m } }
}
