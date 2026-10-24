package security

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func openTemp(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "security.db"), []byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, dir
}

func TestInitialAdmin(t *testing.T) {
	ctx := context.Background()
	s, dir := openTemp(t)
	file := filepath.Join(dir, "initial-admin-password")

	created, err := s.EnsureInitialAdmin(ctx, file)
	if err != nil || !created {
		t.Fatalf("EnsureInitialAdmin = %v, %v", created, err)
	}
	b, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	password := strings.TrimSpace(string(b))
	if len(password) < 20 {
		t.Errorf("password %q is too short", password)
	}

	// The first login only allows a password change.
	tok, u, err := s.Login(ctx, "admin", password)
	if err != nil || !u.MustChangePassword || u.Role != RoleAdmin {
		t.Fatalf("login: %+v %v", u, err)
	}
	if _, _, err := s.VerifyToken(tok); !errors.Is(err, ErrPasswordChangeRequired) {
		t.Errorf("VerifyToken of a change-only token: %v, want ErrPasswordChangeRequired", err)
	}
	if name, _, must, err := s.VerifyTokenAllowChange(tok); err != nil || !must || name != "admin" {
		t.Errorf("VerifyTokenAllowChange = %s %v %v", name, must, err)
	}

	// Only once, and never while users exist.
	if created, err := s.EnsureInitialAdmin(ctx, file+"2"); created || err != nil {
		t.Errorf("second call created a user: %v %v", created, err)
	}
	if _, err := os.Stat(file + "2"); !os.IsNotExist(err) {
		t.Error("second call wrote a password file")
	}

	tests := []struct {
		name, current, next, wantErr string
	}{
		{"wrong current password", "nope", "a-new-password", "current password is wrong"},
		{"too short", password, "short", "at least 8"},
		{"same as before", password, password, "must differ"},
		{"accepted", password, "a-new-password", ""},
	}
	for _, tc := range tests {
		err := s.ChangeOwnPassword(ctx, "admin", tc.current, tc.next)
		if tc.wantErr == "" && err != nil || tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
			t.Errorf("%s: err = %v, want %q", tc.name, err, tc.wantErr)
		}
	}
	tok, u, err = s.Login(ctx, "admin", "a-new-password")
	if err != nil || u.MustChangePassword {
		t.Fatalf("login after the change: %+v %v", u, err)
	}
	if _, _, err := s.VerifyToken(tok); err != nil {
		t.Errorf("full token refused: %v", err)
	}
}

func TestFlagDefaultPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		want     bool
	}{
		{"admin/admin is flagged", "admin", true},
		{"another password is not", "something-else", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			s, _ := openTemp(t)
			if _, err := s.CreateUser(ctx, "admin", tc.password, RoleAdmin); err != nil {
				t.Fatal(err)
			}
			flagged, err := s.FlagDefaultPassword(ctx)
			if err != nil || flagged != tc.want {
				t.Fatalf("FlagDefaultPassword = %v, %v; want %v", flagged, err, tc.want)
			}
			_, u, err := s.Login(ctx, "admin", tc.password)
			if err != nil || u.MustChangePassword != tc.want {
				t.Errorf("login: %+v %v", u, err)
			}
		})
	}
	s, _ := openTemp(t) // no admin user at all
	if flagged, err := s.FlagDefaultPassword(context.Background()); flagged || err != nil {
		t.Errorf("no admin: %v %v", flagged, err)
	}
}

// A database created before must_change existed gets the column.
func TestMigrateAddsMustChange(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
		hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := Open(path, []byte("test-only-secret"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	if _, err := s.CreateUser(ctx, "bob", "bob-test-pass", RoleOperator); err != nil {
		t.Fatal(err)
	}
	if _, u, err := s.Login(ctx, "bob", "bob-test-pass"); err != nil || u.MustChangePassword {
		t.Errorf("login on a migrated database: %+v %v", u, err)
	}
}
