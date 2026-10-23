package api

import (
	"encoding/json"
	"net/http"

	"github.com/Speth12/speths-screens/internal/audit"
)

func (s *Server) handleListAudit(w http.ResponseWriter, r *http.Request) {
	if s.rt.Audit == nil {
		writeErr(w, 503, "audit log not configured")
		return
	}
	q := r.URL.Query()
	opts := audit.QueryOptions{
		From:   parseInt64(q.Get("from"), 0),
		To:     parseInt64(q.Get("to"), 0),
		User:   q.Get("user"),
		Action: audit.Action(q.Get("action")),
		Limit:  int(parseInt64(q.Get("limit"), 500)),
	}
	entries, err := s.rt.Audit.Query(r.Context(), opts)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if entries == nil {
		entries = []*audit.Entry{}
	}
	writeJSON(w, 200, entries)
}

// recordAudit is a convenience helper for handlers that write to the audit log.
// It silently swallows errors — audit failures should never block the primary operation.
func (s *Server) recordAudit(r *http.Request, action audit.Action, target string, before, after any, meta string) {
	if s.rt.Audit == nil {
		return
	}
	var beforeJSON, afterJSON []byte
	if before != nil {
		beforeJSON, _ = json.Marshal(before)
	}
	if after != nil {
		afterJSON, _ = json.Marshal(after)
	}
	_ = s.rt.Audit.Record(r.Context(), claimedUser(r), action, target, beforeJSON, afterJSON, meta)
}
