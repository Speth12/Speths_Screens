package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Test credentials for the fake controller only.
const (
	fakeUser = "hmi-user"
	fakePass = "fake-pass-7Qz"
)

// authPLC imitates a PLCnext controller with user authentication on. Tokens
// look like "fake-token-N" and stop working after life, or when revoked.
type authPLC struct {
	srv  *httptest.Server
	life time.Duration // 0: no expires_in, tokens never expire

	mu       sync.Mutex
	valid    map[string]time.Time // token → expiry (zero: never)
	logins   int
	rejected int // 401s sent for a missing or bad token
	writes   int
}

func newAuthPLC(t *testing.T, life time.Duration) *authPLC {
	f := &authPLC{life: life, valid: map[string]time.Time{}}
	f.srv = httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *authPLC) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch r.URL.Path {
	case "/_pxc_api/api/":
		fmt.Fprint(w, `{"apiVersion":"1.14.0.0","basePath":"/v1.14/","userAuthenticationRequired":true}`)
		return
	case "/_pxc_api/v1.2/auth/auth-token":
		fmt.Fprint(w, `{"code":"c-1","expires_in":60}`)
		return
	case "/_pxc_api/v1.2/auth/access-token":
		var req map[string]string
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req["code"] != "c-1" || req["grant_type"] != "authorization_code" ||
			req["username"] != fakeUser || req["password"] != fakePass {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusUnauthorized)
			return
		}
		f.logins++
		tok := fmt.Sprintf("fake-token-%d", f.logins)
		var exp time.Time
		if f.life > 0 {
			exp = time.Now().Add(f.life)
			fmt.Fprintf(w, `{"token_type":"Bearer","access_token":%q,"expires_in":%g}`, tok, f.life.Seconds())
		} else {
			fmt.Fprintf(w, `{"token_type":"Bearer","access_token":%q}`, tok)
		}
		f.valid[tok] = exp
		return
	case "/_pxc_api/v1.14/variables":
	default:
		http.NotFound(w, r)
		return
	}
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	exp, ok := f.valid[tok]
	if !ok || (!exp.IsZero() && time.Now().After(exp)) {
		f.rejected++
		http.Error(w, `{"error":{"code":401}}`, http.StatusUnauthorized)
		return
	}
	if r.Method == http.MethodPut {
		f.writes++
		fmt.Fprint(w, `{"variables":[]}`)
		return
	}
	prefix := r.URL.Query().Get("pathPrefix")
	var vars []string
	for _, v := range strings.Split(r.URL.Query().Get("paths"), ",") {
		vars = append(vars, fmt.Sprintf(`{"path":%q,"value":1}`, prefix+v))
	}
	fmt.Fprintf(w, `{"variables":[%s]}`, strings.Join(vars, ","))
}

func (f *authPLC) counts() (logins, rejected, writes int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.logins, f.rejected, f.writes
}

// revokeAll makes every token issued so far stop working.
func (f *authPLC) revokeAll() {
	f.mu.Lock()
	f.valid = map[string]time.Time{}
	f.mu.Unlock()
}

// captureLog sends the standard logger to a buffer for the rest of the test.
func captureLog(t *testing.T) *syncBuffer {
	b := &syncBuffer{}
	log.SetOutput(b)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return b
}

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

// startAuth connects a fast-timed driver to f with the given credentials
// (unversioned basePath, so the driver also learns the version).
func startAuth(t *testing.T, f *authPLC, user, pass string) (*Driver, chan tagstore.TagUpdate) {
	t.Helper()
	ch := make(chan tagstore.TagUpdate, 1024)
	d := New()
	d.pollEvery = testPoll
	d.backoffMin = 20 * time.Millisecond
	d.backoffMax = 80 * time.Millisecond
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Username: user,
		Password: pass,
		Extra:    map[string]string{"basePath": "/_pxc_api"},
	}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	if err := d.SetTags([]string{"Arp.Plc.Eclr/A"}); err != nil {
		t.Fatal(err)
	}
	return d, ch
}

// countGood reads updates for dur and counts Good ones.
func countGood(ch chan tagstore.TagUpdate, dur time.Duration) (good, bad int) {
	deadline := time.After(dur)
	for {
		select {
		case u := <-ch:
			if u.State.Quality == "Good" {
				good++
			} else {
				bad++
			}
		case <-deadline:
			return
		}
	}
}

func TestLoginOnceAndReuseToken(t *testing.T) {
	logs := captureLog(t)
	f := newAuthPLC(t, 0)
	d, ch := startAuth(t, f, fakeUser, fakePass)
	good, bad := countGood(ch, 15*testPoll)
	if good < 5 || bad != 0 {
		t.Fatalf("good=%d bad=%d, want steady Good reads (status %+v)", good, bad, d.Status())
	}
	if err := d.Write(context.Background(), "Arp.Plc.Eclr/A", 2); err != nil {
		t.Fatalf("Write: %v", err)
	}
	logins, rejected, writes := f.counts()
	if logins != 1 || rejected != 0 || writes != 1 {
		t.Errorf("logins=%d rejected=%d writes=%d, want 1, 0, 1", logins, rejected, writes)
	}
	for _, secret := range []string{fakePass, "fake-token-"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("log contains %q:\n%s", secret, logs.String())
		}
	}
}

func TestLoginAgainOnRejectedToken(t *testing.T) {
	tests := []struct {
		name string
		use  func(d *Driver) error
	}{
		{"poll", func(*Driver) error { return nil }},
		{"write", func(d *Driver) error { return d.Write(context.Background(), "Arp.Plc.Eclr/A", 2) }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := newAuthPLC(t, 0)
			d, ch := startAuth(t, f, fakeUser, fakePass)
			if good, _ := countGood(ch, 10*testPoll); good == 0 {
				t.Fatalf("no Good reads before revoking (status %+v)", d.Status())
			}
			f.revokeAll()
			if err := tc.use(d); err != nil {
				t.Fatalf("after revoke: %v", err)
			}
			if good, bad := countGood(ch, 10*testPoll); good == 0 || bad != 0 {
				t.Errorf("after revoke: good=%d bad=%d, want Good only", good, bad)
			}
			if logins, _, _ := f.counts(); logins != 2 {
				t.Errorf("logins = %d, want 2 (one more after the 401)", logins)
			}
			if !d.Status().Connected {
				t.Errorf("Status = %+v, want online", d.Status())
			}
		})
	}
}

func TestTokenRefreshedBeforeExpiry(t *testing.T) {
	f := newAuthPLC(t, 500*time.Millisecond)
	d, ch := startAuth(t, f, fakeUser, fakePass)
	good, bad := countGood(ch, 1300*time.Millisecond)
	logins, rejected, _ := f.counts()
	// Refresh at 80% of 500 ms: about 3 logins in 1.3 s, and no 401s.
	if logins < 2 || rejected != 0 || bad != 0 || good == 0 {
		t.Errorf("logins=%d rejected=%d good=%d bad=%d (status %+v), want refreshes with no 401s",
			logins, rejected, good, bad, d.Status())
	}
}

func TestLoginFailures(t *testing.T) {
	tests := []struct {
		name       string
		user, pass string
		wantReason string
	}{
		{"wrong password", fakeUser, "not-the-password", "check the username and password"},
		{"no credentials", "", "", "requires a login"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			logs := captureLog(t)
			f := newAuthPLC(t, 0)
			d, ch := startAuth(t, f, tc.user, tc.pass)
			select {
			case u := <-ch:
				if u.State.Quality == "Good" {
					t.Fatal("got a Good value without a valid login")
				}
				if !strings.Contains(u.State.Reason, tc.wantReason) {
					t.Fatalf("reason %q, want it to contain %q", u.State.Reason, tc.wantReason)
				}
			case <-time.After(3 * time.Second):
				t.Fatal("no Bad update within 3 s")
			}
			st := d.Status()
			if st.Connected || !strings.Contains(st.LastError, tc.wantReason) {
				t.Errorf("Status = %+v", st)
			}
			if tc.pass != "" && (strings.Contains(st.LastError, tc.pass) || strings.Contains(logs.String(), tc.pass)) {
				t.Error("the password appears in the status or the log")
			}
		})
	}
}

// A fixed bearerToken is sent as is, and a 401 does not start a login.
func TestFixedBearerTokenDoesNotLogIn(t *testing.T) {
	f := newAuthPLC(t, 0)
	f.valid["fixed-token"] = time.Time{}
	ch := make(chan tagstore.TagUpdate, 64)
	d := New()
	d.pollEvery = testPoll
	if err := d.Connect(context.Background(), drivers.DriverConfig{
		Endpoint: f.srv.URL,
		Extra:    map[string]string{"basePath": "/_pxc_api/v1.14", "bearerToken": "fixed-token"},
	}, ch); err != nil {
		t.Fatal(err)
	}
	defer d.Disconnect()
	_ = d.SetTags([]string{"Arp.Plc.Eclr/A"})
	if good, _ := countGood(ch, 10*testPoll); good == 0 {
		t.Fatalf("no Good reads with the fixed token (status %+v)", d.Status())
	}
	var tries atomic.Int32
	f.revokeAll()
	for i := 0; i < 3; i++ {
		if d.Write(context.Background(), "Arp.Plc.Eclr/A", 1) != nil {
			tries.Add(1)
		}
	}
	if logins, _, _ := f.counts(); logins != 0 {
		t.Errorf("logins = %d, want 0 with a fixed token", logins)
	}
	if tries.Load() == 0 {
		t.Error("writes with a revoked fixed token succeeded")
	}
}
