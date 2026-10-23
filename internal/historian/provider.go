package historian

import (
	"context"
	"fmt"
	"time"
)

// Provider is the abstract interface for historian backends.
// Implement this to add SQLite, PostgreSQL, TimescaleDB, InfluxDB, etc.
type Provider interface {
	// Write persists one sample. ts is unix nanoseconds.
	Write(ctx context.Context, path string, ts int64, value any, quality string) error

	// Query returns raw samples for path in [from, to] (unix nano), newest-first, capped at limit.
	Query(ctx context.Context, path string, from, to int64, limit int) ([]Sample, error)

	// QueryAggregated buckets samples into bucketDur intervals and returns
	// min/avg/max per bucket.
	QueryAggregated(ctx context.Context, path string, from, to int64, bucketDur time.Duration, limit int) ([]AggSample, error)

	// QueryMulti returns raw samples for multiple paths merged and sorted by ts.
	QueryMulti(ctx context.Context, paths []string, from, to int64, limit int) (map[string][]Sample, error)

	// QueryMultiAggregated returns aggregated samples for multiple paths.
	QueryMultiAggregated(ctx context.Context, paths []string, from, to int64, bucketDur time.Duration, limit int) (map[string][]AggSample, error)

	// RecordWrite stores an explicit operator write event (separate from polling).
	RecordWrite(path string, value any) error

	// DeleteBefore removes samples older than cutoff (unix nano).
	DeleteBefore(ctx context.Context, cutoff int64) error

	// Close releases any resources held by the provider.
	Close() error
}

// ProviderFactory constructs a Provider from a DSN string.
// Register new providers with RegisterProvider.
type ProviderFactory func(dsn string) (Provider, error)

var registry = map[string]ProviderFactory{}

// RegisterProvider registers a named provider factory (e.g. "sqlite", "postgres").
func RegisterProvider(name string, factory ProviderFactory) {
	registry[name] = factory
}

// OpenProvider constructs a provider by name + DSN.
func OpenProvider(name, dsn string) (Provider, error) {
	f, ok := registry[name]
	if !ok {
		// fall back to SQLite for backwards-compat
		f = registry["sqlite"]
	}
	if f == nil {
		return nil, fmt.Errorf("historian: unknown provider %q", name)
	}
	return f(dsn)
}
