package historian_test

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/speths-screens/internal/historian"
	_ "github.com/Speth12/speths-screens/internal/historian/providers/memory"
	_ "github.com/Speth12/speths-screens/internal/historian/providers/sqlite"
)

func TestProviderRegistry(t *testing.T) {
	for _, name := range []string{"sqlite", "memory"} {
		p, err := historian.OpenProvider(name, ":memory:")
		if err != nil {
			t.Fatalf("%s: OpenProvider: %v", name, err)
		}
		defer p.Close()

		ctx := context.Background()
		now := time.Now().UnixNano()

		if err := p.Write(ctx, "test.tag", now, 42.0, "Good"); err != nil {
			t.Fatalf("%s: Write: %v", name, err)
		}

		to := time.Now().Add(time.Second).UnixNano()
		samples, err := p.Query(ctx, "test.tag", 0, to, 10)
		if err != nil {
			t.Fatalf("%s: Query: %v", name, err)
		}
		if len(samples) != 1 {
			t.Errorf("%s: want 1 sample, got %d", name, len(samples))
		}
	}
}

func TestMemoryProviderAggregate(t *testing.T) {
	p, _ := historian.OpenProvider("memory", "")
	defer p.Close()

	ctx := context.Background()
	base := time.Now().Truncate(time.Minute).UnixNano()
	bucket := time.Minute.Nanoseconds()

	for i := range 10 {
		p.Write(ctx, "T", base+int64(i)*bucket/10, float64(i*10), "Good")
	}

	aggs, err := p.QueryAggregated(ctx, "T", 0, 0, time.Minute, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(aggs) == 0 {
		t.Error("expected aggregated results")
	}
}

func TestDeleteBefore(t *testing.T) {
	p, _ := historian.OpenProvider("memory", "")
	defer p.Close()

	ctx := context.Background()
	now := time.Now().UnixNano()
	p.Write(ctx, "T", now-int64(2*time.Hour), 1.0, "Good") // old
	p.Write(ctx, "T", now, 2.0, "Good")                    // current

	cutoff := now - int64(time.Hour)
	p.DeleteBefore(ctx, cutoff)

	samples, _ := p.Query(ctx, "T", 0, time.Now().Add(time.Hour).UnixNano(), 10)
	if len(samples) != 1 {
		t.Errorf("want 1 sample after delete, got %d", len(samples))
	}
}
