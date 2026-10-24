package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

// PLCnext login (pxc_api). When the datasource has a username, or the
// controller reports userAuthenticationRequired, the driver gets a token:
//
//	POST <root>/v1.2/auth/auth-token   {"scope":"variables"}            → {"code": ...}
//	POST <root>/v1.2/auth/access-token {code, grant_type, username, password} → {"access_token": ..., "expires_in": ...}
//
// and sends it as Authorization: Bearer. It logs in again at 80% of the
// token's lifetime, and once more on a 401. The password and the token are
// never logged or put into errors.
//
// This flow is from an earlier build and is tested against a fake only; it
// has not yet been checked on a controller with user authentication on.

const authPath = "/v1.2/auth"

// bearer returns the token to send, or "".
func (d *Driver) bearer() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.token
}

// logsIn reports whether the driver gets its own tokens (as opposed to a
// fixed bearerToken or no authentication).
func (d *Driver) logsIn() bool { return d.isPXC && d.username != "" }

// tokenDue reports whether the driver should log in now: it logs in itself
// and has no token, or the token is past 80% of its lifetime.
func (d *Driver) tokenDue() bool {
	if !d.logsIn() {
		return false
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.token == "" || (!d.refreshAt.IsZero() && !time.Now().Before(d.refreshAt))
}

// relogin logs in again after stale was rejected, unless another caller
// already replaced it.
func (d *Driver) relogin(ctx context.Context, stale string) error {
	d.loginMu.Lock()
	defer d.loginMu.Unlock()
	if d.bearer() != stale {
		return nil
	}
	return d.loginLocked(ctx)
}

// login gets a fresh token. Callers other than relogin use it.
func (d *Driver) login(ctx context.Context) error {
	d.loginMu.Lock()
	defer d.loginMu.Unlock()
	return d.loginLocked(ctx)
}

func (d *Driver) loginLocked(ctx context.Context) error {
	status, body, err := d.sendOnce(ctx, http.MethodPost, d.pxcRoot+authPath+"/auth-token",
		[]byte(`{"scope":"variables"}`), "")
	if err != nil {
		return fmt.Errorf("rest: login: %w", err)
	}
	if status/100 != 2 {
		return fmt.Errorf("rest: login: auth-token: HTTP %d", status)
	}
	var codeResp struct {
		Code string `json:"code"`
	}
	if json.Unmarshal(body, &codeResp) != nil || codeResp.Code == "" {
		return fmt.Errorf("rest: login: auth-token reply has no code")
	}

	req, _ := json.Marshal(map[string]string{
		"code":       codeResp.Code,
		"grant_type": "authorization_code",
		"username":   d.username,
		"password":   d.password,
	})
	status, body, err = d.sendOnce(ctx, http.MethodPost, d.pxcRoot+authPath+"/access-token", req, "")
	if err != nil {
		return fmt.Errorf("rest: login: %w", err)
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return fmt.Errorf("rest: login: user %q was refused (HTTP %d); check the username and password", d.username, status)
	}
	if status/100 != 2 {
		return fmt.Errorf("rest: login: access-token: HTTP %d", status)
	}
	var tokResp struct {
		AccessToken string          `json:"access_token"`
		ExpiresIn   json.RawMessage `json:"expires_in"`
	}
	if json.Unmarshal(body, &tokResp) != nil || tokResp.AccessToken == "" {
		return fmt.Errorf("rest: login: access-token reply has no access_token")
	}

	life := seconds(tokResp.ExpiresIn)
	d.mu.Lock()
	d.token = tokResp.AccessToken
	d.refreshAt = time.Time{}
	if life > 0 {
		d.refreshAt = time.Now().Add(life * 8 / 10)
	}
	d.mu.Unlock()
	if life > 0 {
		log.Printf("[DRIVER] rest: logged in, token valid for %v", life)
	} else {
		log.Printf("[DRIVER] rest: logged in")
	}
	return nil
}

// seconds reads expires_in, which may be a number or a numeric string.
func seconds(raw json.RawMessage) time.Duration {
	var n float64
	if json.Unmarshal(raw, &n) != nil {
		var s string
		if json.Unmarshal(raw, &s) != nil {
			return 0
		}
		var err error
		if n, err = strconv.ParseFloat(s, 64); err != nil {
			return 0
		}
	}
	return time.Duration(n * float64(time.Second))
}

// send runs one request with the current token. When the driver logs in
// itself and the controller answers 401, it logs in again once and repeats
// the request.
func (d *Driver) send(ctx context.Context, method, rawURL string, body []byte) (int, []byte, error) {
	tok := d.bearer()
	status, resp, err := d.sendOnce(ctx, method, rawURL, body, tok)
	if err == nil && status == http.StatusUnauthorized && d.logsIn() {
		if err := d.relogin(ctx, tok); err != nil {
			return 0, nil, err
		}
		status, resp, err = d.sendOnce(ctx, method, rawURL, body, d.bearer())
	}
	return status, resp, err
}

func (d *Driver) sendOnce(ctx context.Context, method, rawURL string, body []byte, token string) (int, []byte, error) {
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, rd)
	if err != nil {
		return 0, nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	resp, err := d.hc.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	return resp.StatusCode, respBody, err
}
