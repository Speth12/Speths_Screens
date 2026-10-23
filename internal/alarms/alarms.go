// Package alarms provides a lightweight alarm engine: evaluate tag values
// against threshold rules, track active/acknowledged events, and fan-out
// change notifications to WebSocket subscribers.
package alarms

import (
	"sync"
	"time"
)

// Condition is the comparison operator applied to a tag value.
type Condition string

const (
	CondGT  Condition = "gt"
	CondGTE Condition = "gte"
	CondLT  Condition = "lt"
	CondLTE Condition = "lte"
	CondEQ  Condition = "eq"
	CondNE  Condition = "ne"
)

// Severity describes how critical an alarm is.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// Rule defines when an alarm should fire.
type Rule struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Binding   string    `json:"binding"`   // "dsId:tagPath"
	Condition Condition `json:"condition"`
	Threshold float64   `json:"threshold"`
	Severity  Severity  `json:"severity"`
	Message   string    `json:"message"`
}

// Event is an instance of a rule that has fired.
type Event struct {
	ID          string    `json:"id"`
	RuleID      string    `json:"ruleId"`
	RuleName    string    `json:"ruleName"`
	Binding     string    `json:"binding"`
	Condition   Condition `json:"condition"`
	Threshold   float64   `json:"threshold"`
	Severity    Severity  `json:"severity"`
	Message     string    `json:"message"`
	Value       float64   `json:"value"`       // value that triggered the alarm
	Active      bool      `json:"active"`      // true = condition still true
	Acked       bool      `json:"acked"`
	TriggeredAt time.Time `json:"triggeredAt"`
	AckedAt     *time.Time `json:"ackedAt,omitempty"`
	NormalAt    *time.Time `json:"normalAt,omitempty"`
}

// Engine evaluates tag updates against a set of rules and maintains the
// current alarm state.  It is safe for concurrent use.
type Engine struct {
	mu          sync.RWMutex
	rules       []Rule
	events      map[string]*Event // keyed by rule ID (one event per rule)
	subs        []chan Event
	eventSerial int // monotonic ID suffix
}

// New returns an initialised Engine with no rules.
func New() *Engine {
	return &Engine{
		events: make(map[string]*Event),
	}
}

// SetRules replaces the rule set.  Existing events for removed rules are
// cleared; events for retained rules keep their acked status.
func (e *Engine) SetRules(rules []Rule) {
	e.mu.Lock()
	defer e.mu.Unlock()

	next := make(map[string]bool, len(rules))
	for _, r := range rules {
		next[r.ID] = true
	}
	// Remove events for rules that no longer exist.
	for id := range e.events {
		if !next[id] {
			delete(e.events, id)
		}
	}
	e.rules = make([]Rule, len(rules))
	copy(e.rules, rules)
}

// Rules returns the current rule list.
func (e *Engine) Rules() []Rule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Rule, len(e.rules))
	copy(out, e.rules)
	return out
}

// Evaluate is called by the runtime pump on every tag update.
// path is the full "dsId:tagPath" binding string.
func (e *Engine) Evaluate(path string, value any) {
	fv, ok := toFloat(value)
	if !ok {
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	for _, r := range e.rules {
		if r.Binding != path {
			continue
		}
		triggered := eval(r.Condition, fv, r.Threshold)
		existing := e.events[r.ID]

		if triggered {
			if existing == nil {
				// New alarm event.
				e.eventSerial++
				ev := &Event{
					ID:          eventID(r.ID, e.eventSerial),
					RuleID:      r.ID,
					RuleName:    r.Name,
					Binding:     r.Binding,
					Condition:   r.Condition,
					Threshold:   r.Threshold,
					Severity:    r.Severity,
					Message:     r.Message,
					Value:       fv,
					Active:      true,
					Acked:       false,
					TriggeredAt: time.Now(),
				}
				e.events[r.ID] = ev
				e.fanOut(*ev)
			} else if !existing.Active {
				// Re-triggered after going normal.
				existing.Active = true
				existing.Acked = false
				existing.AckedAt = nil
				existing.NormalAt = nil
				existing.Value = fv
				existing.TriggeredAt = time.Now()
				e.fanOut(*existing)
			}
		} else {
			if existing != nil && existing.Active {
				// Condition returned to normal.
				now := time.Now()
				existing.Active = false
				existing.NormalAt = &now
				existing.Value = fv
				e.fanOut(*existing)
			}
		}
	}
}

// Events returns a snapshot of all known alarm events (active + inactive).
func (e *Engine) Events() []Event {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Event, 0, len(e.events))
	for _, ev := range e.events {
		out = append(out, *ev)
	}
	return out
}

// Acknowledge marks an event as acked by event ID.  Returns true if found.
func (e *Engine) Acknowledge(eventID string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, ev := range e.events {
		if ev.ID == eventID {
			now := time.Now()
			ev.Acked = true
			ev.AckedAt = &now
			e.fanOut(*ev)
			return true
		}
	}
	return false
}

// Subscribe returns a channel that receives every alarm event change.
// The caller must drain the channel; slow consumers will miss events (drop).
func (e *Engine) Subscribe() chan Event {
	ch := make(chan Event, 64)
	e.mu.Lock()
	e.subs = append(e.subs, ch)
	e.mu.Unlock()
	return ch
}

// Unsubscribe removes a subscriber channel.
func (e *Engine) Unsubscribe(ch chan Event) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i, s := range e.subs {
		if s == ch {
			e.subs = append(e.subs[:i], e.subs[i+1:]...)
			close(ch)
			return
		}
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

func eval(cond Condition, value, threshold float64) bool {
	switch cond {
	case CondGT:
		return value > threshold
	case CondGTE:
		return value >= threshold
	case CondLT:
		return value < threshold
	case CondLTE:
		return value <= threshold
	case CondEQ:
		return value == threshold
	case CondNE:
		return value != threshold
	}
	return false
}

func toFloat(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

func (e *Engine) fanOut(ev Event) {
	for _, ch := range e.subs {
		select {
		case ch <- ev:
		default:
			// slow subscriber — drop; they'll catch up on next poll
		}
	}
}

func eventID(ruleID string, serial int) string {
	return ruleID + "-" + itoa(serial)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}
