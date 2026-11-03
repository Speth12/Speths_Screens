package drivers

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net"
	"strings"
	"time"
)

// Backoff hands out retry waits: Min, then doubling up to Max, each spread
// by ±20% so many runtimes do not retry in step. The zero value with Min and
// Max set is ready to use; it is not safe for concurrent use.
type Backoff struct {
	Min, Max time.Duration
	cur      time.Duration
}

// Next returns the wait before the next retry and doubles the one after.
func (b *Backoff) Next() time.Duration {
	if b.cur == 0 {
		b.cur = b.Min
	}
	w := Jitter(b.cur)
	b.cur = min(2*b.cur, b.Max)
	return w
}

// Reset starts again from Min, after a success.
func (b *Backoff) Reset() { b.cur = 0 }

// Jitter spreads d by ±20%.
func Jitter(d time.Duration) time.Duration {
	return time.Duration(float64(d) * (0.8 + 0.4*rand.Float64()))
}

// SleepCtx waits for d or until ctx is done; it reports whether d passed.
func SleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

// NetReason turns a network failure into a short reason for operators,
// without addresses, URLs or the Go error chain, e.g. "no answer from
// 10.0.0.210 (timed out)". It reports false when err is not a network
// failure, so the driver can describe it itself.
func NetReason(host string, err error) (string, bool) {
	var ce *CertError
	if errors.As(err, &ce) {
		return ce.Error(), true // a refused certificate, wrapped by TLS or HTTP
	}
	var ne net.Error
	if !errors.As(err, &ne) {
		return "", false
	}
	if ne.Timeout() {
		return fmt.Sprintf("no answer from %s (timed out)", host), true
	}
	inner := innermost(err)
	if strings.Contains(strings.ToLower(inner), "refused") {
		return fmt.Sprintf("%s refused the connection", host), true
	}
	return fmt.Sprintf("cannot reach %s: %s", host, inner), true
}

// innermost returns the message of the deepest wrapped error, which drops
// prefixes such as "dial tcp 10.0.0.210:443:".
func innermost(err error) string {
	for {
		next := errors.Unwrap(err)
		if next == nil {
			return err.Error()
		}
		err = next
	}
}
