// Package sim is the simulated driver: made-up values for a project whose simulation setting is on,
// for demonstrations and training with no PLC. The runtime puts it in place of every PLC datasource
// (REST, OPC UA, Modbus, MQTT) only when it was started with --allow-simulation, so a production
// runtime never shows made-up values. Nothing reaches the network.
//
// Each tag moves on its own slow wave between 0 and 100, the same wave the IDE's demo values draw
// (packages/ide/src/store/dummyData.ts), so a screen looks the same in the editor and on a demo. A
// written value is kept and reported from then on, so writes confirm and buttons and setpoints work.
package sim

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Type is the driver type the runtime builds in place of a PLC datasource while simulating.
const Type = "simulated"

// Every how often the tags are reported.
var tick = 500 * time.Millisecond

func init() {
	drivers.Register(Type, func(drivers.BuildCtx) drivers.ProtocolDriver { return New() })
}

type Driver struct {
	mu      sync.Mutex
	tags    []string
	written map[string]any
	out     chan<- tagstore.TagUpdate
	stop    chan struct{}
	done    chan struct{}
	now     func() time.Time
}

func New() *Driver { return &Driver{written: map[string]any{}, now: time.Now} }

func (d *Driver) ID() string { return Type }

// hash is the FNV-1a hash the IDE's demo values use, as a fraction from 0 to 1.
func hash(path string) float64 {
	h := uint32(2166136261)
	for _, c := range []byte(path) {
		h = (h ^ uint32(c)) * 16777619
	}
	return float64(h) / 4294967295
}

// Value is the made-up value of a tag at a moment: a wave between 5 and 95, its own period (12 to
// 30 s) and phase from the path, rounded to two decimals.
func Value(path string, at time.Time) float64 {
	h := hash(path)
	period := 12000 + h*18000
	ms := float64(at.UnixMilli())
	v := 50 + 45*math.Sin(ms/period*2*math.Pi+h*2*math.Pi)
	return math.Round(v*100) / 100
}

func (d *Driver) Connect(_ context.Context, _ drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	d.mu.Lock()
	d.out = out
	d.stop = make(chan struct{})
	d.done = make(chan struct{})
	stop, done := d.stop, d.done
	d.mu.Unlock()
	go func() {
		defer close(done)
		t := time.NewTicker(tick)
		defer t.Stop()
		for {
			d.report()
			select {
			case <-stop:
				return
			case <-t.C:
			}
		}
	}()
	return nil
}

func (d *Driver) report() {
	d.mu.Lock()
	now := d.now()
	ups := make([]tagstore.TagUpdate, 0, len(d.tags))
	for _, p := range d.tags {
		var v any = Value(p, now)
		if w, ok := d.written[p]; ok {
			v = w
		}
		ups = append(ups, tagstore.TagUpdate{Path: p, State: tagstore.TagState{Value: v, Quality: "Good", TS: now.UnixNano()}})
	}
	out := d.out
	d.mu.Unlock()
	for _, u := range ups {
		out <- u
	}
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	stop, done := d.stop, d.done
	d.stop = nil
	d.mu.Unlock()
	if stop != nil {
		close(stop)
		<-done
	}
	return nil
}

// Browse lists the tags being reported; a simulation has no controller to ask.
func (d *Driver) Browse(context.Context) ([]drivers.TagDefinition, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := make([]drivers.TagDefinition, 0, len(d.tags))
	for _, p := range d.tags {
		out = append(out, drivers.TagDefinition{Path: p, DataType: "simulated", Writable: true})
	}
	return out, nil
}

func (d *Driver) SetTags(paths []string) error {
	d.mu.Lock()
	d.tags = append([]string(nil), paths...)
	d.mu.Unlock()
	return nil
}

// Write keeps the value, and it is reported from then on.
func (d *Driver) Write(_ context.Context, path string, value any) error {
	d.mu.Lock()
	d.written[path] = value
	d.mu.Unlock()
	d.report()
	return nil
}

func (d *Driver) Status() drivers.DriverStatus {
	d.mu.Lock()
	defer d.mu.Unlock()
	return drivers.DriverStatus{Connected: true, TagCount: len(d.tags)}
}
