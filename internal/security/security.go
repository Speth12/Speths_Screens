// Package security provides user management, JWT authentication, and
// role-based access control for Speth's Screens.
//
// Roles (ascending privilege):
//
//	Operator < Supervisor < Engineer < Admin
//
// The database is an append-friendly SQLite file; users are stored in a
// single table. Passwords are bcrypt-hashed.  JWTs are signed with a
// per-deployment secret.
package security

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

// Role is the access level granted to a user.
type Role string

const (
	RoleOperator   Role = "operator"
	RoleSupervisor Role = "supervisor"
	RoleEngineer   Role = "engineer"
	RoleAdmin      Role = "admin"
)

var roleRank = map[Role]int{
	RoleOperator:   1,
	RoleSupervisor: 2,
	RoleEngineer:   3,
	RoleAdmin:      4,
}

// AtLeast returns true if r has at least the privilege of min.
func (r Role) AtLeast(min Role) bool {
	return roleRank[r] >= roleRank[min]
}

// Permission is a named capability.
type Permission string

const (
	PermReadTag     Permission = "tag.read"
	PermWriteTag    Permission = "tag.write"
	PermAckAlarm    Permission = "alarm.ack"
	PermApplyRecipe Permission = "recipe.apply"
	PermDeploy      Permission = "project.deploy"
	PermManageUsers Permission = "users.manage"
)

// defaultPermissions maps roles to their allowed permissions.
var defaultPermissions = map[Role][]Permission{
	RoleOperator:   {PermReadTag, PermAckAlarm},
	RoleSupervisor: {PermReadTag, PermWriteTag, PermAckAlarm, PermApplyRecipe},
	RoleEngineer:   {PermReadTag, PermWriteTag, PermAckAlarm, PermApplyRecipe, PermDeploy},
	RoleAdmin:      {PermReadTag, PermWriteTag, PermAckAlarm, PermApplyRecipe, PermDeploy, PermManageUsers},
}

// User represents a Speth's Screens system user.
type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Role      Role      `json:"role"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
}

// Store manages users and sessions in SQLite.
type Store struct {
	db     *sql.DB
	secret []byte // JWT signing secret
}

// Open opens (or creates) a security database at path.
// secret is used to sign JWTs; provide a random 32+ byte value per deployment.
func Open(path string, secret []byte) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db, secret: secret}
	return s, s.migrate()
}

// Close releases the database connection.
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		username   TEXT    NOT NULL UNIQUE,
		hash       TEXT    NOT NULL,
		role       TEXT    NOT NULL DEFAULT 'operator',
		enabled    INTEGER NOT NULL DEFAULT 1,
		created_at TEXT    NOT NULL
	);
	CREATE TABLE IF NOT EXISTS sessions (
		jti        TEXT PRIMARY KEY,
		user_id    INTEGER NOT NULL,
		expires_at TEXT    NOT NULL,
		revoked    INTEGER NOT NULL DEFAULT 0
	);`)
	return err
}

// CreateUser creates a new user. Returns an error if the username is taken.
func (s *Store) CreateUser(ctx context.Context, username, password string, role Role) (*User, error) {
	if username == "" || password == "" {
		return nil, errors.New("security: username and password are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, hash, role, enabled, created_at) VALUES (?,?,?,1,?)`,
		username, string(hash), string(role), now.Format(time.RFC3339),
	)
	if err != nil {
		return nil, fmt.Errorf("security: %w", err)
	}
	id, _ := res.LastInsertId()
	return &User{ID: id, Username: username, Role: role, Enabled: true, CreatedAt: now}, nil
}

// GetUser returns a user by username.
func (s *Store) GetUser(ctx context.Context, username string) (*User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, role, enabled, created_at FROM users WHERE username=?`, username)
	return scanUser(row)
}

// ListUsers returns all users.
func (s *Store) ListUsers(ctx context.Context) ([]*User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, username, role, enabled, created_at FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetEnabled enables or disables a user account.
func (s *Store) SetEnabled(ctx context.Context, username string, enabled bool) error {
	v := 0
	if enabled {
		v = 1
	}
	_, err := s.db.ExecContext(ctx, `UPDATE users SET enabled=? WHERE username=?`, v, username)
	return err
}

// SetRole changes a user's role.
func (s *Store) SetRole(ctx context.Context, username string, role Role) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET role=? WHERE username=?`, string(role), username)
	return err
}

// DeleteUser removes a user by username.
func (s *Store) DeleteUser(ctx context.Context, username string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE username=?`, username)
	return err
}

// ChangePassword replaces a user's password hash.
func (s *Store) ChangePassword(ctx context.Context, username, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET hash=? WHERE username=?`, string(hash), username)
	return err
}

// Login verifies credentials and returns a signed JWT on success.
func (s *Store) Login(ctx context.Context, username, password string) (string, *User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, hash, role, enabled, created_at FROM users WHERE username=?`, username)
	var u User
	var hash, createdStr string
	var enabled int
	err := row.Scan(&u.ID, &u.Username, &hash, &u.Role, &enabled, &createdStr)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, errors.New("security: invalid credentials")
	}
	if err != nil {
		return "", nil, err
	}
	if enabled == 0 {
		return "", nil, errors.New("security: account disabled")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", nil, errors.New("security: invalid credentials")
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdStr)
	u.Enabled = true

	now := time.Now().UTC()
	claims := jwt.MapClaims{
		"sub":  u.Username,
		"role": string(u.Role),
		"uid":  u.ID,
		"iat":  now.Unix(),
		"exp":  now.Add(8 * time.Hour).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(s.secret)
	if err != nil {
		return "", nil, err
	}
	return signed, &u, nil
}

// VerifyToken parses and validates a JWT, returning the claims.
func (s *Store) VerifyToken(tokenStr string) (username string, role Role, err error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("security: unexpected signing method")
		}
		return s.secret, nil
	}, jwt.WithExpirationRequired())
	if err != nil {
		return "", "", err
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok || !tok.Valid {
		return "", "", errors.New("security: invalid token")
	}
	username, _ = claims["sub"].(string)
	roleStr, _ := claims["role"].(string)
	return username, Role(roleStr), nil
}

// HasPermission returns true if role is allowed to perform perm.
func HasPermission(role Role, perm Permission) bool {
	for _, p := range defaultPermissions[role] {
		if p == perm {
			return true
		}
	}
	return false
}

// ── helpers ────────────────────────────────────────────────────────────────

type scanner interface {
	Scan(...any) error
}

func scanUser(row scanner) (*User, error) {
	var u User
	var enabled int
	var createdStr string
	if err := row.Scan(&u.ID, &u.Username, &u.Role, &enabled, &createdStr); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Enabled = enabled == 1
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdStr)
	return &u, nil
}
