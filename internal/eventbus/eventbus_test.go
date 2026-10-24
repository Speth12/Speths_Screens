package eventbus

import (
	"testing"
	"time"
)

// wait returns the next batch from s, or fails after 100 ms.
func wait(t *testing.T, s *Subscription) ([]Event, int) {
	t.Helper()
	select {
	case <-s.C():
		return s.Next()
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for events")
		return nil, 0
	}
}

func TestPublishSubscribe(t *testing.T) {
	b := New()
	s := b.Subscribe(EventTagChanged)
	defer s.Close()

	b.Publish(Event{Type: EventTagChanged, Target: "Plant.Tank.Level", Payload: 42.0})

	evs, _ := wait(t, s)
	if len(evs) != 1 || evs[0].Target != "Plant.Tank.Level" || evs[0].Payload.(float64) != 42.0 {
		t.Errorf("got %+v", evs)
	}
}

func TestNoDeliveryAfterClose(t *testing.T) {
	b := New()
	s := b.Subscribe(EventAlarmRaised)
	s.Close()
	b.Publish(Event{Type: EventAlarmRaised})
	select {
	case <-s.C():
		t.Error("signalled after Close")
	case <-time.After(20 * time.Millisecond):
	}
	if evs, _ := s.Next(); len(evs) != 0 {
		t.Errorf("events after Close: %v", evs)
	}
}

func TestMultipleSubscribers(t *testing.T) {
	b := New()
	s1, s2 := b.Subscribe(EventRecipeApplied), b.Subscribe(EventRecipeApplied)
	defer s1.Close()
	defer s2.Close()

	b.Publish(Event{Type: EventRecipeApplied, Target: "recipe-1"})

	for _, s := range []*Subscription{s1, s2} {
		if evs, _ := wait(t, s); len(evs) != 1 || evs[0].Target != "recipe-1" {
			t.Errorf("got %+v", evs)
		}
	}
}

func TestTypeFiltering(t *testing.T) {
	tests := []struct {
		name  string
		types []EventType
		want  []string // targets received
	}{
		{"one type", []EventType{EventAlarmAcked}, []string{"alarm-1"}},
		{"two types", []EventType{EventAlarmAcked, EventTagChanged}, []string{"noise", "alarm-1"}},
		{"every type", nil, []string{"noise", "alarm-1", "loaded"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			b := New()
			s := b.Subscribe(tc.types...)
			defer s.Close()
			b.Publish(Event{Type: EventTagChanged, Target: "noise"})
			b.Publish(Event{Type: EventAlarmAcked, Target: "alarm-1"})
			b.Publish(Event{Type: EventProjectLoaded, Target: "loaded"})
			evs, _ := wait(t, s)
			var got []string
			for _, ev := range evs {
				got = append(got, ev.Target)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("got %v, want %v", got, tc.want)
				}
			}
		})
	}
}

// A subscriber that falls behind keeps the newest events, in order, and
// learns how many it missed; publishing never waits for it.
func TestSlowSubscriberKeepsNewest(t *testing.T) {
	b := New()
	s := b.SubscribeN(10, EventTagChanged)
	defer s.Close()

	start := time.Now()
	for i := range 25 {
		b.Publish(Event{Type: EventTagChanged, Payload: i})
	}
	if el := time.Since(start); el > 50*time.Millisecond {
		t.Errorf("Publish waited %v for a subscriber nobody reads", el)
	}
	evs, dropped := s.Next()
	if dropped != 15 || len(evs) != 10 {
		t.Fatalf("got %d events and %d dropped, want 10 and 15", len(evs), dropped)
	}
	for i, ev := range evs {
		if ev.Payload != 15+i {
			t.Errorf("event %d = %v, want %d (oldest first, newest kept)", i, ev.Payload, 15+i)
		}
	}
	if _, dropped := s.Next(); dropped != 0 {
		t.Errorf("dropped count not reset: %d", dropped)
	}
}

func TestTimestampAutoSet(t *testing.T) {
	b := New()
	s := b.Subscribe(EventUserLoggedIn)
	defer s.Close()

	before := time.Now()
	b.Publish(Event{Type: EventUserLoggedIn})
	evs, _ := wait(t, s)
	if evs[0].Timestamp.Before(before) {
		t.Errorf("timestamp not auto-set")
	}
}
