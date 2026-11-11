// Package targets keeps the runtimes the IDE can deploy to: a name and an address each, saved in one small
// JSON file beside the program. The PC program relays the IDE's requests to these addresses and to no others.
package targets

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// MaxTargets bounds the list; MaxName bounds a name.
const (
	MaxTargets = 64
	MaxName    = 80
)

// ErrNotFound is returned for an id the store does not have.
var ErrNotFound = errors.New("target not found")

// Target is a runtime the IDE can deploy to.
type Target struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// URL is scheme://host[:port], with no path.
	URL string `json:"url"`
}

// Store is the saved list. Safe for concurrent use.
type Store struct {
	path string
	mu   sync.Mutex
	list []Target
}

// Open reads the list from path; a missing file is an empty list. An empty path keeps the list in memory only.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	if path == "" {
		return s, nil
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &s.list); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	// A file edited by hand is held to the same rules as the API.
	kept := s.list[:0]
	for _, t := range s.list {
		if u, err := CleanURL(t.URL); err == nil && t.ID != "" {
			t.URL = u
			kept = append(kept, t)
		}
	}
	s.list = kept
	return s, nil
}

// CleanURL checks a target address and returns it as scheme://host[:port]. Only http and https, a host, and
// nothing else: no user, path, query or fragment.
func CleanURL(raw string) (string, error) {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("%q is not an address like http://10.0.0.120:8080", raw)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("the address must start with http:// or https://")
	}
	if u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Hostname() == "" {
		return "", fmt.Errorf("the address is only the host and port of the runtime, like http://10.0.0.120:8080")
	}
	return u.Scheme + "://" + u.Host, nil
}

func cleanName(name, fallbackURL string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		if u, err := url.Parse(fallbackURL); err == nil {
			name = u.Host
		}
	}
	if len([]rune(name)) > MaxName {
		return "", fmt.Errorf("the name is longer than %d characters", MaxName)
	}
	return name, nil
}

// List returns a copy of the targets, in the order they were added.
func (s *Store) List() []Target {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Target{}, s.list...)
}

// Get returns one target.
func (s *Store) Get(id string) (Target, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range s.list {
		if t.ID == id {
			return t, true
		}
	}
	return Target{}, false
}

// Add saves a new target and returns it with its id.
func (s *Store) Add(name, rawURL string) (Target, error) {
	u, err := CleanURL(rawURL)
	if err != nil {
		return Target{}, err
	}
	n, err := cleanName(name, u)
	if err != nil {
		return Target{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.list) >= MaxTargets {
		return Target{}, fmt.Errorf("there are already %d targets; remove one first", MaxTargets)
	}
	var b [6]byte
	_, _ = rand.Read(b[:])
	t := Target{ID: hex.EncodeToString(b[:]), Name: n, URL: u}
	next := append(append([]Target{}, s.list...), t)
	if err := s.save(next); err != nil {
		return Target{}, err
	}
	s.list = next
	return t, nil
}

// Update changes a target's name and address.
func (s *Store) Update(id, name, rawURL string) (Target, error) {
	u, err := CleanURL(rawURL)
	if err != nil {
		return Target{}, err
	}
	n, err := cleanName(name, u)
	if err != nil {
		return Target{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]Target{}, s.list...)
	for i := range next {
		if next[i].ID == id {
			next[i].Name, next[i].URL = n, u
			if err := s.save(next); err != nil {
				return Target{}, err
			}
			s.list = next
			return next[i], nil
		}
	}
	return Target{}, ErrNotFound
}

// Remove deletes a target.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := make([]Target, 0, len(s.list))
	for _, t := range s.list {
		if t.ID != id {
			next = append(next, t)
		}
	}
	if len(next) == len(s.list) {
		return ErrNotFound
	}
	if err := s.save(next); err != nil {
		return err
	}
	s.list = next
	return nil
}

// save writes the list beside its file and renames it into place, so a crash never leaves half a file.
func (s *Store) save(list []Target) error {
	if s.path == "" {
		return nil
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".targets-*")
	if err != nil {
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}
