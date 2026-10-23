package projectfs

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/project"
)

func sampleProject() *project.Project {
	name := "Test Plant"
	p := &project.Project{
		Version: "0.1.0",
		Name:    &name,
		Datasources: []project.Datasource{
			{ID: "virt", Label: "Virtual", Type: "virtual"},
		},
		Pages: []project.Page{
			{ID: "p1", Name: "Main", Widgets: []project.Widget{}},
			{ID: "p2", Name: "Overview", Widgets: []project.Widget{}},
		},
	}
	return p
}

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	p := sampleProject()

	if err := Save(dir, p); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Check files exist
	for _, f := range []string{
		"project.json",
		filepath.Join("pages", "main.json"),
		filepath.Join("pages", "overview.json"),
		filepath.Join("drivers", "virt.json"),
	} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Errorf("file missing: %s", f)
		}
	}

	loaded, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Version != "0.1.0" {
		t.Errorf("version: %q", loaded.Version)
	}
	if len(loaded.Pages) != 2 {
		t.Errorf("pages: %d", len(loaded.Pages))
	}
	if len(loaded.Datasources) != 1 {
		t.Errorf("datasources: %d", len(loaded.Datasources))
	}
}

func TestIsDirectoryProject(t *testing.T) {
	dir := t.TempDir()
	if IsDirectoryProject(dir) {
		t.Error("empty dir should not be a project")
	}
	Save(dir, sampleProject())
	if !IsDirectoryProject(dir) {
		t.Error("saved dir should be a project")
	}
}

func TestMigrateFromBlob(t *testing.T) {
	blob := `{"version":"0.1.0","datasources":[],"pages":[{"id":"p1","name":"Main","widgets":[]}]}`
	blobPath := filepath.Join(t.TempDir(), "project.json")
	os.WriteFile(blobPath, []byte(blob), 0o644)

	destDir := filepath.Join(t.TempDir(), "migrated")
	if err := MigrateFromBlob(blobPath, destDir); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if !IsDirectoryProject(destDir) {
		t.Error("migrated dir should be a project")
	}
}

func TestJSONIsHumanReadable(t *testing.T) {
	dir := t.TempDir()
	Save(dir, sampleProject())

	data, err := os.ReadFile(filepath.Join(dir, "project.json"))
	if err != nil {
		t.Fatal(err)
	}
	// human-readable means indented (contains newlines)
	var m map[string]any
	json.Unmarshal(data, &m)
	if string(data) == string(mustMarshalCompact(m)) {
		t.Error("expected indented JSON, got compact")
	}
}

func mustMarshalCompact(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
