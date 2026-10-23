package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// wsRequest is the inbound message format from clients.
type wsRequest struct {
	Subscribe   []string `json:"subscribe,omitempty"`
	Unsubscribe []string `json:"unsubscribe,omitempty"`
}

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
