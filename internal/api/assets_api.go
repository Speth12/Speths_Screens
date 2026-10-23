package api

import (
	"encoding/json"
	"net/http"

	"github.com/Speth12/speths-screens/internal/assets"
	"github.com/Speth12/speths-screens/internal/faceplate"
	"github.com/go-chi/chi/v5"
)

// ── Asset Templates ────────────────────────────────────────────────────────

func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	writeJSON(w, 200, s.rt.Assets.ListTemplates())
}

func (s *Server) handleGetTemplate(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	id := chi.URLParam(r, "id")
	tmpl, err := s.rt.Assets.ResolveTemplate(id)
	if err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, tmpl)
}

func (s *Server) handleRegisterTemplate(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	defer r.Body.Close()
	var tmpl assets.Template
	if err := json.NewDecoder(r.Body).Decode(&tmpl); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if err := s.rt.Assets.RegisterTemplate(&tmpl); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true, "id": tmpl.ID})
}

// ── Asset Instances ────────────────────────────────────────────────────────

func (s *Server) handleListInstances(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	writeJSON(w, 200, s.rt.Assets.ListInstances())
}

func (s *Server) handleGetInstance(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	id := chi.URLParam(r, "id")
	inst := s.rt.Assets.GetInstance(id)
	if inst == nil {
		writeErr(w, 404, "instance not found")
		return
	}
	ri, err := s.rt.Assets.Resolve(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, ri)
}

func (s *Server) handleCreateInstance(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	defer r.Body.Close()
	var inst assets.Instance
	if err := json.NewDecoder(r.Body).Decode(&inst); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if err := s.rt.Assets.CreateInstance(&inst); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	// Auto-publish NS paths for the new instance.
	if s.rt.Namespace != nil {
		paths, err := s.rt.Assets.NSTagPaths(inst.ID)
		if err == nil {
			for _, p := range paths {
				_, _ = s.rt.Namespace.GetOrCreate(p, "tag")
			}
		}
	}
	writeJSON(w, 201, map[string]any{"ok": true, "id": inst.ID})
}

func (s *Server) handleDeleteInstance(w http.ResponseWriter, r *http.Request) {
	if s.rt.Assets == nil {
		writeErr(w, 503, "asset registry not configured")
		return
	}
	id := chi.URLParam(r, "id")
	if s.rt.Assets.GetInstance(id) == nil {
		writeErr(w, 404, "instance not found")
		return
	}
	s.rt.Assets.DeleteInstance(id)
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ── Faceplates ─────────────────────────────────────────────────────────────

func (s *Server) handleListFaceplateViews(w http.ResponseWriter, r *http.Request) {
	if s.rt.Faceplates == nil {
		writeErr(w, 503, "faceplate registry not configured")
		return
	}
	instanceID := chi.URLParam(r, "instanceId")
	views, err := s.rt.Faceplates.Resolve(instanceID)
	if err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, views)
}

func (s *Server) handleGetFaceplateView(w http.ResponseWriter, r *http.Request) {
	if s.rt.Faceplates == nil {
		writeErr(w, 503, "faceplate registry not configured")
		return
	}
	instanceID := chi.URLParam(r, "instanceId")
	viewType := faceplate.ViewType(chi.URLParam(r, "viewType"))
	view, err := s.rt.Faceplates.GetView(instanceID, viewType)
	if err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, view)
}

func (s *Server) handleRegisterFaceplateView(w http.ResponseWriter, r *http.Request) {
	if s.rt.Faceplates == nil {
		writeErr(w, 503, "faceplate registry not configured")
		return
	}
	defer r.Body.Close()
	var view faceplate.View
	if err := json.NewDecoder(r.Body).Decode(&view); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if err := s.rt.Faceplates.Register(&view); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true})
}
