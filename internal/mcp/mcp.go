// Package mcp implements the Model Context Protocol server (2025-03-26 spec)
// over HTTP for the Speth's Screens runtime. Claude Code (or any MCP client) connects
// to POST /mcp with JSON-RPC 2.0 messages.
//
// Supported methods:
//
//	initialize, initialized, ping
//	resources/list, resources/read
//	tools/list, tools/call
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Speth12/Speths_Screens/internal/eventbus"
	"github.com/Speth12/Speths_Screens/internal/runtime"
)

// ── JSON-RPC 2.0 types ────────────────────────────────────────────────────

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ── MCP protocol types ────────────────────────────────────────────────────

type serverInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type capabilities struct {
	Resources *struct{} `json:"resources,omitempty"`
	Tools     *struct{} `json:"tools,omitempty"`
}

type initializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	Capabilities    capabilities `json:"capabilities"`
	ServerInfo      serverInfo   `json:"serverInfo"`
}

type resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

type resourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text,omitempty"`
}

type tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type toolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type toolResult struct {
	Content []toolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// ── Handler ───────────────────────────────────────────────────────────────

// Handler implements http.Handler for the MCP endpoint.
type Handler struct {
	rt *runtime.Runtime
}

// New returns a new MCP Handler backed by the given runtime.
func New(rt *runtime.Runtime) *Handler {
	return &Handler{rt: rt}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "MCP requires POST", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()

	var req rpcRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeRPC(w, rpcResponse{
			JSONRPC: "2.0",
			Error:   &rpcError{Code: -32700, Message: "parse error: " + err.Error()},
		})
		return
	}

	result, rpcErr := h.dispatch(r.Context(), req.Method, req.Params)
	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if rpcErr != nil {
		resp.Error = rpcErr
	} else {
		resp.Result = result
	}
	writeRPC(w, resp)
}

func writeRPC(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// ── Dispatch ──────────────────────────────────────────────────────────────

func (h *Handler) dispatch(ctx context.Context, method string, params json.RawMessage) (any, *rpcError) {
	switch method {
	case "initialize":
		return h.handleInitialize(params)
	case "initialized", "notifications/initialized":
		return map[string]any{}, nil
	case "ping":
		return map[string]any{}, nil
	case "resources/list":
		return h.handleResourcesList()
	case "resources/read":
		return h.handleResourcesRead(ctx, params)
	case "tools/list":
		return h.handleToolsList()
	case "tools/call":
		return h.handleToolsCall(ctx, params)
	default:
		return nil, &rpcError{Code: -32601, Message: "method not found: " + method}
	}
}

// ── initialize ────────────────────────────────────────────────────────────

func (h *Handler) handleInitialize(_ json.RawMessage) (any, *rpcError) {
	empty := struct{}{}
	return initializeResult{
		ProtocolVersion: "2025-03-26",
		Capabilities: capabilities{
			Resources: &empty,
			Tools:     &empty,
		},
		ServerInfo: serverInfo{Name: "x-hmi", Version: "0.1.0"},
	}, nil
}

// ── resources/list ────────────────────────────────────────────────────────

func (h *Handler) handleResourcesList() (any, *rpcError) {
	p := h.rt.Project()
	resources := []resource{
		{URI: "xhmi://project", Name: "Project", Description: "Full project JSON", MimeType: "application/json"},
		{URI: "xhmi://pages", Name: "Pages", Description: "List of HMI pages", MimeType: "application/json"},
		{URI: "xhmi://alarms", Name: "Active alarms", MimeType: "application/json"},
		{URI: "xhmi://recipes", Name: "Recipes", MimeType: "application/json"},
		{URI: "xhmi://datasources", Name: "Datasource status", MimeType: "application/json"},
	}
	if p != nil {
		for _, pg := range p.Pages {
			resources = append(resources, resource{
				URI:      "xhmi://page/" + pg.ID,
				Name:     "Page: " + pg.Name,
				MimeType: "application/json",
			})
		}
	}
	return map[string]any{"resources": resources}, nil
}

// ── resources/read ────────────────────────────────────────────────────────

func (h *Handler) handleResourcesRead(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var p struct {
		URI string `json:"uri"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid params"}
	}

	text, err := h.readResource(ctx, p.URI)
	if err != nil {
		return nil, &rpcError{Code: -32603, Message: err.Error()}
	}
	return map[string]any{
		"contents": []resourceContent{{URI: p.URI, MimeType: "application/json", Text: text}},
	}, nil
}

func (h *Handler) readResource(_ context.Context, uri string) (string, error) {
	proj := h.rt.Project()

	switch {
	case uri == "xhmi://project":
		b, err := json.MarshalIndent(proj, "", "  ")
		if err != nil {
			return "", err
		}
		return string(b), nil

	case uri == "xhmi://pages":
		if proj == nil {
			return "[]", nil
		}
		type pageInfo struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			WidgetCount int    `json:"widgetCount"`
		}
		pages := make([]pageInfo, len(proj.Pages))
		for i, pg := range proj.Pages {
			pages[i] = pageInfo{ID: pg.ID, Name: pg.Name, WidgetCount: len(pg.Widgets)}
		}
		b, _ := json.MarshalIndent(pages, "", "  ")
		return string(b), nil

	case strings.HasPrefix(uri, "xhmi://page/"):
		if proj == nil {
			return "", fmt.Errorf("no project loaded")
		}
		id := strings.TrimPrefix(uri, "xhmi://page/")
		for _, pg := range proj.Pages {
			if pg.ID == id || pg.Name == id {
				b, _ := json.MarshalIndent(pg, "", "  ")
				return string(b), nil
			}
		}
		return "", fmt.Errorf("page not found: %s", id)

	case uri == "xhmi://alarms":
		alarms := h.rt.Alarms.Events()
		b, _ := json.MarshalIndent(alarms, "", "  ")
		return string(b), nil

	case uri == "xhmi://recipes":
		if proj == nil || len(proj.Recipes) == 0 {
			return "[]", nil
		}
		b, _ := json.MarshalIndent(proj.Recipes, "", "  ")
		return string(b), nil

	case uri == "xhmi://datasources":
		type dsStatus struct {
			ID        string `json:"id"`
			Connected bool   `json:"connected"`
			LastError string `json:"lastError,omitempty"`
			TagCount  int    `json:"tagCount"`
		}
		var out []dsStatus
		for id, d := range h.rt.Drivers() {
			st := d.Status()
			out = append(out, dsStatus{
				ID:        id,
				Connected: st.Connected,
				LastError: st.LastError,
				TagCount:  st.TagCount,
			})
		}
		b, _ := json.MarshalIndent(out, "", "  ")
		return string(b), nil

	default:
		return "", fmt.Errorf("unknown resource URI: %s", uri)
	}
}

// ── tools/list ────────────────────────────────────────────────────────────

func (h *Handler) handleToolsList() (any, *rpcError) {
	strProp := func(desc string) map[string]any {
		return map[string]any{"type": "string", "description": desc}
	}
	tools := []tool{
		{
			Name:        "read_tag",
			Description: "Read the current value of a tag. Binding format: \"datasourceId:tagPath\".",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"binding": strProp("Tag binding, e.g. \"rest:Arp.Plc.Eclr/Main/Temperature\"")},
				"required":   []string{"binding"},
			},
		},
		{
			Name:        "write_tag",
			Description: "Write a value to a tag. Binding format: \"datasourceId:tagPath\".",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"binding": strProp("Tag binding"),
					"value":   map[string]any{"description": "Value to write (number, string, or bool)"},
				},
				"required": []string{"binding", "value"},
			},
		},
		{
			Name:        "list_alarms",
			Description: "List all currently active alarms.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "acknowledge_alarm",
			Description: "Acknowledge an active alarm by its event ID.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"id": strProp("Alarm event ID")},
				"required":   []string{"id"},
			},
		},
		{
			Name:        "list_recipes",
			Description: "List all recipes defined in the project.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "apply_recipe",
			Description: "Apply a recipe by its ID, writing all its tag values.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"id": strProp("Recipe ID")},
				"required":   []string{"id"},
			},
		},
		{
			Name:        "query_history",
			Description: "Query historian data for a tag. Returns up to `limit` samples between `from` and `to` (Unix nanoseconds).",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"binding": strProp("Tag binding"),
					"from":    map[string]any{"type": "integer", "description": "Start time (Unix ns, default: 1 hour ago)"},
					"to":      map[string]any{"type": "integer", "description": "End time (Unix ns, default: now)"},
					"limit":   map[string]any{"type": "integer", "description": "Max samples (default 100)"},
				},
				"required": []string{"binding"},
			},
		},
		{
			Name:        "get_project_info",
			Description: "Get a summary of the loaded project: name, pages, datasources, alarm rule count.",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "navigate_page",
			Description: "Broadcast a page navigation command to all connected HMI screens.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"page": strProp("Page name or ID")},
				"required":   []string{"page"},
			},
		},
	}
	return map[string]any{"tools": tools}, nil
}

// ── tools/call ────────────────────────────────────────────────────────────

func (h *Handler) handleToolsCall(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var p struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &rpcError{Code: -32602, Message: "invalid params"}
	}

	text, isErr, err := h.callTool(ctx, p.Name, p.Arguments)
	if err != nil {
		return toolResult{
			Content: []toolContent{{Type: "text", Text: err.Error()}},
			IsError: true,
		}, nil
	}
	return toolResult{
		Content: []toolContent{{Type: "text", Text: text}},
		IsError: isErr,
	}, nil
}

func (h *Handler) callTool(ctx context.Context, name string, args map[string]any) (string, bool, error) {
	switch name {

	case "read_tag":
		binding, _ := args["binding"].(string)
		if binding == "" {
			return "", true, fmt.Errorf("binding is required")
		}
		sep := strings.Index(binding, ":")
		if sep < 0 {
			return "", true, fmt.Errorf("invalid binding format (expected dsId:tagPath)")
		}
		path := binding[sep+1:]
		state, ok := h.rt.Store.Get(path)
		if !ok {
			return "", true, fmt.Errorf("tag not found: %s", binding)
		}
		b, _ := json.MarshalIndent(map[string]any{
			"binding": binding,
			"value":   state.Value,
			"quality": state.Quality,
			"ts":      time.Unix(0, state.TS).UTC().Format(time.RFC3339Nano),
		}, "", "  ")
		return string(b), false, nil

	case "write_tag":
		binding, _ := args["binding"].(string)
		value := args["value"]
		if binding == "" {
			return "", true, fmt.Errorf("binding is required")
		}
		sep := strings.Index(binding, ":")
		if sep < 0 {
			return "", true, fmt.Errorf("invalid binding format (expected dsId:tagPath)")
		}
		dsID := binding[:sep]
		path := binding[sep+1:]
		d := h.rt.Driver(dsID)
		if d == nil {
			return "", true, fmt.Errorf("datasource not found: %s", dsID)
		}
		if err := d.Write(ctx, path, value); err != nil {
			return "", true, fmt.Errorf("write failed: %w", err)
		}
		return fmt.Sprintf("wrote %v to %s", value, binding), false, nil

	case "list_alarms":
		events := h.rt.Alarms.Events()
		b, _ := json.MarshalIndent(events, "", "  ")
		if len(events) == 0 {
			return "No active alarms.", false, nil
		}
		return string(b), false, nil

	case "acknowledge_alarm":
		id, _ := args["id"].(string)
		if id == "" {
			return "", true, fmt.Errorf("id is required")
		}
		if !h.rt.Alarms.Acknowledge(id) {
			return "", true, fmt.Errorf("alarm event not found: %s", id)
		}
		return fmt.Sprintf("alarm %s acknowledged", id), false, nil

	case "list_recipes":
		proj := h.rt.Project()
		if proj == nil || len(proj.Recipes) == 0 {
			return "No recipes defined.", false, nil
		}
		type recipeSummary struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description,omitempty"`
			Entries     int    `json:"entries"`
		}
		summaries := make([]recipeSummary, len(proj.Recipes))
		for i, r := range proj.Recipes {
			desc := ""
			if r.Description != nil {
				desc = *r.Description
			}
			summaries[i] = recipeSummary{ID: r.ID, Name: r.Name, Description: desc, Entries: len(r.Entries)}
		}
		b, _ := json.MarshalIndent(summaries, "", "  ")
		return string(b), false, nil

	case "apply_recipe":
		id, _ := args["id"].(string)
		if id == "" {
			return "", true, fmt.Errorf("id is required")
		}
		proj := h.rt.Project()
		if proj == nil {
			return "", true, fmt.Errorf("no project loaded")
		}
		var recipeName string
		found := false
		for _, r := range proj.Recipes {
			if r.ID == id || r.Name == id {
				recipeName = r.Name
				found = true
				for _, e := range r.Entries {
					sep := strings.Index(e.Binding, ":")
					if sep < 0 {
						continue
					}
					dsID := e.Binding[:sep]
					path := e.Binding[sep+1:]
					d := h.rt.Driver(dsID)
					if d == nil {
						continue
					}
					_ = d.Write(ctx, path, e.Value)
				}
				break
			}
		}
		if !found {
			return "", true, fmt.Errorf("recipe not found: %s", id)
		}
		return fmt.Sprintf("recipe \"%s\" applied", recipeName), false, nil

	case "query_history":
		if h.rt.Historian == nil {
			return "", true, fmt.Errorf("historian not configured")
		}
		binding, _ := args["binding"].(string)
		if binding == "" {
			return "", true, fmt.Errorf("binding is required")
		}
		now := time.Now().UnixNano()
		from, _ := args["from"].(float64)
		to, _ := args["to"].(float64)
		limit, _ := args["limit"].(float64)
		if from == 0 {
			from = float64(now - int64(time.Hour))
		}
		if to == 0 {
			to = float64(now)
		}
		if limit == 0 {
			limit = 100
		}
		samples, err := h.rt.Historian.Query(ctx, binding, int64(from), int64(to), int(limit))
		if err != nil {
			return "", true, err
		}
		b, _ := json.MarshalIndent(samples, "", "  ")
		return string(b), false, nil

	case "get_project_info":
		proj := h.rt.Project()
		if proj == nil {
			return "No project loaded.", false, nil
		}
		info := map[string]any{
			"name":        proj.Name,
			"pages":       len(proj.Pages),
			"datasources": len(proj.Datasources),
			"alarmRules":  len(proj.AlarmRules),
			"recipes":     len(proj.Recipes),
		}
		b, _ := json.MarshalIndent(info, "", "  ")
		return string(b), false, nil

	case "navigate_page":
		page, _ := args["page"].(string)
		if page == "" {
			return "", true, fmt.Errorf("page is required")
		}
		proj := h.rt.Project()
		if proj == nil {
			return "", true, fmt.Errorf("no project loaded")
		}
		var pageID string
		for _, pg := range proj.Pages {
			if pg.ID == page || pg.Name == page {
				pageID = pg.ID
				break
			}
		}
		if pageID == "" {
			return "", true, fmt.Errorf("page not found: %s", page)
		}
		h.rt.Events.Publish(eventbus.Event{
			Type:    "hmi:navigate",
			Target:  pageID,
			Payload: map[string]string{"pageId": pageID},
		})
		return fmt.Sprintf("navigation broadcast to page %q (%s)", page, pageID), false, nil

	default:
		return "", true, fmt.Errorf("unknown tool: %s", name)
	}
}
