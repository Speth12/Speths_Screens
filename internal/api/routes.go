package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarmstore"
	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/recipestore"
	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/go-chi/chi/v5"
)

// ── Versions ───────────────────────────────────────────────────────────────

func (s *Server) handleListVersions(w http.ResponseWriter, r *http.Request) {
	if s.versions == nil {
		writeErr(w, 503, "version store not configured")
		return
	}
	limit := int(parseInt64(r.URL.Query().Get("limit"), 50))
	metas, err := s.versions.List(r.Context(), limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, metas)
}

func (s *Server) handleGetVersion(w http.ResponseWriter, r *http.Request) {
	if s.versions == nil {
		writeErr(w, 503, "version store not configured")
		return
	}
	id := parseInt64(chi.URLParam(r, "id"), 0)
	if id == 0 {
		writeErr(w, 400, "invalid id")
		return
	}
	v, err := s.versions.Get(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if v == nil {
		writeErr(w, 404, "version not found")
		return
	}
	writeJSON(w, 200, v)
}

func (s *Server) handleRestoreVersion(w http.ResponseWriter, r *http.Request) {
	if s.versions == nil {
		writeErr(w, 503, "version store not configured")
		return
	}
	id := parseInt64(chi.URLParam(r, "id"), 0)
	if id == 0 {
		writeErr(w, 400, "invalid id")
		return
	}
	v, err := s.versions.Get(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if v == nil {
		writeErr(w, 404, "version not found")
		return
	}
	p, err := project.Parse(v.Project)
	if err != nil {
		writeErr(w, 500, "stored project invalid: "+err.Error())
		return
	}
	if err := s.rt.LoadProject(r.Context(), p); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	// Save the restore itself as a new version so the log stays append-only.
	label := fmt.Sprintf("restore of version %d", id)
	newID, _ := s.versions.Save(r.Context(), v.Project, label)
	writeJSON(w, 200, map[string]any{"ok": true, "restoredFrom": id, "newVersionId": newID})
}

func (s *Server) handleTestDatasource(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var ds project.Datasource
	if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	if ds.Type == "" {
		writeErr(w, 400, "type is required")
		return
	}
	st := s.rt.TestDatasource(r.Context(), ds)
	writeJSON(w, 200, st)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func (s *Server) handleAlive(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	p := s.rt.Project()
	if p == nil {
		writeJSON(w, 200, nil)
		return
	}
	writeJSON(w, 200, p)
}

func (s *Server) handlePostProject(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeErr(w, 400, "invalid json: "+err.Error())
		return
	}
	p, err := project.Parse(raw)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := s.rt.LoadProject(r.Context(), p); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var versionID int64
	if s.versions != nil {
		label := r.URL.Query().Get("label")
		versionID, _ = s.versions.Save(r.Context(), raw, label)
	}
	s.recordAudit(r, audit.ActionProjectDeploy, "", nil, nil, fmt.Sprintf("pages=%d datasources=%d", len(p.Pages), len(p.Datasources)))
	writeJSON(w, 200, map[string]any{"ok": true, "datasources": len(p.Datasources), "pages": len(p.Pages), "versionId": versionID})
}

func (s *Server) handleListDatasources(w http.ResponseWriter, r *http.Request) {
	type entry struct {
		ID        string `json:"id"`
		Connected bool   `json:"connected"`
		LastError string `json:"lastError,omitempty"`
		TagCount  int    `json:"tagCount"`
	}
	out := []entry{}
	for id, d := range s.rt.Drivers() {
		st := d.Status()
		out = append(out, entry{ID: id, Connected: st.Connected, LastError: st.LastError, TagCount: st.TagCount})
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleDatasourceStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d := s.rt.Driver(id)
	if d == nil {
		writeErr(w, 404, "datasource not found")
		return
	}
	writeJSON(w, 200, d.Status())
}

func (s *Server) handleBrowseDatasource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d := s.rt.Driver(id)
	if d == nil {
		writeErr(w, 404, "datasource not found")
		return
	}
	defs, err := d.Browse(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, defs)
}

func tagPathFromRequest(r *http.Request) string {
	// Use RawPath when available so %2F in the tag path isn't split by the router.
	raw := r.URL.RawPath
	if raw == "" {
		raw = r.URL.Path
	}
	idx := strings.Index(raw, "/tag/")
	if idx < 0 {
		return chi.URLParam(r, "*")
	}
	decoded, err := url.PathUnescape(raw[idx+5:])
	if err != nil {
		return chi.URLParam(r, "*")
	}
	return decoded
}

func (s *Server) handleReadTag(w http.ResponseWriter, r *http.Request) {
	path := tagPathFromRequest(r)
	state, ok := s.rt.Store.Get(path)
	if !ok {
		writeErr(w, 404, "tag not found")
		return
	}
	writeJSON(w, 200, state)
}

// handleWriteTag writes one tag through the write pipeline. The body is
// {"datasource", "value", "widgetId"?}; datasource "ns" writes a namespace
// path. The reply is the pipeline's result with its HTTP status; "ok" is
// kept for older clients and is true only when the write was confirmed or
// sent.
func (s *Server) handleWriteTag(w http.ResponseWriter, r *http.Request) {
	path := tagPathFromRequest(r)
	defer r.Body.Close()
	var body struct {
		Datasource string `json:"datasource"`
		Value      any    `json:"value"`
		WidgetID   string `json:"widgetId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if body.Datasource == "" {
		writeErr(w, 400, "datasource is required")
		return
	}
	res := s.writeTag(r, runtime.WriteRequest{
		Binding: body.Datasource + ":" + path, Value: body.Value, WidgetID: body.WidgetID,
	})
	writeJSON(w, res.Code, writeReply(res))
}

// writeTag runs one write and records it in the audit trail and, when it
// went through, in the historian.
func (s *Server) writeTag(r *http.Request, req runtime.WriteRequest) runtime.WriteResult {
	res := s.rt.WriteTag(r.Context(), req)
	if s.rt.Historian != nil && (res.Status == runtime.WriteConfirmed || res.Status == runtime.WriteSent) {
		_ = s.rt.Historian.RecordWrite(req.Binding, req.Value)
	}
	meta := res.Status
	if res.Reason != "" {
		meta += ": " + res.Reason
	}
	s.recordAudit(r, audit.ActionTagWrite, req.Binding, nil, req.Value, meta)
	return res
}

// writeReply is the JSON answer to a write.
func writeReply(res runtime.WriteResult) map[string]any {
	out := map[string]any{
		"ok":     res.Status == runtime.WriteConfirmed || res.Status == runtime.WriteSent,
		"status": res.Status,
	}
	if res.Reason != "" {
		out["reason"] = res.Reason
		out["error"] = res.Reason // older clients read "error"
	}
	if res.Value != nil {
		out["value"] = res.Value
	}
	return out
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if s.rt.Historian == nil {
		writeErr(w, 503, "historian not configured")
		return
	}
	q := r.URL.Query()
	from := parseInt64(q.Get("from"), 0)
	to := parseInt64(q.Get("to"), time.Now().UnixNano())
	limit := int(parseInt64(q.Get("limit"), 1000))

	// ?bucket=1m aggregates results into time buckets (e.g. 30s, 5m, 1h).
	var bucketDur time.Duration
	if b := q.Get("bucket"); b != "" {
		var err error
		bucketDur, err = time.ParseDuration(b)
		if err != nil || bucketDur <= 0 {
			writeErr(w, 400, "invalid bucket duration (use Go duration: 30s, 5m, 1h)")
			return
		}
	}

	// ?paths=a,b,c queries multiple tags; ?path=x is the single-tag form.
	var paths []string
	if ps := q.Get("paths"); ps != "" {
		for _, p := range strings.Split(ps, ",") {
			if p = strings.TrimSpace(p); p != "" {
				paths = append(paths, p)
			}
		}
	} else if p := q.Get("path"); p != "" {
		paths = []string{p}
	}
	if len(paths) == 0 {
		writeErr(w, 400, "path or paths is required")
		return
	}

	ctx := r.Context()

	// Multi-tag aggregated.
	if len(paths) > 1 && bucketDur > 0 {
		result, err := s.rt.Historian.QueryMultiAggregated(ctx, paths, from, to, bucketDur, limit)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, result)
		return
	}

	// Multi-tag raw.
	if len(paths) > 1 {
		result, err := s.rt.Historian.QueryMulti(ctx, paths, from, to, limit)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, result)
		return
	}

	// Single-tag aggregated.
	path := paths[0]
	if bucketDur > 0 {
		aggs, err := s.rt.Historian.QueryAggregated(ctx, path, from, to, bucketDur, limit)
		if err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, aggs)
		return
	}

	// Single-tag raw (original behaviour, with CSV support).
	samples, err := s.rt.Historian.Query(ctx, path, from, to, limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	accept := r.Header.Get("Accept")
	if q.Get("format") == "csv" || strings.Contains(accept, "text/csv") {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="history.csv"`)
		w.WriteHeader(200)
		fmt.Fprintf(w, "timestamp,value,quality\n")
		for _, smpl := range samples {
			t := time.Unix(0, smpl.TS)
			fmt.Fprintf(w, "%s,%v,%s\n", t.UTC().Format(time.RFC3339Nano), smpl.Value, smpl.Quality)
		}
		return
	}

	writeJSON(w, 200, samples)
}

func parseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return n
}

// ── Alarms ─────────────────────────────────────────────────────────────────

func (s *Server) handleListAlarms(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.rt.Alarms.Events())
}

func (s *Server) handleAlarmHistory(w http.ResponseWriter, r *http.Request) {
	if s.rt.AlarmStore == nil {
		writeErr(w, 503, "alarm history not configured")
		return
	}
	q := r.URL.Query()
	opts := alarmstore.QueryOptions{
		From:     parseInt64(q.Get("from"), 0),
		To:       parseInt64(q.Get("to"), 0),
		Severity: q.Get("severity"),
		Limit:    int(parseInt64(q.Get("limit"), 500)),
	}
	events, err := s.rt.AlarmStore.Query(r.Context(), opts)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, events)
}

func (s *Server) handleAckAlarm(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !s.rt.Alarms.Acknowledge(id) {
		writeErr(w, 404, "event not found")
		return
	}
	s.recordAudit(r, audit.ActionAlarmAck, id, nil, nil, "")
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ── Recipes ────────────────────────────────────────────────────────────────

func (s *Server) handleListRecipes(w http.ResponseWriter, r *http.Request) {
	p := s.rt.Project()
	if p == nil || len(p.Recipes) == 0 {
		writeJSON(w, 200, []struct{}{})
		return
	}
	writeJSON(w, 200, p.Recipes)
}

func (s *Server) handleRecipeHistory(w http.ResponseWriter, r *http.Request) {
	if s.rt.Recipes == nil {
		writeErr(w, 503, "recipe store not configured")
		return
	}
	q := r.URL.Query()
	recipeID := q.Get("recipeId")
	limit := int(parseInt64(q.Get("limit"), 50))
	runs, err := s.rt.Recipes.ListRuns(r.Context(), recipeID, limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if runs == nil {
		runs = []*recipestore.Run{}
	}
	writeJSON(w, 200, runs)
}

func (s *Server) handleListPendingRecipes(w http.ResponseWriter, r *http.Request) {
	if s.rt.Recipes == nil {
		writeErr(w, 503, "recipe store not configured")
		return
	}
	status := recipestore.Status(r.URL.Query().Get("status"))
	if status == "" {
		status = recipestore.StatusPending
	}
	pending, err := s.rt.Recipes.ListPending(r.Context(), status, 100)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if pending == nil {
		pending = []*recipestore.PendingRequest{}
	}
	writeJSON(w, 200, pending)
}

// handleRequestRecipe creates a pending approval request (any authenticated user).
func (s *Server) handleRequestRecipe(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rec, name := s.findRecipe(id)
	if rec == nil {
		writeErr(w, 404, "recipe not found")
		return
	}
	if s.rt.Recipes == nil {
		writeErr(w, 503, "recipe store not configured")
		return
	}
	entries := make([]recipestore.Entry, len(rec))
	for i, e := range rec {
		entries[i] = recipestore.Entry{Binding: e.Binding, Value: e.Value}
	}
	pendingID, err := s.rt.Recipes.CreatePending(r.Context(), recipestore.PendingRequest{
		RecipeID:    id,
		RecipeName:  name,
		RequestedBy: claimedUser(r),
		RequestedAt: time.Now(),
		Entries:     entries,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true, "pendingId": pendingID})
}

// handleApproveRecipe approves a pending request and executes it.
func (s *Server) handleApproveRecipe(w http.ResponseWriter, r *http.Request) {
	s.reviewRecipe(w, r, true)
}

func (s *Server) handleRejectRecipe(w http.ResponseWriter, r *http.Request) {
	s.reviewRecipe(w, r, false)
}

func (s *Server) reviewRecipe(w http.ResponseWriter, r *http.Request, approve bool) {
	if s.rt.Recipes == nil {
		writeErr(w, 503, "recipe store not configured")
		return
	}
	pendingID := parseInt64(chi.URLParam(r, "pendingId"), 0)
	if pendingID == 0 {
		writeErr(w, 400, "invalid pendingId")
		return
	}
	defer r.Body.Close()
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	reviewer := claimedUser(r)
	var (
		req *recipestore.PendingRequest
		err error
	)
	if approve {
		req, err = s.rt.Recipes.Approve(r.Context(), pendingID, reviewer, body.Note)
	} else {
		req, err = s.rt.Recipes.Reject(r.Context(), pendingID, reviewer, body.Note)
	}
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if !approve {
		writeJSON(w, 200, map[string]any{"ok": true, "status": "rejected"})
		return
	}
	// Execute the approved recipe.
	errs, applied := s.executeRecipeEntries(r, req.Entries)
	s.rt.Recipes.RecordRun(r.Context(), recipestore.Run{ //nolint
		RecipeID:     req.RecipeID,
		RecipeName:   req.RecipeName,
		AppliedBy:    reviewer,
		AppliedAt:    time.Now(),
		Entries:      req.Entries,
		AppliedCount: applied,
		Errors:       errs,
	})
	s.recordAudit(r, audit.ActionRecipeApply, req.RecipeID, nil, nil,
		fmt.Sprintf("via approval %d applied=%d errors=%d", pendingID, applied, len(errs)))
	if len(errs) > 0 {
		writeJSON(w, 207, map[string]any{"ok": false, "errors": errs, "applied": applied})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "applied": applied})
}

func (s *Server) handleApplyRecipe(w http.ResponseWriter, r *http.Request) {
	if s.rt.Project() == nil {
		writeErr(w, 503, "no project loaded")
		return
	}
	id := chi.URLParam(r, "id")
	rec, name := s.findRecipe(id)
	if rec == nil {
		writeErr(w, 404, "recipe not found")
		return
	}

	entries := make([]recipestore.Entry, len(rec))
	for i, e := range rec {
		entries[i] = recipestore.Entry{Binding: e.Binding, Value: e.Value}
	}
	errs, applied := s.executeRecipeEntries(r, entries)

	if s.rt.Recipes != nil {
		s.rt.Recipes.RecordRun(r.Context(), recipestore.Run{ //nolint
			RecipeID:     id,
			RecipeName:   name,
			AppliedBy:    claimedUser(r),
			AppliedAt:    time.Now(),
			Entries:      entries,
			AppliedCount: applied,
			Errors:       errs,
		})
	}
	s.recordAudit(r, audit.ActionRecipeApply, id, nil, nil,
		fmt.Sprintf("applied=%d errors=%d", applied, len(errs)))

	if len(errs) > 0 {
		writeJSON(w, 207, map[string]any{"ok": false, "errors": errs, "applied": applied})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "applied": applied})
}

// findRecipe looks up a recipe in the loaded project. Returns (entries, name) or (nil, "").
func (s *Server) findRecipe(id string) ([]project.RecipeEntry, string) {
	p := s.rt.Project()
	if p == nil {
		return nil, ""
	}
	for _, rec := range p.Recipes {
		if rec.ID == id {
			return rec.Entries, rec.Name
		}
	}
	return nil, ""
}

// executeRecipeEntries writes all tag entries, returns (errors, appliedCount).
func (s *Server) executeRecipeEntries(r *http.Request, entries []recipestore.Entry) ([]string, int) {
	var errs []string
	applied := 0
	// One at a time, in recipe order: a recipe may set a mode before a
	// setpoint that depends on it.
	for _, entry := range entries {
		res := s.writeTag(r, runtime.WriteRequest{Binding: entry.Binding, Value: entry.Value, Recipe: true})
		if res.Status != runtime.WriteConfirmed && res.Status != runtime.WriteSent {
			errs = append(errs, entry.Binding+": "+res.Status+": "+res.Reason)
			continue
		}
		applied++
	}
	return errs, applied
}
