package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/namespace"
)

// GET /api/v1/namespace — list all nodes (flat)
func (s *Server) handleNSList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.rt.Namespace.All())
}

// GET /api/v1/namespace/tree?path=Plant1.Line1 — children of a path
func (s *Server) handleNSChildren(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	children, err := s.rt.Namespace.GetChildren(path)
	if err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, children)
}

// GET /api/v1/namespace/search?q=tank&type=tag
func (s *Server) handleNSSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	typ := namespace.NodeType(r.URL.Query().Get("type"))
	results := s.rt.Namespace.Search(q, typ)
	writeJSON(w, 200, results)
}

// POST /api/v1/namespace — create a node
// Body: {"path":"Plant1.Line1.Tank101.Level","type":"tag","dataType":"float","unit":"m","driverId":"opc1","driverAddr":"ns=2;s=Level"}
func (s *Server) handleNSCreate(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var body struct {
		Path        string             `json:"path"`
		Type        namespace.NodeType `json:"type"`
		DataType    string             `json:"dataType"`
		Description string             `json:"description"`
		Unit        string             `json:"unit"`
		DriverID    string             `json:"driverId"`
		DriverAddr  string             `json:"driverAddr"`
		Expression  string             `json:"expression"`
		Meta        map[string]string  `json:"meta"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if body.Path == "" {
		writeErr(w, 400, "path is required")
		return
	}
	if body.Type == "" {
		body.Type = namespace.NodeTag
	}
	n, err := s.rt.Namespace.CreateNode(body.Path, body.Type,
		namespace.WithDataType(body.DataType),
		namespace.WithDescription(body.Description),
		namespace.WithUnit(body.Unit),
		namespace.WithDriver(body.DriverID, body.DriverAddr),
		namespace.WithExpression(body.Expression),
		namespace.WithMeta(body.Meta),
	)
	status := 201
	if err != nil {
		// Node exists — upsert: update its driver binding and other fields.
		n = s.rt.Namespace.ResolvePath(body.Path)
		if n == nil {
			writeErr(w, 409, err.Error())
			return
		}
		status = 200
		if body.DriverID != "" {
			n.DriverID = body.DriverID
		}
		if body.DriverAddr != "" {
			n.DriverAddr = body.DriverAddr
		}
		if body.DataType != "" {
			n.DataType = body.DataType
		}
		if body.Description != "" {
			n.Description = body.Description
		}
		if body.Unit != "" {
			n.Unit = body.Unit
		}
		if body.Expression != "" {
			n.Expression = body.Expression
		}
		if body.Meta != nil {
			n.Meta = body.Meta
		}
	}
	s.rt.RebuildNSAliases()
	if n.DriverID != "" && n.DriverAddr != "" {
		s.rt.EnsureNSTagSubscribed(n.DriverID, n.DriverAddr)
	}
	writeJSON(w, status, n)
}

// PUT /api/v1/namespace/{path} — update an existing node's metadata
func (s *Server) handleNSUpdate(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.RawPath
	if raw == "" {
		raw = r.URL.Path
	}
	idx := strings.Index(raw, "/namespace/")
	if idx < 0 {
		writeErr(w, 400, "missing path")
		return
	}
	path := raw[idx+len("/namespace/"):]

	n := s.rt.Namespace.ResolvePath(path)
	if n == nil {
		writeErr(w, 404, "node not found: "+path)
		return
	}
	defer r.Body.Close()
	var body struct {
		DataType    *string           `json:"dataType"`
		Description *string           `json:"description"`
		Unit        *string           `json:"unit"`
		DriverID    *string           `json:"driverId"`
		DriverAddr  *string           `json:"driverAddr"`
		Expression  *string           `json:"expression"`
		Meta        map[string]string `json:"meta"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if body.DataType != nil {
		n.DataType = *body.DataType
	}
	if body.Description != nil {
		n.Description = *body.Description
	}
	if body.Unit != nil {
		n.Unit = *body.Unit
	}
	if body.DriverID != nil {
		n.DriverID = *body.DriverID
	}
	if body.DriverAddr != nil {
		n.DriverAddr = *body.DriverAddr
	}
	if body.Expression != nil {
		n.Expression = *body.Expression
	}
	if body.Meta != nil {
		n.Meta = body.Meta
	}
	s.rt.RebuildNSAliases()
	if n.DriverID != "" && n.DriverAddr != "" {
		s.rt.EnsureNSTagSubscribed(n.DriverID, n.DriverAddr)
	}
	writeJSON(w, 200, n)
}

// DELETE /api/v1/namespace/{path}
func (s *Server) handleNSDelete(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.RawPath
	if raw == "" {
		raw = r.URL.Path
	}
	idx := strings.Index(raw, "/namespace/")
	if idx < 0 {
		writeErr(w, 400, "missing path")
		return
	}
	path := raw[idx+len("/namespace/"):]
	if err := s.rt.Namespace.DeleteNode(path); err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	s.rt.RebuildNSAliases()
	writeJSON(w, 200, map[string]any{"ok": true})
}
