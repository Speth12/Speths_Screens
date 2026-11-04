package virtual

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// startCalc connects a driver with the given tags. Its updates are written
// back into store under the datasource id "sim", as the runtime's pump
// does, so tags can read each other
// and themselves; every update is also sent on the returned channel.
func startCalc(t *testing.T, store *tagstore.TagStore, specs []TagSpec) (*Driver, <-chan tagstore.TagUpdate) {
	t.Helper()
	b, _ := json.Marshal(specs)
	out := make(chan tagstore.TagUpdate, 1024)
	seen := make(chan tagstore.TagUpdate, 1024)
	d := New(store)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for u := range out {
			store.Update("sim:"+u.Path, u.State)
			select {
			case seen <- u:
			default:
			}
		}
	}()
	if err := d.Connect(context.Background(), drivers.DriverConfig{Extra: map[string]string{"tags": string(b)}}, out); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() {
		_ = d.Disconnect()
		close(out)
		<-done
	})
	return d, seen
}

// waitFor returns the first update of path that ok accepts.
func waitFor(t *testing.T, seen <-chan tagstore.TagUpdate, path string, ok func(tagstore.TagState) bool) tagstore.TagState {
	t.Helper()
	deadline := time.After(3 * time.Second)
	var last tagstore.TagState
	for {
		select {
		case u := <-seen:
			if u.Path != path {
				continue
			}
			last = u.State
			if ok(u.State) {
				return u.State
			}
		case <-deadline:
			t.Fatalf("%s: no matching update; last %+v", path, last)
		}
	}
}

func TestCalculatedTagResults(t *testing.T) {
	tests := []struct {
		name    string
		inputs  map[string]tagstore.TagState
		expr    string
		value   any
		quality string
		reason  string
	}{
		{"arithmetic", map[string]tagstore.TagState{"plc:T": {Value: 20.0, Quality: "Good"}}, "{plc:T} * 9/5 + 32", 68.0, "Good", ""},
		{"comparison gives a bool", map[string]tagstore.TagState{"plc:T": {Value: int16(7), Quality: "Good"}}, "{plc:T} > 5", true, "Good", ""},
		{"text", map[string]tagstore.TagState{"plc:F": {Value: 12.345, Quality: "Good"}}, "format({plc:F}, 1) + ' m3/h'", "12.3 m3/h", "Good", ""},
		{"uncertain input is used", map[string]tagstore.TagState{"plc:T": {Value: 2.0, Quality: "Uncertain"}}, "{plc:T} * 2", 4.0, "Good", ""},
		{"Bad input", map[string]tagstore.TagState{"plc:T": {Value: 2.0, Quality: "Bad"}}, "{plc:T} * 2", nil, "Bad", "input {plc:T} is Bad"},
		{"missing input", nil, "{plc:T} * 2", nil, "Bad", "input {plc:T} has no value"},
		{"division by zero", map[string]tagstore.TagState{"plc:T": {Value: 0.0, Quality: "Good"}}, "1 / {plc:T}", nil, "Bad", "division by zero"},
		{"does not compile", nil, "if({plc:T}, 1, 0)", nil, "Bad", "unknown function if at column 1"},
		{"Bad input not needed", map[string]tagstore.TagState{"plc:T": {Value: 2.0, Quality: "Bad"}}, "good({plc:T}) ? {plc:T} : -1", -1.0, "Good", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := tagstore.New()
			for p, s := range tc.inputs {
				store.Update(p, s)
			}
			_, seen := startCalc(t, store, []TagSpec{{Path: "out", Expr: tc.expr}})
			got := waitFor(t, seen, "out", func(tagstore.TagState) bool { return true })
			if got.Value != tc.value || got.Quality != tc.quality || got.Reason != tc.reason {
				t.Errorf("got %v %s %q, want %v %s %q", got.Value, got.Quality, got.Reason, tc.value, tc.quality, tc.reason)
			}
		})
	}
}

// A tag that goes Bad keeps its last value, and comes back when the input
// does; the other tags of the datasource carry on.
func TestCalculatedTagGoesBadAndRecovers(t *testing.T) {
	store := tagstore.New()
	store.Update("plc:T", tagstore.TagState{Value: 10.0, Quality: "Good"})
	_, seen := startCalc(t, store, []TagSpec{{Path: "double", Expr: "{plc:T} * 2"}, {Path: "one", Expr: "1"}, {Path: "broken", Expr: "1 +"}})
	waitFor(t, seen, "double", func(s tagstore.TagState) bool { return s.Value == 20.0 && s.Quality == "Good" })

	store.Update("plc:T", tagstore.TagState{Value: 10.0, Quality: "Bad", Reason: "no answer"})
	bad := waitFor(t, seen, "double", func(s tagstore.TagState) bool { return s.Quality == "Bad" })
	if bad.Value != 20.0 || bad.Reason != "input {plc:T} is Bad" {
		t.Errorf("Bad update %+v, want the last value 20 and the reason", bad)
	}
	waitFor(t, seen, "one", func(s tagstore.TagState) bool { return s.Value == 1.0 && s.Quality == "Good" })

	store.Update("plc:T", tagstore.TagState{Value: 4.0, Quality: "Good"})
	waitFor(t, seen, "double", func(s tagstore.TagState) bool { return s.Value == 8.0 && s.Quality == "Good" })
}

func TestCompileErrorInStatus(t *testing.T) {
	d, seen := startCalc(t, tagstore.New(), []TagSpec{{Path: "ok", Expr: "1"}, {Path: "broken", Expr: "1 +"}})
	waitFor(t, seen, "broken", func(s tagstore.TagState) bool { return s.Quality == "Bad" })
	if st := d.Status(); !strings.Contains(st.LastError, "calculated tag broken: unexpected end of expression") {
		t.Errorf("LastError %q", st.LastError)
	}
}

// The demo's phase tag reads itself; written with good() it starts at 0
// and counts up (Phase 3, step 2).
func TestSelfReadingTagStartsWithGood(t *testing.T) {
	_, seen := startCalc(t, tagstore.New(), []TagSpec{
		{Path: "phase", Expr: "(good({sim:phase}) ? {sim:phase} : 0) + 1"},
		{Path: "plain", Expr: "{sim:plain} + 1"},
	})
	for _, want := range []float64{1, 2, 3} {
		waitFor(t, seen, "phase", func(s tagstore.TagState) bool { return s.Value == want && s.Quality == "Good" })
	}
	// Without good() it never starts: first it has no value, then it reads
	// its own Bad result.
	got := waitFor(t, seen, "plain", func(tagstore.TagState) bool { return true })
	if got.Quality != "Bad" || !strings.HasPrefix(got.Reason, "input {sim:plain} ") {
		t.Errorf("plain = %+v, want Bad because of itself", got)
	}
}
