// Package projectfs implements the Speth's Screens git-native project format.
//
// Instead of a single flat JSON blob, the project is stored as a directory tree:
//
//	project.json          — manifest (version, name, metadata)
//	pages/
//	  main.json
//	  overview.json
//	assets/
//	  pump_a.json
//	drivers/
//	  opcua_plc.json
//	alarms/
//	  rules.json
//	recipes/
//	  reset.json
//	security/
//	  users.json          — non-sensitive defaults only; passwords never stored here
//
// Each file is human-readable, diff-friendly JSON.  The format is
// backwards-compatible with the single-blob format via Load/Save.
package projectfs

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// Manifest is stored in project.json at the root.
type Manifest struct {
	Version     string  `json:"version"`
	Name        *string `json:"name,omitempty"`
	Description string  `json:"description,omitempty"`
	Format      string  `json:"format"` // always "directory/v1"
	// SchemaVersion is the project format of the pieces; missing means 1.
	SchemaVersion int64 `json:"schemaVersion,omitempty"`
}

// Save writes a project to a directory tree.
// The directory is created if it doesn't exist; existing files are overwritten.
func Save(dir string, p *project.Project) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("projectfs: mkdir %s: %w", dir, err)
	}

	// manifest
	manifest := Manifest{
		Version:       p.Version,
		Name:          p.Name,
		Format:        "directory/v1",
		SchemaVersion: p.SchemaVersion,
	}
	if err := writeJSON(filepath.Join(dir, "project.json"), manifest); err != nil {
		return err
	}

	// pages/
	if err := os.MkdirAll(filepath.Join(dir, "pages"), 0o755); err != nil {
		return err
	}
	for _, pg := range p.Pages {
		fname := safeFilename(pg.Name) + ".json"
		if err := writeJSON(filepath.Join(dir, "pages", fname), pg); err != nil {
			return err
		}
	}

	// drivers/
	if err := os.MkdirAll(filepath.Join(dir, "drivers"), 0o755); err != nil {
		return err
	}
	for _, ds := range p.Datasources {
		fname := safeFilename(ds.ID) + ".json"
		if err := writeJSON(filepath.Join(dir, "drivers", fname), ds); err != nil {
			return err
		}
	}

	// alarms/
	if len(p.AlarmRules) > 0 {
		if err := os.MkdirAll(filepath.Join(dir, "alarms"), 0o755); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(dir, "alarms", "rules.json"), p.AlarmRules); err != nil {
			return err
		}
	}

	// recipes/
	if len(p.Recipes) > 0 {
		if err := os.MkdirAll(filepath.Join(dir, "recipes"), 0o755); err != nil {
			return err
		}
		for _, rec := range p.Recipes {
			fname := safeFilename(rec.ID) + ".json"
			if err := writeJSON(filepath.Join(dir, "recipes", fname), rec); err != nil {
				return err
			}
		}
	}

	return nil
}

// Load reads a project from a directory tree produced by Save. The pieces
// are put together as one project document and read with project.Parse, so
// an older format is upgraded and the result is checked against schema.json.
func Load(dir string) (*project.Project, error) {
	var manifest Manifest
	if err := readJSON(filepath.Join(dir, "project.json"), &manifest); err != nil {
		return nil, fmt.Errorf("projectfs: manifest: %w", err)
	}
	doc := map[string]any{"version": manifest.Version}
	if manifest.Name != nil {
		doc["name"] = *manifest.Name
	}
	if manifest.SchemaVersion != 0 {
		doc["schemaVersion"] = manifest.SchemaVersion
	}

	pieces := func(sub string) ([]json.RawMessage, error) {
		files, _ := filepath.Glob(filepath.Join(dir, sub, "*.json"))
		out := []json.RawMessage{}
		for _, f := range files {
			var raw json.RawMessage
			if err := readJSON(f, &raw); err != nil {
				return nil, fmt.Errorf("projectfs: %s: %w", f, err)
			}
			out = append(out, raw)
		}
		return out, nil
	}
	var err error
	if doc["pages"], err = pieces("pages"); err != nil {
		return nil, err
	}
	if doc["datasources"], err = pieces("drivers"); err != nil {
		return nil, err
	}
	recipes, err := pieces("recipes")
	if err != nil {
		return nil, err
	}
	if len(recipes) > 0 {
		doc["recipes"] = recipes
	}
	rulesPath := filepath.Join(dir, "alarms", "rules.json")
	if _, err := os.Stat(rulesPath); err == nil {
		var rules json.RawMessage
		if err := readJSON(rulesPath, &rules); err != nil {
			return nil, fmt.Errorf("projectfs: alarms: %w", err)
		}
		doc["alarmRules"] = rules
	}

	data, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("projectfs: %w", err)
	}
	p, err := project.Parse(data)
	if err != nil {
		return nil, fmt.Errorf("projectfs: %w", err)
	}
	return p, nil
}

// Validate checks that a project has the minimum required fields.
func Validate(p *project.Project) error {
	if p.Version == "" {
		return errors.New("projectfs: version is required")
	}
	if len(p.Pages) == 0 {
		return errors.New("projectfs: at least one page is required")
	}
	return nil
}

// IsDirectoryProject returns true if path looks like a directory project.
func IsDirectoryProject(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	if !info.IsDir() {
		return false
	}
	_, err = os.Stat(filepath.Join(path, "project.json"))
	return err == nil
}

// MigrateFromBlob converts a single-blob .json project file into a directory.
// The original file is left untouched.
func MigrateFromBlob(blobPath, destDir string) error {
	data, err := os.ReadFile(blobPath)
	if err != nil {
		return err
	}
	p, err := project.Parse(json.RawMessage(data))
	if err != nil {
		return fmt.Errorf("projectfs: parse blob: %w", err)
	}
	if err := Save(destDir, p); err != nil {
		return err
	}
	return nil
}

// ── helpers ────────────────────────────────────────────────────────────────

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("projectfs: marshal %s: %w", path, err)
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("file not found: %s", path)
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func safeFilename(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-':
			b.WriteRune(r)
		case r == ' ' || r == '_' || r == '.':
			b.WriteByte('-')
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}
