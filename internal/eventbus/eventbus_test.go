package eventbus

import (
	"testing"
	"time"
)

func TestPublishSubscribe(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe(EventTagChanged)
	defer cancel()

	b.Publish(Event{Type: EventTagChanged, Target: "Plant.Tank.Level", Payload: 42.0})

	select {
	case ev := <-ch:
		if ev.Target != "Plant.Tank.Level" {
			t.Errorf("target: %q", ev.Target)
		}
		if ev.Payload.(float64) != 42.0 {
			t.Errorf("payload: %v", ev.Payload)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("timeout waiting for event")
	}
}

func TestNoDeliveryAfterCancel(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe(EventAlarmRaised)
	cancel()
	b.Publish(Event{Type: EventAlarmRaised})
	select {
	case <-ch:
		t.Error("received event after cancel")
	case <-time.After(20 * time.Millisecond):
	}
}

func TestMultipleSubscribers(t *testing.T) {
	b := New()
	ch1, c1 := b.Subscribe(EventRecipeApplied)
	ch2, c2 := b.Subscribe(EventRecipeApplied)
	defer c1(); defer c2()

	b.Publish(Event{Type: EventRecipeApplied, Target: "recipe-1"})

	for _, ch := range []<-chan Event{ch1, ch2} {
		select {
		case ev := <-ch:
			if ev.Target != "recipe-1" {
				t.Errorf("target: %q", ev.Target)
			}
		case <-time.After(100 * time.Millisecond):
			t.Error("timeout")
		}
	}
}

func TestTypeFiltering(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe(EventAlarmAcked)
	defer cancel()

	b.Publish(Event{Type: EventTagChanged, Target: "noise"})
	b.Publish(Event{Type: EventAlarmAcked, Target: "alarm-1"})

	select {
	case ev := <-ch:
		if ev.Target != "alarm-1" {
			t.Errorf("got wrong event: %v", ev)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("timeout")
	}
	// channel should be empty now
	select {
	case ev := <-ch:
		t.Errorf("unexpected extra event: %v", ev)
	default:
	}
}

func TestSlowSubscriberDropped(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe(EventTagChanged)
	defer cancel()

	// Flood with 200 events; channel buffer is 128, extras are dropped
	for i := range 200 {
		b.Publish(Event{Type: EventTagChanged, Target: "T", Payload: i})
	}
	if len(ch) > 128 {
		t.Errorf("channel over capacity: %d", len(ch))
	}
}

func TestTimestampAutoSet(t *testing.T) {
	b := New()
	ch, cancel := b.Subscribe(EventUserLoggedIn)
	defer cancel()

	before := time.Now()
	b.Publish(Event{Type: EventUserLoggedIn})
	ev := <-ch
	if ev.Timestamp.Before(before) {
		t.Errorf("timestamp not auto-set")
	}
}
