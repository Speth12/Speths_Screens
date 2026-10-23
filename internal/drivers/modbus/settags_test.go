package modbus

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mb "github.com/simonvetter/modbus"
)

const testPoll = 20 * time.Millisecond

// fakeSlave answers holding-register reads with the register's own address
// and counts reads per address.
type fakeSlave struct {
	mu    sync.Mutex
	reads map[uint16]int
}

func (f *fakeSlave) HandleCoils(*mb.CoilsRequest) ([]bool, error) { return nil, mb.ErrIllegalFunction }
func (f *fakeSlave) HandleDiscreteInputs(*mb.DiscreteInputsRequest) ([]bool, error) {
	return nil, mb.ErrIllegalFunction
}
func (f *fakeSlave) HandleInputRegisters(*mb.InputRegistersRequest) ([]uint16, error) {
	return nil, mb.ErrIllegalFunction
}
func (f *fakeSlave) HandleHoldingRegisters(req *mb.HoldingRegistersRequest) ([]uint16, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]uint16, req.Quantity)
	for i := range out {
		out[i] = req.Addr + uint16(i)
	}
	f.reads[req.Addr]++
	return out, nil
}

// take returns read counts since the last call and clears them.
func (f *fakeSlave) take() map[uint16]int {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := f.reads
	f.reads = map[uint16]int{}
	return r
}

func (f *fakeSlave) window(n int) map[uint16]int {
	f.take()
	time.Sleep(time.Duration(n) * testPoll)
	return f.take()
}

func freeAddr(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	_ = l.Close()
	return addr
}

func startSlave(t *testing.T) (*fakeSlave, string) {
	t.Helper()
	f := &fakeSlave{reads: map[uint16]int{}}
	addr := freeAddr(t)
	srv, err := mb.NewServer(&mb.ServerConfiguration{URL: "tcp://" + addr, Timeout: 5 * time.Second, MaxClients: 4}, f)
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = srv.Stop() })
	return f, addr
}

func connectSlave(t *testing.T, addr string) *Driver {
	t.Helper()
	d := New()
	d.pollEvery = testPoll
	if err := d.Connect(context.Background(), drivers.DriverConfig{Endpoint: addr}); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = d.Disconnect() })
	return d
}

func drain(ch chan tagstore.TagUpdate) {
	go func() {
		for range ch {
		}
	}()
}

func TestRepeatedSubscribeDoesNotMultiplyPolling(t *testing.T) {
	tests := []struct {
		name  string
		calls int
	}{
		{"one deploy", 1},
		{"five deploys", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f, addr := startSlave(t)
			d := connectSlave(t, addr)
			for i := 0; i < tc.calls; i++ {
				ch := make(chan tagstore.TagUpdate, 64)
				drain(ch)
				if err := d.Subscribe(context.Background(), []string{"holding:1"}, ch); err != nil {
					t.Fatalf("Subscribe: %v", err)
				}
			}
			const ticks = 10
			got := f.window(ticks)[1]
			if got == 0 || got > ticks*3/2+2 {
				t.Errorf("register 1 read %d times in %d ticks, want about %d", got, ticks, ticks)
			}
		})
	}
}

func TestSetTagsReplacesPollSet(t *testing.T) {
	tests := []struct {
		name   string
		first  []string
		second []string
		want   []uint16
	}{
		{"add", []string{"holding:1"}, []string{"holding:1", "holding:2"}, []uint16{1, 2}},
		{"remove", []string{"holding:1", "holding:2"}, []string{"holding:2"}, []uint16{2}},
		{"replace", []string{"holding:1"}, []string{"holding:3"}, []uint16{3}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f, addr := startSlave(t)
			d := connectSlave(t, addr)
			ch := make(chan tagstore.TagUpdate, 64)
			drain(ch)
			if err := d.Subscribe(context.Background(), tc.first, ch); err != nil {
				t.Fatalf("Subscribe: %v", err)
			}
			if err := d.SetTags(tc.second); err != nil {
				t.Fatalf("SetTags: %v", err)
			}
			time.Sleep(2 * testPoll)
			reads := f.window(10)
			for a := range reads {
				found := false
				for _, w := range tc.want {
					found = found || a == w
				}
				if !found {
					t.Errorf("read register %d, not in the new set", a)
				}
			}
			for _, w := range tc.want {
				if reads[w] == 0 {
					t.Errorf("never read register %d", w)
				}
			}
		})
	}
}

// A tag that does not parse used to shift every later tag onto the wrong path.
func TestBadTagDoesNotShiftPaths(t *testing.T) {
	_, addr := startSlave(t)
	d := connectSlave(t, addr)
	ch := make(chan tagstore.TagUpdate, 64)
	if err := d.Subscribe(context.Background(), []string{"holding:5", "bogus", "holding:7"}, ch); err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	want := map[string]uint16{"holding:5": 5, "holding:7": 7}
	got := map[string]any{}
	deadline := time.After(2 * time.Second)
	for len(got) < len(want) {
		select {
		case u := <-ch:
			if _, ok := want[u.Path]; !ok {
				t.Fatalf("update for unexpected path %q", u.Path)
			}
			got[u.Path] = u.State.Value
		case <-deadline:
			t.Fatalf("timed out; got %v", got)
		}
	}
	for p, v := range want {
		if got[p] != v {
			t.Errorf("%s = %v, want %d", p, got[p], v)
		}
	}
	if d.Status().TagCount != 2 {
		t.Errorf("TagCount = %d, want 2", d.Status().TagCount)
	}
}

func TestEmptySetAndDisconnectStopPolling(t *testing.T) {
	tests := []struct {
		name string
		stop func(d *Driver)
	}{
		{"empty tag set", func(d *Driver) { _ = d.SetTags(nil) }},
		{"disconnect", func(d *Driver) { _ = d.Disconnect() }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f, addr := startSlave(t)
			d := connectSlave(t, addr)
			ch := make(chan tagstore.TagUpdate, 64)
			drain(ch)
			if err := d.Subscribe(context.Background(), []string{"holding:1"}, ch); err != nil {
				t.Fatalf("Subscribe: %v", err)
			}
			if len(f.window(5)) == 0 {
				t.Fatal("not polling before stop")
			}
			tc.stop(d)
			time.Sleep(2 * testPoll)
			if got := f.window(10); len(got) != 0 {
				t.Errorf("reads after stop: %v", got)
			}
		})
	}
}
