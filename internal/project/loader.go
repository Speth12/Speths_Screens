package project

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
)

// Load reads and unmarshals a project.json file.
func Load(path string) (*Project, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	return Parse(data)
}

// Parse reads project JSON of any format: it upgrades an older format,
// checks the result against schema.json, and decodes it. What the upgrade
// dropped is logged; ParseNotes returns it instead.
func Parse(data []byte) (*Project, error) {
	p, notes, err := ParseNotes(data)
	for _, n := range notes {
		log.Printf("[PROJECT] upgrade: %s", n)
	}
	return p, err
}

// ParseNotes is Parse, returning the upgrade's notes.
func ParseNotes(data []byte) (*Project, []string, error) {
	current, notes, err := Upgrade(data)
	if err != nil {
		return nil, nil, err
	}
	if err := ValidateJSON(current); err != nil {
		return nil, notes, err
	}
	var p Project
	if err := json.Unmarshal(current, &p); err != nil {
		return nil, notes, fmt.Errorf("unmarshal project: %w", err)
	}
	if err := validate(&p); err != nil {
		return nil, notes, fmt.Errorf("validate project: %w", err)
	}
	return &p, notes, nil
}

func validate(p *Project) error {
	if p.Version == "" {
		return fmt.Errorf("version is required")
	}
	if len(p.Pages) == 0 {
		return fmt.Errorf("at least one page is required")
	}
	seen := map[string]bool{}
	for i, ds := range p.Datasources {
		if ds.ID == "" {
			return fmt.Errorf("datasource[%d]: id is required", i)
		}
		if seen[ds.ID] {
			return fmt.Errorf("datasource[%d]: duplicate id %q", i, ds.ID)
		}
		seen[ds.ID] = true
	}
	pageIDs := map[string]bool{}
	for i, pg := range p.Pages {
		if pg.ID == "" {
			return fmt.Errorf("page[%d]: id is required", i)
		}
		if pageIDs[pg.ID] {
			return fmt.Errorf("page[%d]: duplicate id %q", i, pg.ID)
		}
		pageIDs[pg.ID] = true
	}
	return nil
}
