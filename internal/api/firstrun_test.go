package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/runtime"
	"github.com/Speth12/Speths_Screens/internal/security"
)

// newFirstRunServer is a runtime with an empty user store, as on a new PLC.
func newFirstRunServer(t *testing.T) (*secureServer, string) {
	t.Helper()
	dir := t.TempDir()
	sec, err := security.Open(filepath.Join(dir, "security.db"), []byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sec.Close() })
	rt := runtime.New(nil, nil)
	rt.Security = sec
	rt.InitialAdminFile = filepath.Join(dir, "initial-admin-password")
	rt.Start(context.Background())
	t.Cleanup(rt.Stop)
	hs := httptest.NewServer(New(rt, nil).Handler())
	t.Cleanup(hs.Close)
	return &secureServer{hs: hs, rt: rt}, rt.InitialAdminFile
}

func login(t *testing.T, s *secureServer, user, pass string) (token string, mustChange bool) {
	t.Helper()
	code, body := s.do(t, "POST", "/api/v1/auth/login", "", `{"username":"`+user+`","password":"`+pass+`"}`)
	if code != 200 {
		t.Fatalf("login %s: %d %s", user, code, body)
	}
	var r struct {
		Token              string `json:"token"`
		MustChangePassword bool   `json:"mustChangePassword"`
	}
	_ = json.Unmarshal([]byte(body), &r)
	return r.Token, r.MustChangePassword
}

func TestFirstRunAdmin(t *testing.T) {
	s, file := newFirstRunServer(t)

	// A project without logins creates no user.
	if code, body := s.do(t, "POST", "/api/v1/project", "", writeTestProject); code != 200 {
		t.Fatalf("deploy: %d %s", code, body)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("security.mode none created the first admin")
	}

	// A project with logins creates "admin" with its password in the file.
	if code, body := s.do(t, "POST", "/api/v1/project", "", loginProject(writeTestProject)); code != 200 {
		t.Fatalf("deploy with logins: %d %s", code, body)
	}
	b, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("no password file: %v", err)
	}
	password := strings.TrimSpace(string(b))

	tok, must := login(t, s, "admin", password)
	if !must {
		t.Fatal("the first login does not ask for a password change")
	}
	if code, body := s.do(t, "GET", "/api/v1/project", tok, ""); code != 403 || !strings.Contains(body, "password change required") {
		t.Errorf("change-only token on GET /project: %d %s", code, body)
	}

	if code, body := s.do(t, "POST", "/api/v1/auth/password", tok, `{"currentPassword":"`+password+`","newPassword":"short"}`); code != 400 {
		t.Errorf("short password: %d %s", code, body)
	}
	if code, body := s.do(t, "POST", "/api/v1/auth/password", tok, `{"currentPassword":"`+password+`","newPassword":"a-new-admin-password"}`); code != 200 {
		t.Fatalf("change password: %d %s", code, body)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Error("the password file is still there after the change")
	}

	tok, must = login(t, s, "admin", "a-new-admin-password")
	if must {
		t.Error("still asked to change the password")
	}
	if code, body := s.do(t, "GET", "/api/v1/project", tok, ""); code != 200 {
		t.Errorf("GET /project after the change: %d %s", code, body)
	}
}

// Setting another user's password needs users.manage.
func TestSetUserPasswordNeedsPermission(t *testing.T) {
	s := newSecureServer(t)
	tests := []struct {
		name     string
		token    string
		wantCode int
	}{
		{"operator cannot reset the admin", s.opToken, 403},
		{"admin can reset the operator", s.adminToken, 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			target := "admin"
			if tc.token == s.adminToken {
				target = "op"
			}
			code, body := s.do(t, "POST", "/api/v1/users/"+target+"/password", tc.token, `{"password":"reset-by-test"}`)
			if code != tc.wantCode {
				t.Errorf("HTTP %d %s, want %d", code, body, tc.wantCode)
			}
		})
	}
}
