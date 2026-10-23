package security

import (
	"context"
	"testing"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:", []byte("test-secret-32-bytes-xxxxxxxxxxx"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestCreateAndLogin(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	u, err := s.CreateUser(ctx, "alice", "password123", RoleEngineer)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if u.Role != RoleEngineer {
		t.Errorf("role: %q", u.Role)
	}

	tok, user, err := s.Login(ctx, "alice", "password123")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if tok == "" {
		t.Error("empty token")
	}
	if user.Username != "alice" {
		t.Errorf("username: %q", user.Username)
	}
}

func TestBadPassword(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.CreateUser(ctx, "bob", "secret", RoleOperator)
	_, _, err := s.Login(ctx, "bob", "wrong")
	if err == nil {
		t.Error("expected error for wrong password")
	}
}

func TestDisabledUser(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.CreateUser(ctx, "carol", "pass", RoleOperator)
	s.SetEnabled(ctx, "carol", false)
	_, _, err := s.Login(ctx, "carol", "pass")
	if err == nil {
		t.Error("expected error for disabled user")
	}
}

func TestVerifyToken(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.CreateUser(ctx, "dave", "pass", RoleSupervisor)
	tok, _, _ := s.Login(ctx, "dave", "pass")

	username, role, err := s.VerifyToken(tok)
	if err != nil {
		t.Fatalf("VerifyToken: %v", err)
	}
	if username != "dave" {
		t.Errorf("username: %q", username)
	}
	if role != RoleSupervisor {
		t.Errorf("role: %q", role)
	}
}

func TestRolePermissions(t *testing.T) {
	if !HasPermission(RoleAdmin, PermManageUsers) {
		t.Error("admin should have ManageUsers")
	}
	if HasPermission(RoleOperator, PermDeploy) {
		t.Error("operator should not have Deploy")
	}
	if !HasPermission(RoleEngineer, PermDeploy) {
		t.Error("engineer should have Deploy")
	}
}

func TestRoleRank(t *testing.T) {
	if !RoleAdmin.AtLeast(RoleOperator) {
		t.Error("admin >= operator")
	}
	if RoleOperator.AtLeast(RoleEngineer) {
		t.Error("operator < engineer")
	}
}

func TestDuplicateUser(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.CreateUser(ctx, "dup", "pass", RoleOperator)
	_, err := s.CreateUser(ctx, "dup", "pass2", RoleOperator)
	if err == nil {
		t.Error("expected error for duplicate username")
	}
}

func TestListAndDelete(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	s.CreateUser(ctx, "u1", "p", RoleOperator)
	s.CreateUser(ctx, "u2", "p", RoleOperator)

	users, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Errorf("want 2 users, got %d", len(users))
	}

	s.DeleteUser(ctx, "u1")
	users, _ = s.ListUsers(ctx)
	if len(users) != 1 {
		t.Errorf("want 1 user after delete, got %d", len(users))
	}
}
