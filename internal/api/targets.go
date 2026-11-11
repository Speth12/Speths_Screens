package api

// Deploy targets and the relay. The IDE in a browser only ever talks to the program that served it; to reach
// another runtime (a panel) it asks this program to pass the request on:
//
//	browser -> /api/v1/targets/{id}/relay/api/v1/project -> http://<target>/api/v1/project
//
// A request made by a program has no browser origin rules, so the other runtime needs no setting for it.
//
// What keeps the relay from being a way into the networks this computer can reach:
//   - it exists only where Server.Targets is set (the PC program; never the panel package);
//   - only this computer may use it, or, when this program asks for logins, a user who may deploy;
//   - it goes only to a saved target, never to an address in the request;
//   - it passes on only the target's /api/v1/... and /ws/... paths, and not its own relay.

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/Speth12/Speths_Screens/internal/targets"
)

// TargetAuthHeader carries the login token for the target; Authorization is this program's own and is never
// passed on.
const TargetAuthHeader = "X-Target-Authorization"

// RelayedHeader marks a response that came from the target.
const RelayedHeader = "X-Speths-Relayed"

// relayDial is how long the relay waits for a target to accept a connection; tests shorten it.
var relayDial = 3 * time.Second

func (s *Server) relayTransport() http.RoundTripper {
	s.relayOnce.Do(func() {
		s.relayRT = &http.Transport{
			Proxy:                 nil, // straight to the target, whatever proxy the environment names
			DialContext:           (&net.Dialer{Timeout: relayDial}).DialContext,
			TLSHandshakeTimeout:   5 * time.Second,
			ResponseHeaderTimeout: 30 * time.Second,
			MaxIdleConnsPerHost:   4,
			IdleConnTimeout:       60 * time.Second,
		}
	})
	return s.relayRT
}

// requireTargets guards the target routes: 404 where the program has no relay, then the caller check.
func (s *Server) requireTargets(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Targets == nil {
			writeErr(w, 404, "this runtime does not relay to other runtimes")
			return
		}
		if s.loginRequired() {
			if !security.HasPermission(claimedRole(r), security.PermDeploy) {
				writeErr(w, 403, "forbidden")
				return
			}
		} else if !fromThisComputer(r) {
			// No login here: anyone on the network could otherwise use this computer to reach the targets.
			writeErr(w, 403, "deploy targets can only be used from the computer this program runs on, unless it asks for logins")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// fromThisComputer reports whether the connection came from a loopback address.
func fromThisComputer(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) handleListTargets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.Targets.List())
}

type targetBody struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

func readTargetBody(w http.ResponseWriter, r *http.Request) (targetBody, bool) {
	defer r.Body.Close()
	var b targetBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&b); err != nil {
		writeErr(w, 400, "invalid json")
		return b, false
	}
	return b, true
}

func (s *Server) handleAddTarget(w http.ResponseWriter, r *http.Request) {
	b, ok := readTargetBody(w, r)
	if !ok {
		return
	}
	t, err := s.Targets.Add(b.Name, b.URL)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, "target/"+t.ID, nil, t, "deploy target added")
	writeJSON(w, 201, t)
}

func (s *Server) handleUpdateTarget(w http.ResponseWriter, r *http.Request) {
	b, ok := readTargetBody(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	before, _ := s.Targets.Get(id)
	t, err := s.Targets.Update(id, b.Name, b.URL)
	if errors.Is(err, targets.ErrNotFound) {
		writeErr(w, 404, err.Error())
		return
	}
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, "target/"+t.ID, before, t, "deploy target changed")
	writeJSON(w, 200, t)
}

func (s *Server) handleRemoveTarget(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	before, _ := s.Targets.Get(id)
	if err := s.Targets.Remove(id); err != nil {
		writeErr(w, 404, err.Error())
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, "target/"+id, before, nil, "deploy target removed")
	writeJSON(w, 200, map[string]any{"ok": true})
}

// relayPath takes what follows ".../relay" in the request (still escaped) and returns the path to ask the
// target for, decoded and as it was written. Only the target's API and WebSockets pass, and not its own
// target routes, so relays cannot be chained.
func relayPath(escapedRest string) (decoded, escaped string, err error) {
	decoded, uerr := url.PathUnescape(escapedRest)
	if uerr != nil {
		return "", "", fmt.Errorf("bad path")
	}
	for _, seg := range strings.Split(decoded, "/") {
		if seg == ".." || seg == "." {
			return "", "", fmt.Errorf("bad path")
		}
	}
	isAPI := strings.HasPrefix(decoded, "/api/v1/")
	isWS := strings.HasPrefix(decoded, "/ws/")
	if !isAPI && !isWS {
		return "", "", fmt.Errorf("only a runtime's /api/v1/ and /ws/ paths can be relayed")
	}
	if decoded == "/api/v1/targets" || strings.HasPrefix(decoded, "/api/v1/targets/") {
		return "", "", fmt.Errorf("a relay cannot be asked for another runtime's targets")
	}
	return decoded, escapedRest, nil
}

func (s *Server) handleRelay(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	t, ok := s.Targets.Get(id)
	if !ok {
		writeErr(w, 404, "target not found")
		return
	}
	base, err := url.Parse(t.URL)
	if err != nil || base.Host == "" {
		writeErr(w, 500, "the saved address of this target is not usable")
		return
	}
	prefix := "/api/v1/targets/" + url.PathEscape(id) + "/relay"
	rest := strings.TrimPrefix(r.URL.EscapedPath(), prefix)
	decoded, escaped, err := relayPath(rest)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}

	proxy := &httputil.ReverseProxy{
		Transport: s.relayTransport(),
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme, pr.Out.URL.Host = base.Scheme, base.Host
			pr.Out.URL.Path, pr.Out.URL.RawPath = decoded, escaped
			pr.Out.URL.RawQuery = pr.In.URL.RawQuery
			pr.Out.Host = base.Host
			// The target sees an ordinary program: no browser origin, no cookies, and never this program's own
			// login. Its own token comes in a header of its own.
			pr.Out.Header.Del("Origin")
			pr.Out.Header.Del("Referer")
			pr.Out.Header.Del("Cookie")
			pr.Out.Header.Del("Authorization")
			if tok := pr.In.Header.Get(TargetAuthHeader); tok != "" {
				pr.Out.Header.Set("Authorization", tok)
			}
			pr.Out.Header.Del(TargetAuthHeader)
		},
		ModifyResponse: func(resp *http.Response) error {
			// Tells the IDE the answer is the target's: a 401 without it is this program asking for its own login.
			resp.Header.Set(RelayedHeader, "1")
			for k := range resp.Header { // the browser asked this program, so the target's CORS answers do not apply
				if strings.HasPrefix(k, "Access-Control-") {
					resp.Header.Del(k)
				}
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeErr(w, 502, relayFailure(base.Host, err))
		},
		ErrorLog: nil,
	}
	proxy.ServeHTTP(w, r)
}

// relayFailure says in a few words why a target did not answer, without the internals of the error.
func relayFailure(host string, err error) string {
	var nerr net.Error
	switch {
	case errors.As(err, &nerr) && nerr.Timeout():
		return fmt.Sprintf("no answer from %s (timed out)", host)
	case strings.Contains(err.Error(), "refused"):
		return fmt.Sprintf("no answer from %s (connection refused: is the runtime running and listening on the network?)", host)
	case strings.Contains(err.Error(), "no such host"):
		return fmt.Sprintf("no answer from %s (unknown host name)", host)
	}
	return fmt.Sprintf("no answer from %s", host)
}
