package historian

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/speths-screens/internal/tagstore"
)

func newTestHistorian(t *testing.T) *Historian {
	t.Helper()
	h, err := Open("file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h
}

func TestRecordAndQuery(t *testing.T) {
	h := newTestHistorian(t)
	now := time.Now().UnixNano()
	for i := range 5 {
		err := h.Record(tagstore.TagUpdate{
			Path: "sensor.temp",
			State: tagstore.TagState{
				Value:   float64(i) + 0.5,
				Quality: "Good",
				TS:      now + int64(i)*1_000_000,
			},
		})
		if err != nil {
			t.Fatalf("Record: %v", err)
		}
	}
	samples, err := h.Query(context.Background(), "sensor.temp", 0, now+10_000_000, 100)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(samples) != 5 {
		t.Fatalf("got %d samples want 5", len(samples))
	}
	if samples[0].Value.(float64) != 0.5 {
		t.Errorf("first sample: got %v want 0.5", samples[0].Value)
	}
	if samples[4].Quality != "Good" {
		t.Errorf("quality: got %q", samples[4].Quality)
	}
}

func TestQueryRangeFilter(t *testing.T) {
	h := newTestHistorian(t)
	now := time.Now().UnixNano()
	for i := range 10 {
		_ = h.Record(tagstore.TagUpdate{
			Path: "x",
			State: tagstore.TagState{
				Value: i,
				TS:    now + int64(i)*1_000_000_000,
			},
		})
	}
	samples, err := h.Query(context.Background(), "x", now+3_000_000_000, now+6_000_000_000, 0)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(samples) != 4 {
		t.Errorf("range filter: got %d want 4", len(samples))
	}
}

func TestTrimRetention(t *testing.T) {
	h := newTestHistorian(t)
	// Keep only 1 second of history.
	h.SetRetention(time.Second)

	now := time.Now()
	// Insert samples spread from 5 seconds ago to now.
	for i := range 10 {
		ts := now.Add(time.Duration(i-5) * time.Second).UnixNano()
		_ = h.Record(tagstore.TagUpdate{
			Path:  "noise",
			State: tagstore.TagState{Value: i, TS: ts},
		})
	}

	if err := h.trim(); err != nil {
		t.Fatalf("trim: %v", err)
	}

	// Only samples from (now - 1s) onward should survive: i=4 and i=5..9 → 6 samples (≥ -1s threshold).
	samples, err := h.Query(context.Background(), "noise", 0, now.Add(time.Second).UnixNano(), 0)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(samples) == 0 || len(samples) > 6 {
		t.Errorf("after trim: got %d want 1-6 samples within retention window", len(samples))
	}
}

func TestQueryUnknownPath(t *testing.T) {
	h := newTestHistorian(t)
	got, err := h.Query(context.Background(), "missing", 0, time.Now().UnixNano(), 0)
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0, got %d", len(got))
	}
}

func TestQueryAggregated(t *testing.T) {
	h := newTestHistorian(t)
	// Base time aligned to a 10s boundary to make bucket math predictable.
	base := (time.Now().UnixNano() / int64(10*time.Second)) * int64(10*time.Second)

	// Insert 20 samples spread over 20 seconds (1 per second).
	for i := range 20 {
		_ = h.Record(tagstore.TagUpdate{
			Path:  "temp",
			State: tagstore.TagState{Value: float64(i), TS: base + int64(i)*int64(time.Second)},
		})
	}

	aggs, err := h.QueryAggregated(context.Background(), "temp", base, base+int64(20*time.Second), 10*time.Second, 0)
	if err != nil {
		t.Fatalf("QueryAggregated: %v", err)
	}
	if len(aggs) != 2 {
		t.Fatalf("expected 2 buckets, got %d", len(aggs))
	}
	// Bucket 0: values 0–9; bucket 1: values 10–19.
	if aggs[0].Min == nil || *aggs[0].Min != 0 {
		t.Errorf("bucket 0 min: %v", aggs[0].Min)
	}
	if aggs[1].Max == nil || *aggs[1].Max != 19 {
		t.Errorf("bucket 1 max: %v", aggs[1].Max)
	}
	if aggs[0].Count != 10 {
		t.Errorf("bucket 0 count: got %d want 10", aggs[0].Count)
	}
}

func TestQueryMulti(t *testing.T) {
	h := newTestHistorian(t)
	now := time.Now().UnixNano()

	paths := []string{"a", "b", "c"}
	for _, p := range paths {
		for i := range 3 {
			_ = h.Record(tagstore.TagUpdate{
				Path:  p,
				State: tagstore.TagState{Value: i, TS: now + int64(i)*1_000_000},
			})
		}
	}

	result, err := h.QueryMulti(context.Background(), paths, 0, now+1_000_000_000, 0)
	if err != nil {
		t.Fatalf("QueryMulti: %v", err)
	}
	for _, p := range paths {
		if len(result[p]) != 3 {
			t.Errorf("path %s: got %d samples want 3", p, len(result[p]))
		}
	}

	// Unknown path should return empty slice, not missing key.
	result2, err := h.QueryMulti(context.Background(), []string{"missing"}, 0, now+1_000_000_000, 0)
	if err != nil {
		t.Fatalf("QueryMulti missing: %v", err)
	}
	if result2["missing"] == nil {
		t.Error("expected empty slice for missing path, got nil")
	}
}
