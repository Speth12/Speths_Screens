package rest

import (
	"errors"
	"fmt"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/drivers"
)

// errUnreadable marks a reply the driver could not parse.
var errUnreadable = errors.New("unreadable reply")

// reasonFor turns a failure into a short reason for operators, without the
// request URL or the Go error chain, e.g. "no answer from 10.0.0.210
// (timed out)". The full error stays available to the caller.
func (d *Driver) reasonFor(err error) string {
	var se *statusError
	switch {
	case errors.As(err, &se):
		return fmt.Sprintf("%s answered HTTP %d", d.host, se.code)
	case errors.Is(err, errUnreadable):
		return fmt.Sprintf("unreadable reply from %s", d.host)
	}
	if r, ok := drivers.NetReason(d.host, err); ok {
		return r
	}
	// The driver's own messages (login, configuration) are already short.
	return strings.TrimPrefix(err.Error(), "rest: ")
}
