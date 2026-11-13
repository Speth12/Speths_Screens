package sim

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestValue(t *testing.T) {
	at := time.UnixMilli(1_700_000_000_000)
	tests := []struct {
		name string
		path string
	}{{"a temperature", "Arp.Plc.Eclr/Main.Temp"}, {"a level", "ns=6;s=Level"}, {"empty", ""}}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			v := Value(tc.path, at)
			if v < 5 || v > 95 {
				t.Errorf("Value = %v, want between 5 and 95", v)
			}
			if Value(tc.path, at) != v {
				t.Error("the same tag at the same moment gave another value")
			}
		})
	}
	// Two tags do not move together, and a tag moves over time.
	if Value("a", at) == Value("b", at) {
		t.Error("two tags have the same value")
	}
	if Value("a", at) == Value("a", at.Add(3*time.Second)) {
		t.Error("the value does not move")
	}
}

// The values match the IDE's demo values (packages/ide/src/store/dummyData.ts) for the same path and moment.
func TestValueMatchesTheIDE(t *testing.T) {
	// dummyValue("plc:Temp", 1700000000000) in the IDE.
	if got := Value("plc:Temp", time.UnixMilli(1_700_000_000_000)); got != ideTemp {
		t.Errorf("Value = %v, the IDE shows %v", got, ideTemp)
	}
}

func TestDriverReportsAndKeepsWrites(t *testing.T) {
	tick = 10 * time.Millisecond
	d := New()
	out := make(chan tagstore.TagUpdate, 64)
	if err := d.Connect(context.Background(), drivers.DriverConfig{}, out); err != nil {
		t.Fatal(err)
	}
	defer d.Disconnect()
	_ = d.SetTags([]string{"Temp", "Run"})
	seen := map[string]tagstore.TagState{}
	deadline := time.After(2 * time.Second)
	for len(seen) < 2 {
		select {
		case u := <-out:
			seen[u.Path] = u.State
		case <-deadline:
			t.Fatalf("reported %v", seen)
		}
	}
	if seen["Temp"].Quality != "Good" {
		t.Errorf("quality %q", seen["Temp"].Quality)
	}
	_ = d.Write(context.Background(), "Run", true)
	for {
		select {
		case u := <-out:
			if u.Path == "Run" && u.State.Value == true {
				if !d.Status().Connected || d.Status().TagCount != 2 {
					t.Errorf("status %+v", d.Status())
				}
				return
			}
		case <-time.After(2 * time.Second):
			t.Fatal("the written value was not reported")
		}
	}
}

// ideTemp is dummyValue("plc:Temp", 1700000000000) as the IDE computes it.
const ideTemp = 70.11
