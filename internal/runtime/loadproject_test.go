package runtime

import (
	"context"
	goruntime "runtime"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// fakeDriver records how the runtime drives it.
type fakeDriver struct {
	mu          sync.Mutex
	connects    int
	disconnects int
	sets        [][]string
	out         chan<- tagstore.TagUpdate
}

func (f *fakeDriver) ID() string { return "fake" }
func (f *fakeDriver) Connect(_ context.Context, _ drivers.DriverConfig, out chan<- tagstore.TagUpdate) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.connects++
	f.out = out
	return nil
}
func (f *fakeDriver) Disconnect() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.disconnects++
	return nil
}
func (f *fakeDriver) Browse(context.Context) ([]drivers.TagDefinition, error) { return nil, nil }
func (f *fakeDriver) SetTags(paths []string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sets = append(f.sets, drivers.NormalizePaths(paths))
	return nil
}
func (f *fakeDriver) Write(context.Context, string, any) error { return nil }
func (f *fakeDriver) Status() drivers.DriverStatus             { return drivers.DriverStatus{} }

func (f *fakeDriver) lastSet() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.sets) == 0 {
		return nil
	}
	return f.sets[len(f.sets)-1]
}

func (f *fakeDriver) counts() (connects, disconnects int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.connects, f.disconnects
}

// newTestRuntime starts a runtime whose drivers are fakes. built records
// every driver the runtime creates, in order.
func newTestRuntime(t *testing.T) (r *Runtime, built func() []*fakeDriver) {
	t.Helper()
	var mu sync.Mutex
	var all []*fakeDriver
	r = New(nil, nil)
	r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) {
		mu.Lock()
		defer mu.Unlock()
		f := &fakeDriver{}
		all = append(all, f)
		return f, nil
	}
	r.Start(context.Background())
	t.Cleanup(r.Stop)
	return r, func() []*fakeDriver {
		mu.Lock()
		defer mu.Unlock()
		return slices.Clone(all)
	}
}

// testProject returns a project with the given datasources and one widget
// per tag, bound to "plc:<tag>". It has no namespace list, so LoadProject
// auto-adds a namespace node per binding and never removes them; removed
// bindings must still stop being polled.
func testProject(t *testing.T, datasources []string, tags ...string) *project.Project {
	t.Helper()
	p := &project.Project{Version: "0.1.0"}
	for _, id := range datasources {
		p.Datasources = append(p.Datasources, project.Datasource{ID: id, Label: id, Type: project.REST})
	}
	page := project.Page{ID: "p1", Name: "Main"}
	for i, tag := range tags {
		b := "plc:" + tag
		page.Widgets = append(page.Widgets, project.Widget{
			ID: tag, Type: project.NumericDisplay, X: int64(i), W: 1, H: 1, Binding: &b,
		})
	}
	p.Pages = []project.Page{page}
	return p
}

func load(t *testing.T, r *Runtime, p *project.Project) {
	t.Helper()
	if err := r.LoadProject(context.Background(), p); err != nil {
		t.Fatalf("LoadProject: %v", err)
	}
}

func TestLoadProjectRepeatedly(t *testing.T) {
	tests := []struct {
		name  string
		loads int
	}{
		{"one load", 1},
		{"five loads", 5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, built := newTestRuntime(t)
			p := testProject(t, []string{"plc"}, "A", "B")

			load(t, r, p)
			time.Sleep(20 * time.Millisecond)
			before := goruntime.NumGoroutine()
			for i := 1; i < tc.loads; i++ {
				load(t, r, p)
			}
			time.Sleep(20 * time.Millisecond)
			if after := goruntime.NumGoroutine(); after > before {
				t.Errorf("goroutines grew from %d to %d over %d loads", before, after, tc.loads)
			}

			drvs := built()
			if len(drvs) != 1 {
				t.Fatalf("built %d drivers, want 1", len(drvs))
			}
			if c, _ := drvs[0].counts(); c != 1 {
				t.Errorf("Connect called %d times, want 1", c)
			}
			if got := drvs[0].lastSet(); !slices.Equal(got, []string{"A", "B"}) {
				t.Errorf("tag set = %v, want [A B]", got)
			}
		})
	}
}

func TestLoadProjectChanges(t *testing.T) {
	tests := []struct {
		name      string
		second    *project.Project
		wantSet   []string
		wantDisc  int
		wantFanIn int
	}{
		{
			name:      "binding added",
			second:    testProject(t, []string{"plc"}, "A", "B", "C"),
			wantSet:   []string{"A", "B", "C"},
			wantFanIn: 1,
		},
		{
			name:      "binding removed",
			second:    testProject(t, []string{"plc"}, "B"),
			wantSet:   []string{"B"},
			wantFanIn: 1,
		},
		{
			name:      "all bindings removed",
			second:    testProject(t, []string{"plc"}),
			wantSet:   []string{},
			wantFanIn: 1,
		},
		{
			name:      "datasource removed",
			second:    testProject(t, nil),
			wantSet:   []string{"A", "B"}, // last set before removal
			wantDisc:  1,
			wantFanIn: 0,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r, built := newTestRuntime(t)
			load(t, r, testProject(t, []string{"plc"}, "A", "B"))
			load(t, r, tc.second)

			drv := built()[0]
			if got := drv.lastSet(); !slices.Equal(got, tc.wantSet) {
				t.Errorf("tag set = %v, want %v", got, tc.wantSet)
			}
			if _, d := drv.counts(); d != tc.wantDisc {
				t.Errorf("Disconnect called %d times, want %d", d, tc.wantDisc)
			}
			r.mu.RLock()
			fanIns := len(r.fanStop)
			r.mu.RUnlock()
			if fanIns != tc.wantFanIn {
				t.Errorf("%d fan-ins running, want %d", fanIns, tc.wantFanIn)
			}
		})
	}
}

// A subscribed ns: binding starts polling once its namespace node is bound
// to a driver, without dropping the driver's other tags.
func TestNamespaceBindingResolvesWhenNodeIsAdded(t *testing.T) {
	r, built := newTestRuntime(t)
	load(t, r, testProject(t, []string{"plc"}, "A", "B"))
	r.AddDemand("ws:1", "ns:plant.extra")
	if got := built()[0].lastSet(); !slices.Equal(got, []string{"A", "B"}) {
		t.Fatalf("before the node exists: tag set = %v, want [A B]", got)
	}

	if _, err := r.Namespace.PublishDriverTag("plant.extra", "plc", "X", ""); err != nil {
		t.Fatal(err)
	}
	r.RebuildNSAliases()

	if got := built()[0].lastSet(); !slices.Equal(got, []string{"A", "B", "X"}) {
		t.Errorf("tag set = %v, want [A B X]", got)
	}
}

func TestDriverValuesReachTheStore(t *testing.T) {
	r, built := newTestRuntime(t)
	load(t, r, testProject(t, []string{"plc"}, "A"))
	load(t, r, testProject(t, []string{"plc"}, "A")) // redeploy keeps the same channel working

	drv := built()[0]
	drv.mu.Lock()
	out := drv.out
	drv.mu.Unlock()
	out <- tagstore.TagUpdate{Path: "A", State: tagstore.TagState{Value: 42.0, Quality: "Good"}}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if st, ok := r.Store.Get("plc:A"); ok {
			if st.Value != 42.0 {
				t.Errorf("plc:A = %v, want 42", st.Value)
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("plc:A never reached the tag store")
}
