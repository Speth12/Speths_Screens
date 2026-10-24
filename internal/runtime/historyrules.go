package runtime

import (
	"strings"
	"time"

	"github.com/Speth12/Speths_Screens/internal/historian"
	"github.com/Speth12/Speths_Screens/internal/project"
)

// historianRules turns the project's "historian" section into the
// historian's storage rules. A missing section stores every change.
func historianRules(p *project.Project) historian.Rules {
	var r historian.Rules
	s := p.Historian
	if s == nil {
		return r
	}
	if s.Deadband != nil {
		r.Deadband = *s.Deadband
	}
	if s.RetentionDays != nil && *s.RetentionDays > 0 {
		r.Retention = time.Duration(*s.RetentionDays) * 24 * time.Hour
	}
	for _, t := range s.Tags {
		rule := historian.TagRule{Path: t.Path, Deadband: t.Deadband, Skip: t.Store != nil && !*t.Store}
		if strings.HasSuffix(t.Path, "*") {
			rule.Path, rule.Prefix = strings.TrimSuffix(t.Path, "*"), true
		}
		r.Tags = append(r.Tags, rule)
	}
	return r
}
