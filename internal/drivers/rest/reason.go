package rest

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// errUnreadable marks a reply the driver could not parse.
var errUnreadable = errors.New("unreadable reply")

// reasonFor turns a failure into a short reason for operators, without the
// request URL or the Go error chain, e.g. "no answer from 10.0.0.210
// (timed out)". The full error stays available to the caller.
func (d *Driver) reasonFor(err error) string {
	host := d.host
	var se *statusError
	var ue *url.Error
	switch {
	case errors.As(err, &se):
		return fmt.Sprintf("%s answered HTTP %d", host, se.code)
	case errors.Is(err, errUnreadable):
		return fmt.Sprintf("unreadable reply from %s", host)
	case errors.As(err, &ue) && ue.Timeout():
		return fmt.Sprintf("no answer from %s (timed out)", host)
	case errors.As(err, &ue):
		inner := innermost(ue.Err)
		if strings.Contains(strings.ToLower(inner), "refused") {
			return fmt.Sprintf("%s refused the connection", host)
		}
		return fmt.Sprintf("cannot reach %s: %s", host, inner)
	}
	// The driver's own messages (login, configuration) are already short.
	return strings.TrimPrefix(err.Error(), "rest: ")
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
