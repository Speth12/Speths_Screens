package api

import "net/http"

// handleDebugDemand lists every tag something needs, which driver tag it
// resolves to and which sources (project parts, WebSocket clients) need it.
func (s *Server) handleDebugDemand(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.rt.Demand())
}
