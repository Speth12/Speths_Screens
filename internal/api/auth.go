package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/security"
)

type ctxKey string

const (
	ctxUser ctxKey = "user"
	ctxRole ctxKey = "role"
)

// claimedUser returns the username stored in the request context (empty if no auth).
func claimedUser(r *http.Request) string {
	v, _ := r.Context().Value(ctxUser).(string)
	return v
}

// claimedRole returns the role stored in the request context.
func claimedRole(r *http.Request) security.Role {
	v, _ := r.Context().Value(ctxRole).(security.Role)
	return v
}

// loginRequired reports whether requests need a token: the loaded project
// asks for logins (security.mode "login"), the runtime has a user store, and
// it is not in dev mode (which listens on 127.0.0.1 only).
func (s *Server) loginRequired() bool {
	return !s.DevMode && s.rt.Security != nil && s.rt.LoginRequired()
}

// jwtMiddleware validates Bearer tokens. Without loginRequired it injects
// "anonymous" / "admin" so all routes remain accessible.
func (s *Server) jwtMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.loginRequired() {
			ctx := context.WithValue(r.Context(), ctxUser, "anonymous")
			ctx = context.WithValue(ctx, ctxRole, security.RoleAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			writeErr(w, 401, "authorization required")
			return
		}
		token := strings.TrimPrefix(authHeader, "Bearer ")
		username, role, err := s.rt.Security.VerifyToken(token)
		if errors.Is(err, security.ErrPasswordChangeRequired) {
			writeErr(w, 403, "password change required")
			return
		}
		if err != nil {
			writeErr(w, 401, "invalid or expired token")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUser, username)
		ctx = context.WithValue(ctx, ctxRole, role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requirePerm returns a middleware that checks the caller has permission.
func (s *Server) requirePerm(perm security.Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := claimedRole(r)
			if !security.HasPermission(role, perm) {
				writeErr(w, 403, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ── Auth handlers ──────────────────────────────────────────────────────────

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	defer r.Body.Close()
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	token, user, err := s.rt.Security.Login(r.Context(), body.Username, body.Password)
	if err != nil {
		writeErr(w, 401, "invalid credentials")
		return
	}
	if s.rt.Audit != nil {
		_ = s.rt.Audit.Record(r.Context(), user.Username, "login", "", nil, nil, "")
	}
	writeJSON(w, 200, map[string]any{
		"token":              token,
		"username":           user.Username,
		"role":               user.Role,
		"mustChangePassword": user.MustChangePassword, // the token then only allows POST /auth/password
	})
}

// handleChangePassword changes the caller's own password:
// {"currentPassword", "newPassword"} with a Bearer token, including one that
// only allows this. The caller logs in again afterwards. Changing the first
// admin's password deletes the file that held it.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if s.rt.Security == nil {
		writeErr(w, 503, "security not configured")
		return
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeErr(w, 401, "authorization required")
		return
	}
	username, _, _, err := s.rt.Security.VerifyTokenAllowChange(token)
	if err != nil {
		writeErr(w, 401, "invalid or expired token")
		return
	}
	defer r.Body.Close()
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if err := s.rt.Security.ChangeOwnPassword(r.Context(), username, body.CurrentPassword, body.NewPassword); err != nil {
		writeErr(w, 400, strings.TrimPrefix(err.Error(), "security: "))
		return
	}
	if username == "admin" && s.rt.InitialAdminFile != "" {
		if err := os.Remove(s.rt.InitialAdminFile); err == nil {
			log.Printf("[SECURITY] first admin password changed; removed %s", s.rt.InitialAdminFile)
		}
	}
	if s.rt.Audit != nil {
		_ = s.rt.Audit.Record(r.Context(), username, audit.ActionUserPassword, username, nil, nil, "")
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleWhoAmI(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"username": claimedUser(r),
		"role":     claimedRole(r),
	})
}
