package api

import (
	"encoding/json"
	"net/http"

	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/go-chi/chi/v5"
)

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	users, err := s.rt.Security.ListUsers(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if users == nil {
		users = []*security.User{}
	}
	writeJSON(w, 200, users)
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	defer r.Body.Close()
	var body struct {
		Username string        `json:"username"`
		Password string        `json:"password"`
		Role     security.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if body.Role == "" {
		body.Role = security.RoleOperator
	}
	user, err := s.rt.Security.CreateUser(r.Context(), body.Username, body.Password, body.Role)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionUserCreate, body.Username, nil, nil, "")
	writeJSON(w, 201, user)
}

func (s *Server) handleSetUserRole(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	username := chi.URLParam(r, "username")
	defer r.Body.Close()
	var body struct {
		Role security.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if err := s.rt.Security.SetRole(r.Context(), username, body.Role); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, username, nil, nil, "role="+string(body.Role))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleSetUserEnabled(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	username := chi.URLParam(r, "username")
	defer r.Body.Close()
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if err := s.rt.Security.SetEnabled(r.Context(), username, body.Enabled); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	act := audit.ActionUserDisable
	if body.Enabled {
		act = audit.ActionConfigChange
	}
	s.recordAudit(r, act, username, nil, nil, "")
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	username := chi.URLParam(r, "username")
	if err := s.rt.Security.DeleteUser(r.Context(), username); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionUserDelete, username, nil, nil, "")
	writeJSON(w, 200, map[string]any{"ok": true})
}

// handleSetUserPassword sets another user's password (users.manage).
func (s *Server) handleSetUserPassword(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	username := chi.URLParam(r, "username")
	defer r.Body.Close()
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if err := s.rt.Security.ChangePassword(r.Context(), username, body.Password); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionUserPassword, username, nil, nil, "")
	writeJSON(w, 200, map[string]any{"ok": true})
}
