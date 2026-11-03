package historian

import (
	"sort"
	"strings"
	"time"
)

// Rules decide what the historian stores for each tag. They come from the
// project's "historian" section; the zero value stores every change.
type Rules struct {
	Deadband  float64       // default deadband; 0 stores any change
	Retention time.Duration // 0 keeps the retention set with SetRetention
	Tags      []TagRule
}

// TagRule applies to one tag (datasource:path), or with Prefix to every tag
// starting with Path.
type TagRule struct {
	Path     string
	Prefix   bool
	Deadband *float64 // nil uses Rules.Deadband
	Skip     bool     // leave these tags out of the history
}

// policy is what applies to one path.
type policy struct {
	deadband float64
	skip     bool
}

// ruleSet is Rules ready for lookups: exact rules by path, prefix rules
// longest first, so the most specific rule wins.
type ruleSet struct {
	deadband  float64
	retention time.Duration
	exact     map[string]TagRule
	prefixes  []TagRule
}

func compile(r Rules) *ruleSet {
	rs := &ruleSet{deadband: r.Deadband, retention: r.Retention, exact: map[string]TagRule{}}
	for _, t := range r.Tags {
		if t.Prefix {
			rs.prefixes = append(rs.prefixes, t)
		} else {
			rs.exact[t.Path] = t // a later duplicate wins
		}
	}
	sort.SliceStable(rs.prefixes, func(i, j int) bool { return len(rs.prefixes[i].Path) > len(rs.prefixes[j].Path) })
	return rs
}

func (rs *ruleSet) forPath(path string) policy {
	if t, ok := rs.exact[path]; ok {
		return rs.apply(t)
	}
	for _, t := range rs.prefixes {
		if strings.HasPrefix(path, t.Path) {
			return rs.apply(t)
		}
	}
	return policy{deadband: rs.deadband}
}

func (rs *ruleSet) apply(t TagRule) policy {
	p := policy{deadband: rs.deadband, skip: t.Skip}
	if t.Deadband != nil {
		p.deadband = *t.Deadband
	}
	return p
}

// SetRules replaces the storage rules. It is safe to call while updates are
// being recorded; updates enqueued afterwards follow the new rules.
func (h *Historian) SetRules(r Rules) { h.rules.Store(compile(r)) }

// retentionNow is the project's retention when it sets one, else the one
// given to SetRetention.
func (h *Historian) retentionNow() time.Duration {
	if d := h.rules.Load().retention; d > 0 {
		return d
	}
	return time.Duration(h.retention.Load())
}
