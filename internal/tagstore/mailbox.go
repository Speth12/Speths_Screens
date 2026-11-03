package tagstore

import (
	"slices"
	"sync"
)

// Mailbox holds the newest pending state per path. Put never blocks and
// memory is bounded by the number of distinct paths: a reader that falls
// behind skips intermediate values but always gets the newest one for every
// path.
//
// Reader loop:
//
//	for range mb.C() {
//		for _, u := range mb.Drain() { ... }
//	}
type Mailbox struct {
	mu      sync.Mutex
	pending map[string]TagState
	order   []string // paths with a pending value, oldest first

	// signal has room for one wake-up; a full signal means one is pending.
	signal chan struct{}
}

// NewMailbox returns an empty mailbox.
func NewMailbox() *Mailbox {
	return &Mailbox{
		pending: map[string]TagState{},
		signal:  make(chan struct{}, 1),
	}
}

// Put stores u as the newest pending value for its path and wakes the reader.
func (m *Mailbox) Put(u TagUpdate) {
	m.mu.Lock()
	if _, ok := m.pending[u.Path]; !ok {
		m.order = append(m.order, u.Path)
	}
	m.pending[u.Path] = u.State
	m.mu.Unlock()
	select {
	case m.signal <- struct{}{}:
	default: // a wake-up is already pending
	}
}

// C receives a value when the mailbox may have pending updates. Receive from
// it before calling Drain, so a Put that races with Drain wakes you again.
func (m *Mailbox) C() <-chan struct{} { return m.signal }

// Drain returns the pending updates, oldest-changed path first, and empties
// the mailbox. It returns nil when nothing is pending.
func (m *Mailbox) Drain() []TagUpdate {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.order) == 0 {
		return nil
	}
	out := make([]TagUpdate, len(m.order))
	for i, p := range m.order {
		out[i] = TagUpdate{Path: p, State: m.pending[p]}
	}
	m.order = m.order[:0]
	clear(m.pending)
	return out
}

// Delete drops any pending value for path.
func (m *Mailbox) Delete(path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.pending[path]; !ok {
		return
	}
	delete(m.pending, path)
	m.order = slices.DeleteFunc(m.order, func(p string) bool { return p == path })
}

// Len returns the number of paths with a pending value.
func (m *Mailbox) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.order)
}
