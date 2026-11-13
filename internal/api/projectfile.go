package api

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// saveProjectFile writes a project just deployed (or restored) to the file the runtime loads at start,
// so a restart, a power cut or an update brings back what was last deployed and not the file it was
// first started with. It holds the datasources' passwords, as the file did before, so it is written
// readable by its owner only. The write goes to a file beside it that is renamed over it, so a power
// cut leaves the old project or the new one, never half of one. With no project file (a runtime
// started without one) nothing is written.
func (s *Server) saveProjectFile(p *project.Project) error {
	if s.ProjectFile == "" {
		return nil
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal project: %w", err)
	}
	dir := filepath.Dir(s.ProjectFile)
	tmp, err := os.CreateTemp(dir, ".deploy-*.screens.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // gone once renamed; removes a leftover after a failure
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.ProjectFile)
}

// keepDeployed saves the project and says what happened: the deploy has already taken effect on
// the runtime, so a failure to save it is reported, not refused.
func (s *Server) keepDeployed(p *project.Project) (saved bool, warning string) {
	if s.ProjectFile == "" {
		return false, "this runtime was started without a project file, so the project is not kept across a restart"
	}
	if err := s.saveProjectFile(p); err != nil {
		log.Printf("[API] could not save the deployed project to %s: %v", s.ProjectFile, err)
		return false, fmt.Sprintf("the project could not be saved to %s, so a restart goes back to the previous one: %v", s.ProjectFile, err)
	}
	return true, ""
}
