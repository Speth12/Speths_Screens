package security

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// MinPasswordLength is the shortest password ChangeOwnPassword accepts.
const MinPasswordLength = 8

// addMustChange adds the must_change column to databases created before it.
func (s *Store) addMustChange() error {
	rows, err := s.db.Query(`PRAGMA table_info(users)`)
	if err != nil {
		return err
	}
	has := false
	for rows.Next() {
		var cid, notnull, pk int
		var name, typ string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == "must_change" {
			has = true
		}
	}
	rows.Close()
	if has {
		return nil
	}
	_, err = s.db.Exec(`ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0`)
	return err
}

// EnsureInitialAdmin creates the first user when there is none: "admin"
// with a random password that must be changed at first login. The password
// is written to file (owner-only), never logged. It reports whether it
// created the user.
func (s *Store) EnsureInitialAdmin(ctx context.Context, file string) (bool, error) {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	b := make([]byte, 15)
	if _, err := rand.Read(b); err != nil {
		return false, err
	}
	password := strings.ToLower(base32.StdEncoding.EncodeToString(b)) // 24 characters
	if err := os.WriteFile(file, []byte(password+"\n"), 0o600); err != nil {
		return false, fmt.Errorf("security: write %s: %w", file, err)
	}
	if _, err := s.CreateUser(ctx, "admin", password, RoleAdmin); err != nil {
		_ = os.Remove(file)
		return false, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET must_change=1 WHERE username='admin'`); err != nil {
		return false, err
	}
	return true, nil
}

// FlagDefaultPassword marks the user "admin" for a password change when its
// password is still "admin" (the fixed first-run password of earlier
// builds). It reports whether it did.
func (s *Store) FlagDefaultPassword(ctx context.Context) (bool, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT hash FROM users WHERE username='admin'`).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte("admin")) != nil {
		return false, nil
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET must_change=1 WHERE username='admin'`)
	return err == nil, err
}

// ChangeOwnPassword changes a user's password after checking the current
// one, and clears the must-change flag.
func (s *Store) ChangeOwnPassword(ctx context.Context, username, current, next string) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT hash FROM users WHERE username=?`, username).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("security: invalid credentials")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		return errors.New("security: the current password is wrong")
	}
	if len(next) < MinPasswordLength {
		return fmt.Errorf("security: the new password needs at least %d characters", MinPasswordLength)
	}
	if next == current {
		return errors.New("security: the new password must differ from the current one")
	}
	if err := s.ChangePassword(ctx, username, next); err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET must_change=0 WHERE username=?`, username)
	return err
}
