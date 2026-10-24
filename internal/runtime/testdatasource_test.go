package runtime

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// slowDriver connects in the background: after delay its status becomes
// final (online, or offline with lastErr).
type slowDriver struct {
	fakeDriver
	delay   time.Duration
	lastErr string
	start   time.Time
	stopped atomic.Bool
}

func (s *slowDriver) Connect(ctx context.Context, cfg drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	s.start = time.Now()
	return s.fakeDriver.Connect(ctx, cfg, out)
}

func (s *slowDriver) Disconnect() error {
	s.stopped.Store(true)
	return s.fakeDriver.Disconnect()
}

func (s *slowDriver) Status() drivers.DriverStatus {
	if time.Since(s.start) < s.delay {
		return drivers.DriverStatus{}
	}
	return drivers.DriverStatus{Connected: s.lastErr == "", LastError: s.lastErr}
}

func TestTestDatasourceWaitsForTheDriver(t *testing.T) {
	old := testDatasourceWait
	testDatasourceWait = 2 * time.Second
	t.Cleanup(func() { testDatasourceWait = old })

	tests := []struct {
		name          string
		delay         time.Duration
		lastErr       string
		wantConnected bool
		wantErr       string
	}{
		// Both settle later than the old fixed 500 ms wait.
		{"comes online", 800 * time.Millisecond, "", true, ""},
		{"reports an error", 800 * time.Millisecond, "no answer from 10.0.0.210 (timed out)", false, "no answer from 10.0.0.210 (timed out)"},
		{"never settles", time.Hour, "", false, "no answer within 2s"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := New(nil, nil)
			drv := &slowDriver{delay: tc.delay, lastErr: tc.lastErr}
			r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) { return drv, nil }
			st := r.TestDatasource(context.Background(), project.Datasource{ID: "plc", Type: "rest"})
			if st.Connected != tc.wantConnected || st.LastError != tc.wantErr {
				t.Errorf("status = %+v, want connected=%v lastError=%q", st, tc.wantConnected, tc.wantErr)
			}
			if !drv.stopped.Load() {
				t.Error("temporary driver was not disconnected")
			}
		})
	}
}
