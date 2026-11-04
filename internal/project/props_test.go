package project

import (
	"strings"
	"testing"
)

func TestTypedProps(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	gauge := Widget{Type: Gauge, Props: &WidgetProps{Min: f(1), Max: f(9), Unit: str2("bar")}}
	p, err := gauge.AsGauge()
	if err != nil || *p.Min != 1 || *p.Max != 9 || *p.Unit != "bar" {
		t.Fatalf("AsGauge = %+v, %v", p, err)
	}
	if _, err := gauge.AsButton(); err == nil || !strings.Contains(err.Error(), "not a button") {
		t.Errorf("AsButton on a gauge: %v", err)
	}
	stray := Widget{Type: Gauge, Props: &WidgetProps{Step: f(1)}}
	if _, err := stray.AsGauge(); err == nil || !strings.Contains(err.Error(), `"step"`) {
		t.Errorf("a gauge with a setpoint's step: %v", err)
	}
	if p, err := (Widget{Type: LED}).AsLed(); err != nil || p.TrueColor != nil {
		t.Errorf("no props: %+v, %v", p, err)
	}
	if got := PropsKeys[Gauge]; got[0] != "label" || got[len(got)-1] != "thresholds" {
		t.Errorf("PropsKeys[gauge] = %v, want frame settings first", got)
	}
}

func str2(s string) *string { return &s }
