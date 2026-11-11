package runtime

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
)

// reconfigurableDriver is a fake driver that takes new settings while it runs.
type reconfigurableDriver struct {
	fakeDriver
	rmu    sync.Mutex
	cfgs   []drivers.DriverConfig
	refuse error
}

func (f *reconfigurableDriver) Reconfigure(cfg drivers.DriverConfig) error {
	f.rmu.Lock()
	defer f.rmu.Unlock()
	if f.refuse != nil {
		return f.refuse
	}
	f.cfgs = append(f.cfgs, cfg)
	return nil
}

func (f *reconfigurableDriver) reconfigures() int {
	f.rmu.Lock()
	defer f.rmu.Unlock()
	return len(f.cfgs)
}

func host(ds *project.Datasource, h string) { ds.Config.Host = &h }

func TestRedeployWithChangedDatasource(t *testing.T) {
	tests := []struct {
		name         string
		inPlace      bool
		refuse       error
		change       func(ds *project.Datasource)
		wantBuilt    int // drivers built over the two loads
		wantConnects int // connects of the first driver
		wantDisc     int // disconnects of the first driver
		wantReconf   int // Reconfigure calls on the first driver
	}{
		{"same settings: nothing happens", false, nil, func(*project.Datasource) {}, 1, 1, 0, 0},
		{"same settings, in place driver: nothing happens", true, nil, func(*project.Datasource) {}, 1, 1, 0, 0},
		{"changed settings: the driver is rebuilt", false, nil, func(ds *project.Datasource) { host(ds, "10.0.0.9") }, 2, 1, 1, 0},
		{"changed settings, in place driver: configured, not rebuilt", true, nil, func(ds *project.Datasource) { host(ds, "10.0.0.9") }, 1, 1, 0, 1},
		{"changed type: rebuilt even for an in place driver", true, nil, func(ds *project.Datasource) { ds.Type = project.Opcua }, 2, 1, 1, 0},
		{"refused change: the driver keeps running and the next load tries again", true, errors.New("no"), func(ds *project.Datasource) { host(ds, "10.0.0.9") }, 1, 1, 0, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := New(nil, nil)
			var mu sync.Mutex
			var built []drivers.ProtocolDriver
			r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) {
				mu.Lock()
				defer mu.Unlock()
				var d drivers.ProtocolDriver
				if tc.inPlace {
					d = &reconfigurableDriver{refuse: tc.refuse}
				} else {
					d = &fakeDriver{}
				}
				built = append(built, d)
				return d, nil
			}
			r.Start(context.Background())
			t.Cleanup(r.Stop)

			p := testProject(t, []string{"plc"}, "A")
			load(t, r, p)
			tc.change(&p.Datasources[0])
			load(t, r, p)

			mu.Lock()
			defer mu.Unlock()
			if len(built) != tc.wantBuilt {
				t.Fatalf("built %d drivers, want %d", len(built), tc.wantBuilt)
			}
			var connects, disc, reconf int
			switch d := built[0].(type) {
			case *reconfigurableDriver:
				connects, disc = d.counts()
				reconf = d.reconfigures()
			case *fakeDriver:
				connects, disc = d.counts()
			}
			if connects != tc.wantConnects || disc != tc.wantDisc || reconf != tc.wantReconf {
				t.Errorf("first driver: %d connects, %d disconnects, %d reconfigures; want %d, %d, %d",
					connects, disc, reconf, tc.wantConnects, tc.wantDisc, tc.wantReconf)
			}
			if got := r.Drivers()["plc"]; got != built[len(built)-1] {
				t.Errorf("the runtime holds a driver that is not the newest one built")
			}
		})
	}
}

func TestRedeployRefusedChangeIsTriedAgainOnTheNextLoad(t *testing.T) {
	r := New(nil, nil)
	d := &reconfigurableDriver{refuse: errors.New("no")}
	r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) { return d, nil }
	r.Start(context.Background())
	t.Cleanup(r.Stop)

	p := testProject(t, []string{"plc"}, "A")
	load(t, r, p)
	host(&p.Datasources[0], "10.0.0.9")
	load(t, r, p) // refused
	d.rmu.Lock()
	d.refuse = nil
	d.rmu.Unlock()
	load(t, r, p) // the same project again: the driver still differs from it, so it is configured now
	if n := d.reconfigures(); n != 1 {
		t.Errorf("%d reconfigures, want 1 after the driver stopped refusing", n)
	}
	load(t, r, p) // and now it matches
	if n := d.reconfigures(); n != 1 {
		t.Errorf("%d reconfigures after a load that changed nothing, want 1", n)
	}
}

func TestRedeployRemovedDatasourceIsStillDisconnected(t *testing.T) {
	r, built := newTestRuntime(t)
	load(t, r, testProject(t, []string{"plc", "other"}, "A"))
	load(t, r, testProject(t, []string{"plc"}, "A"))
	drvs := built()
	if len(drvs) != 2 {
		t.Fatalf("built %d drivers, want 2", len(drvs))
	}
	if _, disc := drvs[1].counts(); disc != 1 {
		t.Errorf("the removed datasource's driver was disconnected %d times, want 1", disc)
	}
	if _, disc := drvs[0].counts(); disc != 0 {
		t.Errorf("the kept datasource's driver was disconnected %d times, want 0", disc)
	}
}
