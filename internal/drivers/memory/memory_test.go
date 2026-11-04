package memory

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/memstore"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestConvert(t *testing.T) {
	tests := []struct {
		typ  string
		in   any
		want any
		err  string
	}{
		{"bool", true, true, ""},
		{"bool", 1.0, true, ""},
		{"bool", 0.0, false, ""},
		{"bool", 2.0, nil, "is a bool, not 2"},
		{"bool", "yes", nil, `is a bool, not the text "yes"`},
		{"int", 3.0, int64(3), ""},
		{"int", int16(-7), int64(-7), ""},
		{"int", 3.5, nil, "is an int, not 3.5"},
		{"int", true, nil, "is an int, not the flag true"},
		{"int", "3", nil, `is an int, not the text "3"`},
		{"real", 3.5, 3.5, ""},
		{"real", float32(0.5), 0.5, ""},
		{"real", "1.5", nil, `is a real, not the text "1.5"`},
		{"string", "auto", "auto", ""},
		{"string", 3.0, nil, "is a string, not 3"},
		{"string", nil, nil, "is a string, not nothing"},
	}
	for _, tc := range tests {
		got, err := convert(tc.typ, tc.in)
		if tc.err != "" {
			if err == nil || err.Error() != tc.err {
				t.Errorf("convert(%s, %#v) error = %v, want %q", tc.typ, tc.in, err, tc.err)
			}
			continue
		}
		if err != nil || got != tc.want {
			t.Errorf("convert(%s, %#v) = %#v, %v; want %#v", tc.typ, tc.in, got, err, tc.want)
		}
	}
}

// fakeRetain keeps values in memory and counts saves per tag.
type fakeRetain struct {
	mu     sync.Mutex
	values map[string]any
	saves  map[string]int
}

func newFake(values map[string]any) *fakeRetain {
	return &fakeRetain{values: values, saves: map[string]int{}}
}

func (f *fakeRetain) Load(string) (map[string]any, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[string]any{}
	for k, v := range f.values {
		out[k] = v
	}
	return out, nil
}

func (f *fakeRetain) Save(_ string, values map[string]any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, v := range values {
		f.values[k] = v
		f.saves[k]++
	}
	return nil
}

func connect(t *testing.T, r drivers.Retainer, specs []Spec) (*Driver, chan tagstore.TagUpdate) {
	t.Helper()
	b, _ := json.Marshal(specs)
	ch := make(chan tagstore.TagUpdate, 256)
	d := New(r)
	if err := d.Connect(context.Background(), drivers.DriverConfig{Extra: map[string]string{"memoryTags": string(b), "datasourceId": "mem"}}, ch); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	return d, ch
}

// latest drains ch and returns the newest value per path.
func latest(ch chan tagstore.TagUpdate) map[string]any {
	out := map[string]any{}
	for {
		select {
		case u := <-ch:
			out[u.Path] = u.State.Value
		default:
			return out
		}
	}
}

func TestStartValues(t *testing.T) {
	r := newFake(map[string]any{"Count": 41.0, "Mode": 3.0, "Plain": 9.0})
	_, ch := connect(t, r, []Spec{
		{Path: "Count", Type: "int", Initial: 0.0, Retain: true},      // the retained value wins
		{Path: "Mode", Type: "string", Initial: "auto", Retain: true}, // retained value of the wrong type: initial
		{Path: "Plain", Type: "int", Initial: 5.0},                    // not retained: initial
		{Path: "Run", Type: "bool"},                                   // no initial: false
		{Path: "Ratio", Type: "real", Initial: "x"},                   // initial of the wrong type: zero
	})
	got := latest(ch)
	want := map[string]any{"Count": int64(41), "Mode": "auto", "Plain": int64(5), "Run": false, "Ratio": 0.0}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %#v, want %#v", k, got[k], v)
		}
	}
}

func TestWrite(t *testing.T) {
	d, ch := connect(t, nil, []Spec{{Path: "Count", Type: "int"}})
	latest(ch)
	if err := d.Write(context.Background(), "Count", 7.0); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if got := latest(ch)["Count"]; got != int64(7) {
		t.Errorf("sent %#v, want 7", got)
	}
	err := d.Write(context.Background(), "Count", "seven")
	if !errors.Is(err, drivers.ErrBadValue) || err.Error() != `memory tag Count is an int, not the text "seven"` {
		t.Errorf("wrong type: %v", err)
	}
	if err := d.Write(context.Background(), "Nope", 1.0); !errors.Is(err, drivers.ErrUnknownTag) {
		t.Errorf("unknown tag: %v", err)
	}
}

// A busy retained tag is saved at most once per SaveInterval; the last
// value is saved on Disconnect.
func TestRetainedSavesAreLimited(t *testing.T) {
	old := SaveInterval
	SaveInterval = 100 * time.Millisecond
	t.Cleanup(func() { SaveInterval = old })
	r := newFake(map[string]any{})
	d, _ := connect(t, r, []Spec{{Path: "Count", Type: "int", Retain: true}, {Path: "Temp", Type: "real"}})
	start := time.Now()
	for i := 1; i <= 50; i++ {
		_ = d.Write(context.Background(), "Count", float64(i))
		_ = d.Write(context.Background(), "Temp", float64(i))
		time.Sleep(10 * time.Millisecond)
	}
	_ = d.Disconnect()
	elapsed := time.Since(start)
	r.mu.Lock()
	defer r.mu.Unlock()
	if max := int(elapsed/SaveInterval) + 2; r.saves["Count"] > max {
		t.Errorf("Count saved %d times in %v, want at most %d", r.saves["Count"], elapsed, max)
	}
	if r.values["Count"] != int64(50) {
		t.Errorf("last saved Count = %#v, want 50", r.values["Count"])
	}
	if r.saves["Temp"] != 0 {
		t.Errorf("Temp is not retained but was saved %d times", r.saves["Temp"])
	}
}

// With the real store, a retained value survives a "restart": a new
// driver on the same file starts from it.
func TestRetainedAcrossRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.db")
	st, err := memstore.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	specs := []Spec{{Path: "Count", Type: "int", Initial: 0.0, Retain: true}, {Path: "Name", Type: "string", Retain: true}}
	d, _ := connect(t, st, specs)
	_ = d.Write(context.Background(), "Count", 12.0)
	_ = d.Write(context.Background(), "Name", "batch 7")
	_ = d.Disconnect()
	st.Close()

	st2, err := memstore.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer st2.Close()
	_, ch := connect(t, st2, specs)
	got := latest(ch)
	if got["Count"] != int64(12) || got["Name"] != "batch 7" {
		t.Errorf("after restart: %#v", got)
	}
}
