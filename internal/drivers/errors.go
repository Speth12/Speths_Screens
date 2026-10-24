package drivers

import "errors"

// Kinds of write failure. Drivers mark their errors with Mark so the write
// pipeline can answer with the right status; test with errors.Is.
var (
	// ErrBadValue: the value cannot be written to this tag (wrong type, not
	// a whole number, out of the type's range). The caller can fix it.
	ErrBadValue = errors.New("bad value")
	// ErrNotConnected: the driver cannot reach the device right now.
	ErrNotConnected = errors.New("not connected")
	// ErrUnknownTag: the device does not have this tag.
	ErrUnknownTag = errors.New("unknown tag")
	// ErrRejected: the device received the write and refused it.
	ErrRejected = errors.New("rejected by the device")
)

// Mark returns err marked as kind; errors.Is(result, kind) reports true and
// the message stays err's own.
func Mark(err error, kind error) error {
	if err == nil {
		return nil
	}
	return &marked{err: err, kind: kind}
}

type marked struct{ err, kind error }

func (m *marked) Error() string   { return m.err.Error() }
func (m *marked) Unwrap() []error { return []error{m.err, m.kind} }
