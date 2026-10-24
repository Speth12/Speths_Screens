// Package eventbus provides a thread-safe publish/subscribe event bus for Speth's Screens.
//
// All runtime subsystems (alarms, tags, recipes, security) publish typed events
// through the bus. Each subscriber has a bounded queue; Publish never blocks.
// When a slow subscriber's queue is full the oldest events go, and the
// subscriber learns how many it missed, so it always ends on the newest.
//
// Designed for in-process use; a future NATS adapter can replace the bus
// implementation without changing publishers or subscribers.
package eventbus

import (
	"sync"
	"time"
)

// EventType identifies the kind of event.
type EventType string

const (
	EventTagChanged    EventType = "tag.changed"
	EventAlarmRaised   EventType = "alarm.raised"
	EventAlarmCleared  EventType = "alarm.cleared"
	EventAlarmAcked    EventType = "alarm.acked"
	EventRecipeApplied EventType = "recipe.applied"
	EventUserLoggedIn  EventType = "user.login"
	EventUserLoggedOut EventType = "user.logout"
	EventProjectLoaded EventType = "project.loaded"
)

// DefaultQueue is how many events a subscriber can fall behind by. Tests
// lower it.
var DefaultQueue = 256

// Event is the envelope published on the bus.
type Event struct {
	Type      EventType `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source,omitempty"` // datasource / user / component
	Target    string    `json:"target,omitempty"` // tag path, alarm id, recipe id, etc.
	Payload   any       `json:"payload,omitempty"`
}

// Bus is the central event dispatcher.
type Bus struct {
	mu   sync.RWMutex
	subs map[*Subscription]struct{}
}

// New returns a ready Bus.
func New() *Bus {
	return &Bus{subs: map[*Subscription]struct{}{}}
}

// Publish hands an event to every subscriber of its type. It never blocks.
func (b *Bus) Publish(ev Event) {
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now()
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for s := range b.subs {
		if s.types == nil || s.types[ev.Type] {
			s.push(ev)
		}
	}
}

// Subscribe returns a subscription to the given event types, or to every
// type when none is given. Call Close when done.
func (b *Bus) Subscribe(types ...EventType) *Subscription {
	return b.SubscribeN(DefaultQueue, types...)
}

// SubscribeN is Subscribe with a queue of size events.
func (b *Bus) SubscribeN(size int, types ...EventType) *Subscription {
	s := &Subscription{bus: b, max: size, signal: make(chan struct{}, 1)}
	if len(types) > 0 {
		s.types = map[EventType]bool{}
		for _, t := range types {
			s.types[t] = true
		}
	}
	b.mu.Lock()
	b.subs[s] = struct{}{}
	b.mu.Unlock()
	return s
}

// Subscription receives events in publish order:
//
//	s := bus.Subscribe(eventbus.EventProjectLoaded)
//	defer s.Close()
//	for range s.C() {
//		events, dropped := s.Next()
//		...
//	}
type Subscription struct {
	bus    *Bus
	types  map[EventType]bool // nil: every type
	max    int
	signal chan struct{}

	mu      sync.Mutex
	queue   []Event
	dropped int
	closed  bool
}

// C receives a value when events may be waiting. Receive before Next.
func (s *Subscription) C() <-chan struct{} { return s.signal }

// Next returns the waiting events, oldest first, and how many older events
// were dropped since the last call because the queue was full.
func (s *Subscription) Next() (events []Event, dropped int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	events, dropped = s.queue, s.dropped
	s.queue, s.dropped = nil, 0
	return events, dropped
}

// Close stops delivery. The subscription cannot be reused.
func (s *Subscription) Close() {
	s.bus.mu.Lock()
	delete(s.bus.subs, s)
	s.bus.mu.Unlock()
	s.mu.Lock()
	s.closed = true
	s.queue = nil
	s.mu.Unlock()
}

func (s *Subscription) push(ev Event) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	if len(s.queue) >= s.max {
		s.queue = s.queue[1:] // drop the oldest; the newest always arrives
		s.dropped++
	}
	s.queue = append(s.queue, ev)
	s.mu.Unlock()
	select {
	case s.signal <- struct{}{}:
	default:
	}
}
