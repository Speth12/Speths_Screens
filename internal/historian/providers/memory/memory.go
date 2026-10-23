// Package memory provides an in-memory historian provider — no persistence,
// zero dependencies.  Suitable for unit tests and embedded scenarios.
package memory

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/Speth12/speths-screens/internal/historian"
)

func init() {
	historian.RegisterProvider("memory", func(_ string) (historian.Provider, error) {
		return New(), nil
	})
}

type row struct {
	ts      int64
	value   any
	quality string
}

// Provider is the in-memory historian backend.
type Provider struct {
	mu   sync.RWMutex
	data map[string][]row // path -> rows (unsorted until query)
}

// New returns a ready in-memory provider.
func New() *Provider {
	return &Provider{data: make(map[string][]row)}
}

func (p *Provider) Write(_ context.Context, path string, ts int64, value any, quality string) error {
	p.mu.Lock()
	p.data[path] = append(p.data[path], row{ts: ts, value: value, quality: quality})
	p.mu.Unlock()
	return nil
}

func (p *Provider) RecordWrite(path string, value any) error {
	return p.Write(context.Background(), path, time.Now().UnixNano(), value, "Write")
}

func (p *Provider) Query(_ context.Context, path string, from, to int64, limit int) ([]historian.Sample, error) {
	p.mu.RLock()
	rows := append([]row{}, p.data[path]...)
	p.mu.RUnlock()

	sort.Slice(rows, func(i, j int) bool { return rows[i].ts > rows[j].ts })
	var out []historian.Sample
	for _, r := range rows {
		if (from == 0 || r.ts >= from) && (to == 0 || r.ts <= to) {
			out = append(out, historian.Sample{TS: r.ts, Value: r.value, Quality: r.quality})
			if limit > 0 && len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

func (p *Provider) QueryAggregated(ctx context.Context, path string, from, to int64, bucketDur time.Duration, limit int) ([]historian.AggSample, error) {
	samples, err := p.Query(ctx, path, from, to, 0)
	if err != nil {
		return nil, err
	}
	return aggregateSamples(samples, from, to, bucketDur, limit), nil
}

func (p *Provider) QueryMulti(ctx context.Context, paths []string, from, to int64, limit int) (map[string][]historian.Sample, error) {
	out := make(map[string][]historian.Sample, len(paths))
	for _, path := range paths {
		s, err := p.Query(ctx, path, from, to, limit)
		if err != nil {
			return nil, err
		}
		out[path] = s
	}
	return out, nil
}

func (p *Provider) QueryMultiAggregated(ctx context.Context, paths []string, from, to int64, bucketDur time.Duration, limit int) (map[string][]historian.AggSample, error) {
	out := make(map[string][]historian.AggSample, len(paths))
	for _, path := range paths {
		a, err := p.QueryAggregated(ctx, path, from, to, bucketDur, limit)
		if err != nil {
			return nil, err
		}
		out[path] = a
	}
	return out, nil
}

func (p *Provider) DeleteBefore(_ context.Context, cutoff int64) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	for path, rows := range p.data {
		var kept []row
		for _, r := range rows {
			if r.ts >= cutoff {
				kept = append(kept, r)
			}
		}
		p.data[path] = kept
	}
	return nil
}

func (p *Provider) Close() error { return nil }

// aggregateSamples groups samples into fixed-width time buckets.
func aggregateSamples(samples []historian.Sample, from, to int64, bucketDur time.Duration, limit int) []historian.AggSample {
	if len(samples) == 0 || bucketDur <= 0 {
		return nil
	}
	bd := bucketDur.Nanoseconds()
	buckets := map[int64]*struct{ min, max, sum float64; count int }{}
	for _, s := range samples {
		v, ok := toFloat(s.Value)
		if !ok {
			continue
		}
		key := (s.TS / bd) * bd
		b := buckets[key]
		if b == nil {
			b = &struct{ min, max, sum float64; count int }{min: v, max: v}
			buckets[key] = b
		}
		if v < b.min {
			b.min = v
		}
		if v > b.max {
			b.max = v
		}
		b.sum += v
		b.count++
	}
	keys := make([]int64, 0, len(buckets))
	for k := range buckets {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] > keys[j] })
	var out []historian.AggSample
	for _, k := range keys {
		b := buckets[k]
		avg := b.sum / float64(b.count)
		out = append(out, historian.AggSample{TS: k, Min: &b.min, Avg: &avg, Max: &b.max, Count: b.count})
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case bool:
		if n {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}
