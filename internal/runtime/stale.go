package runtime

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// polledTypes are the datasource types that read their tags on a timer, so
// a tag that stops updating is a fault. MQTT and calculated tags only send
// when something changes, so silence is normal for them.
var polledTypes = map[project.DatasourceType]bool{
	project.REST:  true,
	project.Opcua: true,
	project.Mbtcp: true,
}

// markStaleLoop marks tags from polled datasources Uncertain when they get no
// update for staleAfter. It runs until the runtime stops.
func (r *Runtime) markStaleLoop(ctx context.Context) {
	defer r.wg.Done()
	tick := time.NewTicker(r.staleEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			polled := r.polledPrefixes()
			if len(polled) == 0 {
				continue
			}
			// The callback runs with the store locked; it only reads the
			// snapshot above and takes no locks.
			n := r.Store.MarkStale(r.staleAfter, func(path string) bool {
				i := strings.IndexByte(path, ':')
				return i > 0 && polled[path[:i]]
			})
			if n > 0 {
				log.Printf("[RUNTIME] %d tags had no update for %v; marked Uncertain", n, r.staleAfter)
			}
		}
	}
}

// polledPrefixes returns the ids of the project's polled datasources.
func (r *Runtime) polledPrefixes() map[string]bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.project == nil {
		return nil
	}
	out := map[string]bool{}
	for _, ds := range r.project.Datasources {
		if polledTypes[ds.Type] {
			out[ds.ID] = true
		}
	}
	return out
}
