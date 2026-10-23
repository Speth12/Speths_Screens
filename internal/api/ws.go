package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
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
	TS      int64  `json:"ts"`
}

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

	// per-connection: paths → cancel func from tagstore.Subscribe
	subs := map[string]func(){}
	var subsMu sync.Mutex
	updates := make(chan tagstore.TagUpdate, 256)

	// reader goroutine: parse subscribe/unsubscribe requests
	go func() {
		for {
			var req wsRequest
			if err := wsjson.Read(ctx, conn, &req); err != nil {
				cancel()
				return
			}
			subsMu.Lock()
			for _, p := range req.Subscribe {
				if _, exists := subs[p]; exists {
					continue
				}
				ch, cancelSub := s.rt.Store.Subscribe(p)
				subs[p] = cancelSub
				log.Printf("[WS] subscribed %s", p)
				go fanIn(ctx, ch, updates)
			}
			for _, p := range req.Unsubscribe {
				if c, exists := subs[p]; exists {
					c()
					delete(subs, p)
				}
			}
			subsMu.Unlock()
		}
	}()

	// writer loop: push updates
	for {
		select {
		case <-ctx.Done():
			subsMu.Lock()
			for _, c := range subs {
				c()
			}
			subsMu.Unlock()
			conn.Close(websocket.StatusNormalClosure, "bye")
			return
		case u := <-updates:
			wctx, wcancel := context.WithTimeout(ctx, 2*time.Second)
			err := wsjson.Write(wctx, conn, wsUpdate{
				Path:    u.Path,
				Value:   u.State.Value,
				Quality: u.State.Quality,
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

// fanIn forwards from one tagstore subscription channel into the shared updates channel.
func fanIn(ctx context.Context, in <-chan tagstore.TagUpdate, out chan<- tagstore.TagUpdate) {
	for {
		select {
		case <-ctx.Done():
			return
		case u, ok := <-in:
			if !ok {
				return
			}
			select {
			case out <- u:
			default:
				// writer is slow; drop
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
