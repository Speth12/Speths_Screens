package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/project"
)

const keptProject = `{"schemaVersion": 7, "version": "0.1.0", "name": "Kept",
  "datasources": [{"id": "plc", "label": "PLC", "type": "rest", "config": {"host": "10.0.0.210", "username": "u", "password": "secret-in-file"}}],
  "pages": [{"id": "p1", "name": "Main", "widgets": []}]}`

// A deploy is written back to the project file the runtime loads at start, so a restart brings it back.
func TestDeployIsKeptInTheProjectFile(t *testing.T) {
	srv, _, hs := newTestServer(t)
	file := filepath.Join(t.TempDir(), "panel.screens.json")
	if err := os.WriteFile(file, []byte(`{"schemaVersion": 7, "version": "1", "name": "Old", "datasources": [], "pages": [{"id": "p1", "name": "Main", "widgets": []}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	srv.ProjectFile = file

	resp := postJSON(t, hs.URL+"/api/v1/project", keptProject)
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	resp.Body.Close()
	if resp.StatusCode != 200 || got["saved"] != true || got["warning"] != nil {
		t.Fatalf("deploy: %d %v", resp.StatusCode, got)
	}

	// What a restart loads: the deployed project, its password included, readable only by its owner.
	p, err := project.Load(file)
	if err != nil {
		t.Fatalf("the saved file does not load: %v", err)
	}
	if p.Name == nil || *p.Name != "Kept" {
		t.Errorf("a restart would load %v, want the deployed project", p.Name)
	}
	raw, _ := os.ReadFile(file)
	if !strings.Contains(string(raw), "secret-in-file") {
		t.Error("the datasource's password was not kept, so a restart could not log in")
	}
	if runtime.GOOS != "windows" { // Windows has no owner-only file mode
		if st, _ := os.Stat(file); st.Mode().Perm() != 0o600 {
			t.Errorf("file mode %v, want 0600: it holds passwords", st.Mode().Perm())
		}
	}
	// No temporary file is left beside it.
	left, _ := filepath.Glob(filepath.Join(filepath.Dir(file), ".deploy-*"))
	if len(left) != 0 {
		t.Errorf("left behind: %v", left)
	}
}

// A runtime started without a project file says the deploy will not survive a restart.
func TestDeployWithoutAProjectFileSaysSo(t *testing.T) {
	_, _, hs := newTestServer(t)
	resp := postJSON(t, hs.URL+"/api/v1/project", keptProject)
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	resp.Body.Close()
	if resp.StatusCode != 200 || got["saved"] != false || !strings.Contains(got["warning"].(string), "not kept across a restart") {
		t.Errorf("deploy: %d %v", resp.StatusCode, got)
	}
}

// A file that cannot be written is reported; the deploy itself has taken effect.
func TestDeployToAFolderThatIsGone(t *testing.T) {
	srv, _, hs := newTestServer(t)
	srv.ProjectFile = filepath.Join(t.TempDir(), "missing-folder", "p.screens.json")
	resp := postJSON(t, hs.URL+"/api/v1/project", keptProject)
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	resp.Body.Close()
	if resp.StatusCode != 200 || got["saved"] != false || !strings.Contains(got["warning"].(string), "a restart goes back to the previous one") {
		t.Errorf("deploy: %d %v", resp.StatusCode, got)
	}
}

// A runtime not started for demonstrations refuses a project with simulation on, as a conflict.
func TestDeployWithSimulationIsRefusedOutsideADemo(t *testing.T) {
	_, _, hs := newTestServer(t)
	doc := strings.Replace(keptProject, `"name": "Kept",`, `"name": "Kept", "simulation": true,`, 1)
	resp := postJSON(t, hs.URL+"/api/v1/project", doc)
	var got map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&got)
	resp.Body.Close()
	if resp.StatusCode != 409 || !strings.Contains(got["error"].(string), "--allow-simulation") {
		t.Errorf("deploy: %d %v", resp.StatusCode, got)
	}
}
