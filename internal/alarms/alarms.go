// Package alarms provides a lightweight alarm engine: evaluate each rule's
// expression on the tag updates it reads, track active/acknowledged events,
// and fan-out change notifications to WebSocket subscribers.
//
// While an input a rule needs is Bad or missing, the expression is unknown:
// the alarm keeps its state (a lost connection neither clears nor raises
// it) and its event carries the reason until the input is back.
package alarms

import (
	"log"
	"sync"
	"time"

	"github.com/Speth12/Speths_Screens/internal/expr"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Condition is the comparison of a v2 alarm rule. Rules are expressions
// since format 3; old alarm history rows still carry a condition.
type Condition string

// Severity describes how critical an alarm is.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// Rule defines when an alarm should fire: while Expr is true.
type Rule struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Expr     string   `json:"expr"`
	Severity Severity `json:"severity"`
	Message  string   `json:"message"`
}

// Event is an instance of a rule that has fired.
type Event struct {
	ID       string `json:"id"`
	RuleID   string `json:"ruleId"`
	RuleName string `json:"ruleName"`
	// Binding is the first tag the rule's expression reads, so alarm lists
	// keep a tag column.
	Binding string `json:"binding"`
	Expr    string `json:"expr,omitempty"`
	// Condition and Threshold are set only on events from before format 3.
	Condition Condition `json:"condition,omitempty"`
	Threshold float64   `json:"threshold,omitempty"`
	Severity  Severity  `json:"severity"`
	Message   string    `json:"message"`
	Value     float64   `json:"value"`  // the Binding tag's value when the alarm last changed
	Active    bool      `json:"active"` // true = condition still true
	Acked     bool      `json:"acked"`
	// Reason says why the alarm cannot be evaluated right now ("input
	// {plc:T} is Bad"); empty when it can.
	Reason      string     `json:"reason,omitempty"`
	TriggeredAt time.Time  `json:"triggeredAt"`
	AckedAt     *time.Time `json:"ackedAt,omitempty"`
	NormalAt    *time.Time `json:"normalAt,omitempty"`
}

// compiled is a rule with its compiled expression.
type compiled struct {
	Rule
	expr *expr.Expr
}

// Engine evaluates tag updates against a set of rules and maintains the
// current alarm state.  It is safe for concurrent use.
type Engine struct {
	mu          sync.RWMutex
	rules       []Rule
	compiled    []compiled
	readers     map[string][]int             // tag → indices in compiled of the rules that read it
	tags        map[string]tagstore.TagState // latest state of every tag a rule reads
	events      map[string]*Event            // keyed by rule ID (one event per rule)
	subs        map[*Subscription]struct{}
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
	// A rule that does not compile is skipped; a project with one is refused
	// before it gets here (project.ExpressionProblems).
	e.compiled = e.compiled[:0]
	e.readers = map[string][]int{}
	for _, r := range rules {
		x, err := expr.Compile(r.Expr)
		if err != nil {
			log.Printf("[ALARMS] rule %s: %v", r.ID, err)
			continue
		}
		for _, ref := range x.Refs {
			e.readers[ref] = append(e.readers[ref], len(e.compiled))
		}
		e.compiled = append(e.compiled, compiled{Rule: r, expr: x})
	}
	if e.tags == nil {
		e.tags = map[string]tagstore.TagState{}
	}
}

// Rules returns the current rule list.
func (e *Engine) Rules() []Rule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Rule, len(e.rules))
	copy(out, e.rules)
	return out
}

// Evaluate is called by the runtime pump on every tag update. path is the
// full "dsId:tagPath" binding string; every rule that reads it is
// evaluated again.
func (e *Engine) Evaluate(path string, state tagstore.TagState) {
	e.mu.Lock()
	defer e.mu.Unlock()

	readers := e.readers[path]
	if len(readers) == 0 {
		return
	}
	e.tags[path] = state
	env := expr.Env{Tag: func(ref string) (expr.Input, bool) {
		s, ok := e.tags[ref]
		return expr.Input{Value: s.Value, Quality: s.Quality}, ok
	}}
	for _, i := range readers {
		r := e.compiled[i]
		v, why := r.expr.Eval(env)
		existing := e.events[r.ID]
		if why != "" {
			// Unknown: the alarm keeps its state and says why.
			if existing != nil && existing.Reason != why {
				existing.Reason = why
				e.fanOut(*existing)
			}
			continue
		}
		binding, value := e.firstTag(r)
		switch {
		case truthy(v) && existing == nil:
			// New alarm event.
			e.eventSerial++
			ev := &Event{
				ID:          eventID(r.ID, e.eventSerial),
				RuleID:      r.ID,
				RuleName:    r.Name,
				Binding:     binding,
				Expr:        r.Expr,
				Severity:    r.Severity,
				Message:     r.Message,
				Value:       value,
				Active:      true,
				TriggeredAt: time.Now(),
			}
			e.events[r.ID] = ev
			e.fanOut(*ev)
		case truthy(v) && !existing.Active:
			// Re-triggered after going normal.
			existing.Active = true
			existing.Acked = false
			existing.AckedAt = nil
			existing.NormalAt = nil
			existing.Value = value
			existing.Reason = ""
			existing.TriggeredAt = time.Now()
			e.fanOut(*existing)
		case !truthy(v) && existing != nil && existing.Active:
			// Condition returned to normal.
			now := time.Now()
			existing.Active = false
			existing.NormalAt = &now
			existing.Value = value
			existing.Reason = ""
			e.fanOut(*existing)
		case existing != nil && existing.Reason != "":
			// The input is back and the state did not change.
			existing.Reason = ""
			e.fanOut(*existing)
		}
	}
}

// firstTag returns the first tag a rule reads and its value as a number
// (0 when it is not one), for the event's tag and value columns.
func (e *Engine) firstTag(r compiled) (string, float64) {
	if len(r.expr.Refs) == 0 {
		return "", 0
	}
	ref := r.expr.Refs[0]
	f, _ := toFloat(e.tags[ref].Value)
	return ref, f
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

// DefaultQueue is how many alarm changes a subscriber can fall behind by
// before it has to resync from a snapshot. Tests lower it.
var DefaultQueue = 256

// Subscribe returns a subscription to every alarm event change. Call Close
// when done. Subscribe before taking a snapshot with Events, so no change
// falls between the two.
func (e *Engine) Subscribe() *Subscription { return e.SubscribeN(DefaultQueue) }

// SubscribeN is Subscribe with a queue of size changes.
func (e *Engine) SubscribeN(size int) *Subscription {
	s := &Subscription{engine: e, max: size, signal: make(chan struct{}, 1)}
	e.mu.Lock()
	if e.subs == nil {
		e.subs = map[*Subscription]struct{}{}
	}
	e.subs[s] = struct{}{}
	e.mu.Unlock()
	return s
}

// Subscription receives alarm event changes in order. Delivery never
// blocks the engine: when the queue is full it is dropped and Next reports
// a resync, after which the subscriber reads the full state with Events.
//
//	s := engine.Subscribe()
//	defer s.Close()
//	send(engine.Events())
//	for range s.C() {
//		changes, resync := s.Next()
//		if resync {
//			send(engine.Events())
//		}
//		send(changes)
//	}
type Subscription struct {
	engine *Engine
	max    int
	signal chan struct{}

	mu     sync.Mutex
	queue  []Event
	resync bool
	closed bool
}

// C receives a value when changes may be waiting. Receive before Next.
func (s *Subscription) C() <-chan struct{} { return s.signal }

// Next returns the waiting changes, oldest first. resync is true when
// changes were dropped since the last call: read Events for the full state
// before applying changes.
func (s *Subscription) Next() (changes []Event, resync bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	changes, resync = s.queue, s.resync
	s.queue, s.resync = nil, false
	return changes, resync
}

// Close stops delivery. The subscription cannot be reused.
func (s *Subscription) Close() {
	s.engine.mu.Lock()
	delete(s.engine.subs, s)
	s.engine.mu.Unlock()
	s.mu.Lock()
	s.closed = true
	s.queue = nil
	s.mu.Unlock()
}

// push queues one change. The caller holds the engine lock.
func (s *Subscription) push(ev Event) {
	s.mu.Lock()
	switch {
	case s.closed, s.resync:
		// a resync covers it: the snapshot is read after Next
	case len(s.queue) >= s.max:
		s.queue, s.resync = nil, true
	default:
		s.queue = append(s.queue, ev)
	}
	s.mu.Unlock()
	select {
	case s.signal <- struct{}{}:
	default:
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

// truthy is the expression language's truth: true, a number other than 0,
// or text that is not empty.
func truthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	}
	return false
}

// toFloat reads a tag value as a number (every Go number type a driver
// delivers; see tagstore.Number).
func toFloat(v any) (float64, bool) { return tagstore.Number(v) }

// fanOut hands a change to every subscriber. The caller holds e.mu.
func (e *Engine) fanOut(ev Event) {
	for s := range e.subs {
		s.push(ev)
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
