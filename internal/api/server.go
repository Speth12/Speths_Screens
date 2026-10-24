// Package api is the HTTP gateway: REST + WebSocket on chi.
package api

import (
	"net/http"

	"github.com/Speth12/Speths_Screens/internal/mcp"
	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/versionstore"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server bundles the chi router with a runtime reference.
type Server struct {
	rt       *runtime.Runtime
	versions *versionstore.Store
	router   chi.Router
	DevMode  bool // when true, JWT auth is bypassed (IDE / local dev)
}

// New builds a configured Server. assets and vs may be nil.
func New(rt *runtime.Runtime, assets http.Handler, vs ...*versionstore.Store) *Server {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(corsMiddleware)

	s := &Server{rt: rt, router: r}
	if len(vs) > 0 {
		s.versions = vs[0]
	}
	s.routes(assets)

	// MCP server: it can read the project and write tags, so it needs the
	// same login as the API, at engineer level (project.deploy).
	r.With(s.jwtMiddleware, s.requirePerm("project.deploy")).Mount("/mcp", mcp.New(rt))

	return s
}

// corsMiddleware allows cross-origin requests from any origin so the IDE
// (localhost:5173) can deploy directly to a remote runtime (e.g. PLC at
// 10.0.0.210:8080) without a proxy.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Handler returns the http.Handler for use by net/http.
func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) routes(assets http.Handler) {
	r := s.router

	// Public: login, read-only IDE endpoints (no session needed)
	r.Post("/api/v1/auth/login", s.handleLogin)
	r.Get("/api/v1/project", s.handleGetProject)
	r.Get("/api/v1/alive", s.handleAlive)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.jwtMiddleware)

		r.Get("/alive", s.handleAlive)
		r.Get("/whoami", s.handleWhoAmI)
		r.Get("/debug/demand", s.handleDebugDemand)

		r.With(s.requirePerm("project.deploy")).Post("/project", s.handlePostProject)

		r.Route("/datasources", func(r chi.Router) {
			r.Get("/", s.handleListDatasources)
			r.Get("/{id}/status", s.handleDatasourceStatus)
			r.Get("/{id}/tags", s.handleBrowseDatasource)
			// Testing makes the runtime connect to any address it is given.
			r.With(s.requirePerm("project.deploy")).Post("/test", s.handleTestDatasource)
		})

		r.Route("/tag", func(r chi.Router) {
			r.Get("/*", s.handleReadTag)
			r.With(s.requirePerm("tag.write")).Post("/*", s.handleWriteTag)
		})

		r.Get("/history", s.handleHistory)

		r.Route("/alarms", func(r chi.Router) {
			r.Get("/", s.handleListAlarms)
			r.Get("/history", s.handleAlarmHistory)
			r.With(s.requirePerm("alarm.ack")).Post("/{id}/ack", s.handleAckAlarm)
		})

		r.Route("/recipes", func(r chi.Router) {
			r.Get("/", s.handleListRecipes)
			r.Get("/history", s.handleRecipeHistory)
			r.Get("/pending", s.handleListPendingRecipes)
			r.With(s.requirePerm("recipe.apply")).Post("/{id}/apply", s.handleApplyRecipe)
			r.Post("/{id}/request", s.handleRequestRecipe)
			r.With(s.requirePerm("recipe.apply")).Post("/pending/{pendingId}/approve", s.handleApproveRecipe)
			r.With(s.requirePerm("recipe.apply")).Post("/pending/{pendingId}/reject", s.handleRejectRecipe)
		})

		r.Route("/versions", func(r chi.Router) {
			r.Get("/", s.handleListVersions)
			r.Get("/{id}", s.handleGetVersion)
			r.With(s.requirePerm("project.deploy")).Post("/{id}/restore", s.handleRestoreVersion)
		})

		r.Route("/namespace", func(r chi.Router) {
			r.Get("/", s.handleNSList)
			r.Get("/tree", s.handleNSChildren)
			r.Get("/search", s.handleNSSearch)
			r.Post("/", s.handleNSCreate)
			r.Put("/*", s.handleNSUpdate)
			r.Delete("/*", s.handleNSDelete)
		})

		r.Route("/assets", func(r chi.Router) {
			r.Get("/templates", s.handleListTemplates)
			r.Get("/templates/{id}", s.handleGetTemplate)
			r.With(s.requirePerm("project.deploy")).Post("/templates", s.handleRegisterTemplate)
			r.Get("/instances", s.handleListInstances)
			r.Get("/instances/{id}", s.handleGetInstance)
			r.With(s.requirePerm("project.deploy")).Post("/instances", s.handleCreateInstance)
			r.With(s.requirePerm("project.deploy")).Delete("/instances/{id}", s.handleDeleteInstance)
		})

		r.Route("/faceplates", func(r chi.Router) {
			r.With(s.requirePerm("project.deploy")).Post("/", s.handleRegisterFaceplateView)
			r.Get("/{instanceId}", s.handleListFaceplateViews)
			r.Get("/{instanceId}/{viewType}", s.handleGetFaceplateView)
		})

		r.With(s.requirePerm("project.deploy")).Get("/audit", s.handleListAudit)

		r.Route("/users", func(r chi.Router) {
			r.With(s.requirePerm("users.manage")).Get("/", s.handleListUsers)
			r.With(s.requirePerm("users.manage")).Post("/", s.handleCreateUser)
			r.With(s.requirePerm("users.manage")).Put("/{username}/role", s.handleSetUserRole)
			r.With(s.requirePerm("users.manage")).Put("/{username}/enabled", s.handleSetUserEnabled)
			r.With(s.requirePerm("users.manage")).Delete("/{username}", s.handleDeleteUser)
			r.Post("/{username}/password", s.handleChangePassword)
		})
	})

	r.Get("/ws/tags", s.handleWS)
	r.Get("/ws/alarms", s.handleAlarmWS)
	r.Get("/ws/events", s.handleEventsWS)

	if assets != nil {
		r.Handle("/*", assets)
	}
}
