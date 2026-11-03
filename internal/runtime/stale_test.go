package runtime

import (
	"context"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

func TestStaleLoopMarksPolledDatasourcesOnly(t *testing.T) {
	r := New(nil, nil)
	r.staleAfter = 100 * time.Millisecond
	r.staleEvery = 20 * time.Millisecond
	r.newDriver = func(project.DatasourceType) (drivers.ProtocolDriver, error) { return &fakeDriver{}, nil }
	r.Start(context.Background())
	t.Cleanup(r.Stop)

	p := &project.Project{Version: "0.1.0", Datasources: []project.Datasource{
		{ID: "rest1", Label: "rest1", Type: project.REST},
		{ID: "ua", Label: "ua", Type: project.Opcua},
		{ID: "mb", Label: "mb", Type: project.Mbtcp},
		{ID: "broker", Label: "broker", Type: project.Mqtt},
		{ID: "calc", Label: "calc", Type: project.DatasourceTypeVirtual},
	}}
	load(t, r, p)

	tests := []struct {
		path      string
		wantStale bool
	}{
		{"rest1:Arp.Plc.Eclr/A", true},
		{"ua:ns=6;s=A", true},
		{"mb:40001", true},
		{"broker:plant/a", false},
		{"calc:total", false},
		{"unknown:x", false},
	}
	for _, tc := range tests {
		r.Store.Update(tc.path, tagstore.TagState{Value: 1.0, Quality: "Good"})
	}
	time.Sleep(300 * time.Millisecond)
	for _, tc := range tests {
		got, _ := r.Store.Get(tc.path)
		if stale := got.Quality == "Uncertain"; stale != tc.wantStale {
			t.Errorf("%s: quality %q, want stale=%v", tc.path, got.Quality, tc.wantStale)
		}
	}

	// A fresh update brings a stale tag back to Good.
	r.Store.Update("rest1:Arp.Plc.Eclr/A", tagstore.TagState{Value: 2.0, Quality: "Good"})
	if got, _ := r.Store.Get("rest1:Arp.Plc.Eclr/A"); got.Quality != "Good" {
		t.Errorf("after a fresh update: %+v", got)
	}
}
