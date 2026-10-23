// Package eventbus provides a thread-safe publish/subscribe event bus for Speth's Screens.
//
// All runtime subsystems (alarms, tags, recipes, security) publish typed events
// through the bus.  Subscribers receive a buffered channel; slow subscribers
// are dropped rather than blocking publishers.
//
// Designed for in-process use; a future NATS adapter can replace the bus
// implementation without changing publishers or subscribers.
package eventbus

import (
	"sync"
	"sync/atomic"
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
	mu     sync.RWMutex
	subs   map[EventType]map[uint64]chan<- Event
	nextID atomic.Uint64
}

// New returns a ready Bus.
func New() *Bus {
	return &Bus{subs: make(map[EventType]map[uint64]chan<- Event)}
}

// Publish sends an event to all subscribers of its type.
// Slow subscribers (full channel) are skipped, not blocked.
func (b *Bus) Publish(ev Event) {
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now()
	}
	b.mu.RLock()
	m := b.subs[ev.Type]
	b.mu.RUnlock()
	for _, ch := range m {
		select {
		case ch <- ev:
		default:
		}
	}
}

// Subscribe returns a buffered channel that receives events of typ.
// Call the returned cancel func when done to avoid leaks.
func (b *Bus) Subscribe(typ EventType) (<-chan Event, func()) {
	id := b.nextID.Add(1)
	ch := make(chan Event, 128)

	b.mu.Lock()
	if b.subs[typ] == nil {
		b.subs[typ] = make(map[uint64]chan<- Event)
	}
	b.subs[typ][id] = ch
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		delete(b.subs[typ], id)
		b.mu.Unlock()
		// drain so no goroutine leaks waiting to send
		for len(ch) > 0 {
			<-ch
		}
	}
	return ch, cancel
}

// SubscribeAll returns a channel that receives every event regardless of type.
func (b *Bus) SubscribeAll() (<-chan Event, func()) {
	types := []EventType{
		EventTagChanged, EventAlarmRaised, EventAlarmCleared, EventAlarmAcked,
		EventRecipeApplied, EventUserLoggedIn, EventUserLoggedOut, EventProjectLoaded,
	}
	merged := make(chan Event, 256)
	cancels := make([]func(), 0, len(types))

	for _, typ := range types {
		ch, cancel := b.Subscribe(typ)
		cancels = append(cancels, cancel)
		go func(src <-chan Event) {
			for ev := range src {
				select {
				case merged <- ev:
				default:
				}
			}
		}(ch)
	}

	return merged, func() {
		for _, c := range cancels {
			c()
		}
	}
}
