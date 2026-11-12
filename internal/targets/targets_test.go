package targets

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCleanURL(t *testing.T) {
	tests := []struct {
		in, want, err string
	}{
		{"http://10.0.0.120:8080", "http://10.0.0.120:8080", ""},
		{" http://10.0.0.120:8080/ ", "http://10.0.0.120:8080", ""},
		{"https://panel.local", "https://panel.local", ""},
		{"http://[::1]:8090", "http://[::1]:8090", ""},
		{"10.0.0.120:8080", "", "http://"},
		{"ftp://10.0.0.120", "", "http:// or https://"},
		{"file:///etc/passwd", "", "not an address"},
		{"http://user:pw@10.0.0.120", "", "only the host and port"},
		{"http://10.0.0.120/api/v1", "", "only the host and port"},
		{"http://10.0.0.120?x=1", "", "only the host and port"},
		{"http://10.0.0.120#frag", "", "only the host and port"},
		{"http://:8080", "", "only the host and port"},
		{"", "", "not an address"},
		{"http://", "", "not an address"},
	}
	for _, tc := range tests {
		got, err := CleanURL(tc.in)
		if tc.err != "" {
			if err == nil || !strings.Contains(err.Error(), tc.err) {
				t.Errorf("CleanURL(%q) error = %v, want one containing %q", tc.in, err, tc.err)
			}
			continue
		}
		if err != nil || got != tc.want {
			t.Errorf("CleanURL(%q) = %q, %v; want %q", tc.in, got, err, tc.want)
		}
	}
}

func TestStoreKeepsTargetsAcrossRestarts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "targets.json")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.Add("Panel", "http://10.0.0.120:8090/")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := s.Add("", "http://10.0.0.121:8090") // no name: the host is the name
	if b.Name != "10.0.0.121:8090" {
		t.Errorf("name = %q, want the host", b.Name)
	}
	if a.ID == "" || a.ID == b.ID {
		t.Errorf("ids %q and %q", a.ID, b.ID)
	}
	if _, err := s.Update(a.ID, "Line 1", "http://10.0.0.125:8090"); err != nil {
		t.Fatal(err)
	}
	if err := s.Remove(b.ID); err != nil {
		t.Fatal(err)
	}

	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	got := again.List()
	if len(got) != 1 || got[0] != (Target{ID: a.ID, Name: "Line 1", URL: "http://10.0.0.125:8090"}) {
		t.Errorf("after a restart: %+v", got)
	}
}

func TestStoreRefusals(t *testing.T) {
	s, _ := Open("")
	a, _ := s.Add("A", "http://a:1")
	if _, err := s.Add("B", "nonsense"); err == nil {
		t.Error("a bad address was added")
	}
	if _, err := s.Add(strings.Repeat("x", MaxName+1), "http://b:1"); err == nil {
		t.Error("a name that is too long was added")
	}
	if _, err := s.Update(a.ID, "A", "ftp://a"); err == nil {
		t.Error("a bad address was saved by an update")
	}
	if got, _ := s.Get(a.ID); got.URL != "http://a:1" {
		t.Errorf("a refused update changed the target: %+v", got)
	}
	if _, err := s.Update("nope", "A", "http://a:1"); !errors.Is(err, ErrNotFound) {
		t.Errorf("update of a missing target: %v", err)
	}
	if err := s.Remove("nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("remove of a missing target: %v", err)
	}
	for i := 1; i < MaxTargets; i++ {
		if _, err := s.Add("t", "http://h:1"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Add("one too many", "http://h:1"); err == nil {
		t.Errorf("more than %d targets were accepted", MaxTargets)
	}
}

func TestOpenDropsEntriesAHandEditBroke(t *testing.T) {
	path := filepath.Join(t.TempDir(), "targets.json")
	_ = os.WriteFile(path, []byte(`[{"id":"a","name":"ok","url":"http://10.0.0.120:8090/"},{"id":"b","name":"bad","url":"file:///etc"},{"id":"","name":"no id","url":"http://x:1"}]`), 0o600)
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := s.List(); len(got) != 1 || got[0].URL != "http://10.0.0.120:8090" {
		t.Errorf("kept %+v, want only the valid entry with its address tidied", got)
	}
	if _, err := Open(filepath.Join(t.TempDir(), "missing.json")); err != nil {
		t.Errorf("a missing file should be an empty list: %v", err)
	}
	_ = os.WriteFile(path, []byte(`{not json`), 0o600)
	if _, err := Open(path); err == nil {
		t.Error("a file that is not JSON was accepted")
	}
}
