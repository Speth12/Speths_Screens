package project

import (
	"encoding/json"
	"fmt"
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

// Parse unmarshals project JSON from raw bytes.
func Parse(data []byte) (*Project, error) {
	var p Project
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("unmarshal project: %w", err)
	}
	if err := validate(&p); err != nil {
		return nil, fmt.Errorf("validate project: %w", err)
	}
	return &p, nil
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
