package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// wsRequest is the inbound message format from clients.
type wsRequest struct {
	Subscribe   []string `json:"subscribe,omitempty"`
	Unsubscribe []string `json:"unsubscribe,omitempty"`
	Write       *wsWrite `json:"write,omitempty"`
}

// wsWrite asks for one write; the answer is a wsWriteResult with the same id.
type wsWrite struct {
	ID       string `json:"id"`
	Path     string `json:"path"` // binding: "ds:path" or "ns:path"
	Value    any    `json:"value"`
	WidgetID string `json:"widgetId,omitempty"`
}

type wsWriteResult struct {
	WriteResult wsWriteReply `json:"writeResult"`
}

type wsWriteReply struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
	Value  any    `json:"value,omitempty"`
	Code   int    `json:"code"`
}

// wsMaxWrites caps the writes one connection has waiting for read-back.
const wsMaxWrites = 8

// wsUpdate is the outbound format pushed to clients.
type wsUpdate struct {
	Path    string `json:"path"`
	Value   any    `json:"value"`
	Quality string `json:"quality"`
	Reason  string `json:"reason,omitempty"`
	TS      int64  `json:"ts"`
}

// wsConnSeq numbers WebSocket connections; each one is its own demand source.
var wsConnSeq atomic.Uint64

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// for dev IDE on different port — Day 5+ may tighten this
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("[WS] accept: %v", err)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "shutting down")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	log.Printf("[WS] client connected from %s", r.RemoteAddr)

	// Tags this client subscribes to are polled until it unsubscribes or
	// disconnects.
	demandSrc := fmt.Sprintf("ws:%d", wsConnSeq.Add(1))
	defer s.rt.ReleaseDemand(demandSrc)

	// One watcher per connection: a slow client skips intermediate values
	// but always receives the newest value of every tag it watches.
	watcher := s.rt.Store.Watch()
	defer watcher.Close()

	// Writes need a user: the token is sent when the connection opens
	// (?token=, since browsers cannot set headers on a WebSocket). Reading
	// needs none until defect 9.
	writer := s.wsWriter(r)
	writes := make(chan struct{}, wsMaxWrites)

	// reader goroutine: parse subscribe/unsubscribe requests
	go func() {
		subs := map[string]struct{}{} // only this goroutine touches it
		for {
			var req wsRequest
			if err := wsjson.Read(ctx, conn, &req); err != nil {
				cancel()
				return
			}
			var added, removed []string
			for _, p := range req.Subscribe {
				if _, exists := subs[p]; !exists {
					subs[p] = struct{}{}
					added = append(added, p)
				}
			}
			for _, p := range req.Unsubscribe {
				if _, exists := subs[p]; exists {
					delete(subs, p)
					removed = append(removed, p)
				}
			}
			if len(added) > 0 {
				watcher.Add(added...)
				s.rt.AddDemand(demandSrc, added...)
			}
			if len(removed) > 0 {
				watcher.Remove(removed...)
				s.rt.RemoveDemand(demandSrc, removed...)
			}
			if req.Write != nil {
				select {
				case writes <- struct{}{}:
					go func(wr wsWrite) {
						defer func() { <-writes }()
						reply := writer(ctx, wr)
						wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
						defer wcancel()
						_ = wsjson.Write(wctx, conn, wsWriteResult{WriteResult: reply})
					}(*req.Write)
				default:
					wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
					_ = wsjson.Write(wctx, conn, wsWriteResult{WriteResult: wsWriteReply{
						ID: req.Write.ID, Status: runtime.WriteFailed, Code: 429,
						Reason: fmt.Sprintf("more than %d writes waiting on this connection", wsMaxWrites),
					}})
					wcancel()
				}
			}
		}
	}()

	// writer loop: push the newest value of every changed tag
	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "bye")
			return
		case <-watcher.C():
			for _, u := range watcher.Drain() {
				wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
				err := wsjson.Write(wctx, conn, wsUpdate{
					Path:    u.Path,
					Value:   u.State.Value,
					Quality: u.State.Quality,
					Reason:  u.State.Reason,
					TS:      u.State.TS,
				})
				wcancel()
				if err != nil {
					log.Printf("[WS] write: %v", err)
					return
				}
			}
		}
	}
}

// handleAlarmWS streams alarm events to clients over WebSocket.
// On connect it sends all current events, then pushes incremental changes.
func (s *Server) handleAlarmWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("[WS/alarms] accept: %v", err)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "shutting down")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	log.Printf("[WS/alarms] client connected from %s", r.RemoteAddr)

	// Send snapshot of current events.
	snapshot := s.rt.Alarms.Events()
	for _, ev := range snapshot {
		wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
		_ = wsjson.Write(wctx, conn, ev)
		wcancel()
	}

	// Subscribe for changes.
	ch := s.rt.Alarms.Subscribe()
	defer s.rt.Alarms.Unsubscribe(ch)

	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "bye")
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
			err := wsjson.Write(wctx, conn, ev)
			wcancel()
			if err != nil {
				log.Printf("[WS/alarms] write: %v", err)
				return
			}
		}
	}
}

// handleEventsWS streams eventbus events to connected HMI screens.
// Used by the preview/runtime viewer to receive navigate_page commands and
// other runtime-to-client broadcasts without polling.
func (s *Server) handleEventsWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("[WS/events] accept: %v", err)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "shutting down")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	log.Printf("[WS/events] client connected from %s", r.RemoteAddr)

	ch, unsub := s.rt.Events.SubscribeAll()
	defer unsub()

	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "bye")
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
			err := wsjson.Write(wctx, conn, ev)
			wcancel()
			if err != nil {
				log.Printf("[WS/events] write: %v", err)
				return
			}
		}
	}
}

// for tests — verify the JSON shapes are what we promise
var _ = json.Marshal

// wsWriter returns the function that handles a WebSocket write for the user
// of this connection. Dev mode and a runtime without security count as
// Admin; otherwise the token sent when the connection opened decides.
func (s *Server) wsWriter(r *http.Request) func(context.Context, wsWrite) wsWriteReply {
	user, role, authErr := "anonymous", security.RoleAdmin, ""
	if s.rt.Security != nil && !s.DevMode {
		user, role = "", ""
		if tok := r.URL.Query().Get("token"); tok == "" {
			authErr = "writes need a login token (?token= when connecting)"
		} else if u, rl, err := s.rt.Security.VerifyToken(tok); err != nil {
			authErr = "invalid or expired token"
		} else {
			user, role = u, rl
		}
	}
	return func(ctx context.Context, wr wsWrite) wsWriteReply {
		if authErr != "" {
			return wsWriteReply{ID: wr.ID, Status: runtime.WriteFailed, Reason: authErr, Code: 401}
		}
		if !security.HasPermission(role, security.PermWriteTag) {
			return wsWriteReply{ID: wr.ID, Status: runtime.WriteFailed, Reason: "forbidden", Code: 403}
		}
		// writeTag audits under the request's user, so give it one.
		rctx := context.WithValue(ctx, ctxUser, user)
		rctx = context.WithValue(rctx, ctxRole, role)
		res := s.writeTag(r.WithContext(rctx), runtime.WriteRequest{Binding: wr.Path, Value: wr.Value, WidgetID: wr.WidgetID})
		return wsWriteReply{ID: wr.ID, Status: res.Status, Reason: res.Reason, Value: res.Value, Code: res.Code}
	}
}
