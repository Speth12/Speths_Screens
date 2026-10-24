// Package runtime is the central orchestrator: drivers → TagStore → Historian + WS broadcast.
package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarms"
	"github.com/Speth12/Speths_Screens/internal/alarmstore"
	"github.com/Speth12/Speths_Screens/internal/assets"
	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/drivers"
	_ "github.com/Speth12/Speths_Screens/internal/drivers/modbus"
	_ "github.com/Speth12/Speths_Screens/internal/drivers/mqtt"
	_ "github.com/Speth12/Speths_Screens/internal/drivers/opcua"
	_ "github.com/Speth12/Speths_Screens/internal/drivers/rest"
	_ "github.com/Speth12/Speths_Screens/internal/drivers/virtual"
	"github.com/Speth12/Speths_Screens/internal/eventbus"
	"github.com/Speth12/Speths_Screens/internal/faceplate"
	"github.com/Speth12/Speths_Screens/internal/historian"
	"github.com/Speth12/Speths_Screens/internal/namespace"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/recipestore"
	"github.com/Speth12/Speths_Screens/internal/security"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Runtime owns the TagStore, Historian, alarm Engine, and active driver instances.
type Runtime struct {
	Store      *tagstore.TagStore
	Historian  *historian.Historian
	Alarms     *alarms.Engine
	AlarmStore *alarmstore.AlarmStore
	Namespace  *namespace.Tree
	Events     *eventbus.Bus

	// Optional — nil in dev/test mode.
	Security   *security.Store
	Audit      *audit.Store
	Assets     *assets.Registry
	Faceplates *faceplate.Registry
	Recipes    *recipestore.Store

	mu        sync.RWMutex
	drivers   map[string]drivers.ProtocolDriver // datasource id → driver
	fanStop   map[string]context.CancelFunc     // datasource id → stops its fan-in
	nsAliases map[string][]string               // "driverId:driverAddr" → []nsPath

	// demand is the subscription manager (see demand.go).
	demand demand
	// newDriver builds a driver for a datasource type; tests replace it.
	newDriver func(typ project.DatasourceType) (drivers.ProtocolDriver, error)
	cancel    context.CancelFunc
	pumpCtx   context.Context
	pumpBox   *tagstore.Mailbox // fan-ins → pump; never blocks, newest value per tag
	wg        sync.WaitGroup
	project   *project.Project

	// Tags from polled datasources that get no update for staleAfter turn
	// Uncertain; checked every staleEvery (see stale.go). Tests shorten both.
	staleAfter time.Duration
	staleEvery time.Duration

	// writeConfirm is how long WriteTag waits for a written value to come
	// back (see write.go). Tests shorten it.
	writeConfirm time.Duration

	// InitialAdminFile is where the first admin's password is written when
	// a project asks for logins and there are no users yet; empty means no
	// first-run user is created.
	InitialAdminFile string
}

// New returns an initialised runtime with the given store and historian.
// Either may be nil for tests.
func New(store *tagstore.TagStore, h *historian.Historian) *Runtime {
	if store == nil {
		store = tagstore.New()
	}
	return &Runtime{
		Store:     store,
		Historian: h,
		Alarms:    alarms.New(),
		Namespace: namespace.New(),
		Events:    eventbus.New(),
		drivers:   make(map[string]drivers.ProtocolDriver),
		fanStop:   make(map[string]context.CancelFunc),
		demand:    demand{sources: map[string]map[string]struct{}{}},
		pumpBox:   tagstore.NewMailbox(),

		staleAfter: 10 * time.Second,
		staleEvery: time.Second,

		writeConfirm: 3 * time.Second,
	}
}

// Start begins the central pump goroutine. Call once.
func (r *Runtime) Start(ctx context.Context) {
	pumpCtx, cancel := context.WithCancel(ctx)
	r.cancel = cancel
	r.pumpCtx = pumpCtx
	r.wg.Add(1)
	go r.pump(pumpCtx)
	if r.AlarmStore != nil {
		// Subscribe here, not in the goroutine, so no change made right
		// after Start is missed.
		sub := r.Alarms.SubscribeN(alarmHistoryQueue)
		r.wg.Add(1)
		go r.persistAlarms(pumpCtx, sub)
	}
	r.wg.Add(1)
	go r.markStaleLoop(pumpCtx)
}

// Stop disconnects all drivers and stops the pump.
func (r *Runtime) Stop() {
	r.mu.Lock()
	for id, d := range r.drivers {
		_ = d.Disconnect()
		if stop := r.fanStop[id]; stop != nil {
			stop()
		}
		log.Printf("[RUNTIME] disconnected %s", id)
	}
	r.drivers = nil
	r.fanStop = nil
	r.mu.Unlock()
	if r.cancel != nil {
		r.cancel()
	}
	r.wg.Wait()
}

// LoadProject reconfigures drivers based on a project file.
// Existing drivers not in the new project are disconnected.
// Safe to call any number of times; Start must have been called first.
func (r *Runtime) LoadProject(ctx context.Context, p *project.Project) error {
	// Update alarm rules.
	rules := make([]alarms.Rule, 0, len(p.AlarmRules))
	for _, ar := range p.AlarmRules {
		rules = append(rules, alarms.Rule{
			ID:        ar.ID,
			Name:      ar.Name,
			Binding:   ar.Binding,
			Condition: alarms.Condition(ar.Condition),
			Threshold: ar.Threshold,
			Severity:  alarms.Severity(ar.Severity),
			Message:   ar.Message,
		})
	}
	r.Alarms.SetRules(rules)
	if r.Historian != nil {
		r.Historian.SetRules(historianRules(p))
	}

	// Load namespace from project JSON (replaces previous tree contents).
	// Round-trips through JSON so Tree.UnmarshalJSON keeps doing the replace.
	if len(p.Namespace) > 0 {
		raw, err := json.Marshal(p.Namespace)
		if err == nil {
			err = json.Unmarshal(raw, r.Namespace)
		}
		if err != nil {
			log.Printf("[RUNTIME] namespace unmarshal: %v", err)
		}
	}

	// Also auto-populate namespace from direct widget bindings (backward compat).
	for _, ds := range p.Datasources {
		prefix := ds.ID + ":"
		for _, pg := range p.Pages {
			for _, w := range pg.Widgets {
				b := w.View().ValueTag()
				if b == "" {
					continue
				}
				if strings.HasPrefix(b, prefix) {
					tagPath := b[len(prefix):]
					nsPath := ds.ID + "." + strings.ReplaceAll(tagPath, ":", ".")
					_, _ = r.Namespace.PublishDriverTag(nsPath, ds.ID, tagPath, "")
				}
			}
		}
	}

	// Build reverse alias map: "driverId:driverAddr" → []nsPath
	aliases := map[string][]string{}
	for _, n := range r.Namespace.All() {
		if n.DriverID != "" && n.DriverAddr != "" {
			key := n.DriverID + ":" + n.DriverAddr
			aliases[key] = append(aliases[key], n.Path)
		}
	}
	r.mu.Lock()
	r.nsAliases = aliases
	r.mu.Unlock()

	r.Events.Publish(eventbus.Event{
		Type:    eventbus.EventProjectLoaded,
		Payload: map[string]any{"pages": len(p.Pages), "datasources": len(p.Datasources)},
	})

	r.mu.Lock()
	r.project = p
	desired := map[string]bool{}
	for _, ds := range p.Datasources {
		desired[ds.ID] = true
	}
	// disconnect removed datasources
	for id, d := range r.drivers {
		if !desired[id] {
			_ = d.Disconnect()
			if stop := r.fanStop[id]; stop != nil {
				stop()
			}
			delete(r.drivers, id)
			delete(r.fanStop, id)
			log.Printf("[RUNTIME] removed datasource %s", id)
		}
	}
	r.mu.Unlock()

	// connect new datasources, then give every driver its tag set
	for _, ds := range p.Datasources {
		if !r.has(ds.ID) {
			drv, err := r.buildDriver(ds.Type)
			if err != nil {
				log.Printf("[RUNTIME] %s: %v — skipped", ds.ID, err)
				continue
			}
			fanCh := r.startFanIn(ds.ID)
			// Register driver before connecting so status endpoint always exists.
			r.mu.Lock()
			r.drivers[ds.ID] = drv
			r.mu.Unlock()
			cfg := buildConfig(ds)
			if err := drv.Connect(ctx, cfg, fanCh); err != nil {
				log.Printf("[RUNTIME] %s: connect failed: %v", ds.ID, err)
				// driver remains registered with connected=false; status shows the error
			} else {
				log.Printf("[RUNTIME] connected %s (%s)", ds.ID, ds.Type)
			}
		}
	}
	r.setDemands(projectDemand(p))
	for _, w := range certWarnings(p) {
		log.Printf("[SECURITY] WARNING: %s", w)
	}
	if p.Security == nil || p.Security.Mode != project.Login {
		log.Printf("[SECURITY] WARNING: security.mode is not \"login\": no login is needed and everyone has full access, including writes and deploys")
	} else if r.Security != nil && r.InitialAdminFile != "" {
		created, err := r.Security.EnsureInitialAdmin(ctx, r.InitialAdminFile)
		switch {
		case err != nil:
			log.Printf("[SECURITY] could not create the first admin: %v", err)
		case created:
			log.Printf("[SECURITY] FIRST RUN: created user \"admin\"; its password is in %s and must be changed at first login", r.InitialAdminFile)
		}
	}
	return nil
}

// startFanIn creates the channel one driver pushes into and the goroutine
// that prefixes each path with the datasource id and forwards it to the pump.
// It runs until the driver is removed or the runtime stops.
func (r *Runtime) startFanIn(dsID string) chan<- tagstore.TagUpdate {
	fanCtx, stop := context.WithCancel(r.pumpCtx)
	r.mu.Lock()
	if old := r.fanStop[dsID]; old != nil {
		old()
	}
	r.fanStop[dsID] = stop
	r.mu.Unlock()

	fanCh := make(chan tagstore.TagUpdate, 256)
	prefix := dsID + ":"
	go func() {
		for {
			select {
			case u := <-fanCh:
				u.Path = prefix + u.Path
				r.pumpBox.Put(u)
			case <-fanCtx.Done():
				return
			}
		}
	}()
	return fanCh
}

// testDatasourceWait is how long TestDatasource waits for a driver to come
// online or report an error; tests shorten it.
var testDatasourceWait = 10 * time.Second

// TestDatasource creates a temporary driver, connects it, waits until it is
// online or reports an error (drivers connect in the background), returns
// its status, then disconnects. Safe to call concurrently.
func (r *Runtime) TestDatasource(ctx context.Context, ds project.Datasource) drivers.DriverStatus {
	drv, err := r.buildDriver(ds.Type)
	if err != nil {
		return drivers.DriverStatus{LastError: err.Error()}
	}
	tctx, cancel := context.WithTimeout(ctx, testDatasourceWait)
	defer cancel()
	cfg := buildConfig(ds)
	if err := drv.Connect(tctx, cfg, nil); err != nil {
		return drivers.DriverStatus{LastError: err.Error()}
	}
	defer drv.Disconnect()
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	for {
		st := drv.Status()
		if st.Connected || st.LastError != "" {
			return st
		}
		select {
		case <-tick.C:
		case <-tctx.Done():
			if st.LastError == "" {
				st.LastError = "no answer within " + testDatasourceWait.String()
			}
			return st
		}
	}
}

// Project returns the currently loaded project (may be nil).
func (r *Runtime) Project() *project.Project {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.project
}

// Driver returns the driver for a datasource id (may be nil).
func (r *Runtime) Driver(id string) drivers.ProtocolDriver {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.drivers[id]
}

// Drivers returns a snapshot of (id → driver).
func (r *Runtime) Drivers() map[string]drivers.ProtocolDriver {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]drivers.ProtocolDriver, len(r.drivers))
	for k, v := range r.drivers {
		out[k] = v
	}
	return out
}

func (r *Runtime) has(id string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.drivers[id]
	return ok
}

// pump reads from drivers, writes to TagStore + Historian + Alarms.
// If it falls behind, the mailbox keeps only the newest value per tag, so
// the store always ends on the latest value.
func (r *Runtime) pump(ctx context.Context) {
	defer r.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.pumpBox.C():
			for _, u := range r.pumpBox.Drain() {
				r.process(u)
			}
		}
	}
}

// process applies one driver update.
func (r *Runtime) process(u tagstore.TagUpdate) {
	r.Store.Update(u.Path, u.State)
	if r.Historian != nil {
		r.Historian.Enqueue(u) // never blocks; stores changes only
	}
	r.Alarms.Evaluate(u.Path, u.State.Value)
	// Forward update to any namespace alias paths (ns:foo).
	r.mu.RLock()
	aliases := r.nsAliases[u.Path]
	r.mu.RUnlock()
	for _, nsPath := range aliases {
		r.Store.Update("ns:"+nsPath, u.State)
	}
}

// RebuildNSAliases rebuilds the driverId:driverAddr → nsPath reverse-lookup
// map from the current namespace tree. Call after any namespace mutation.
func (r *Runtime) RebuildNSAliases() {
	aliases := map[string][]string{}
	for _, n := range r.Namespace.All() {
		if n.DriverID != "" && n.DriverAddr != "" {
			key := n.DriverID + ":" + n.DriverAddr
			aliases[key] = append(aliases[key], n.Path)
		}
	}
	r.mu.Lock()
	r.nsAliases = aliases
	r.mu.Unlock()
	r.applyDemand() // ns: bindings may now resolve to different driver tags
}

// persistAlarms subscribes to the alarm engine and writes every state
// transition to the AlarmStore so history survives restarts.
// persistAlarms writes every alarm change to the alarm store. If the store
// falls so far behind that changes were dropped, it writes the full current
// state; the store upserts by event id, so nothing that matters is lost.
func (r *Runtime) persistAlarms(ctx context.Context, sub *alarms.Subscription) {
	defer r.wg.Done()
	defer sub.Close()
	record := func(evs []alarms.Event) {
		for _, ev := range evs {
			if err := r.AlarmStore.Record(ev); err != nil {
				log.Printf("[RUNTIME] alarm persist: %v", err)
			}
		}
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-sub.C():
			changes, resync := sub.Next()
			if resync {
				log.Printf("[RUNTIME] alarm history fell behind; writing the current alarm state")
				record(r.Alarms.Events())
			}
			record(changes)
		}
	}
}

// alarmHistoryQueue is how many alarm changes the history writer can fall
// behind by before it writes a snapshot instead. Tests lower it.
var alarmHistoryQueue = 4096

func (r *Runtime) buildDriver(typ project.DatasourceType) (drivers.ProtocolDriver, error) {
	if r.newDriver != nil {
		return r.newDriver(typ)
	}
	return drivers.Build(string(typ), drivers.BuildCtx{Store: r.Store})
}

func buildConfig(ds project.Datasource) drivers.DriverConfig {
	cfg := drivers.DriverConfig{Extra: map[string]string{}}
	c := ds.Config
	if c.Endpoint != nil {
		cfg.Endpoint = *c.Endpoint
	}
	if c.Host != nil && cfg.Endpoint == "" {
		cfg.Endpoint = *c.Host
		if c.Port != nil {
			cfg.Endpoint = fmt.Sprintf("%s:%d", *c.Host, *c.Port)
		}
	}
	if c.Username != nil {
		cfg.Username = *c.Username
	}
	if c.Password != nil {
		cfg.Password = *c.Password
	}
	if c.SecurityMode != nil {
		cfg.Extra["securityMode"] = string(*c.SecurityMode)
	}
	if c.SecurityPolicy != nil {
		cfg.Extra["securityPolicy"] = string(*c.SecurityPolicy)
	}
	if c.CERTCheck != nil {
		cfg.Extra["certCheck"] = string(*c.CERTCheck)
	}
	if c.CERTFingerprint != nil {
		cfg.Extra["certFingerprint"] = *c.CERTFingerprint
	}
	if c.SlaveID != nil {
		cfg.Extra["slaveId"] = fmt.Sprintf("%d", *c.SlaveID)
	}
	if c.ClientID != nil {
		cfg.Extra["clientId"] = *c.ClientID
	}
	if c.BasePath != nil {
		cfg.Extra["basePath"] = *c.BasePath
	}
	if c.BearerToken != nil {
		cfg.Extra["bearerToken"] = *c.BearerToken
	}
	if c.Tags != nil {
		cfg.Extra["tags"] = *c.Tags
	}
	return cfg
}

// LoginRequired reports whether the loaded project asks for logins
// (security.mode "login"). A missing mode, "none" and no project at all
// mean no login.
func (r *Runtime) LoginRequired() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.project != nil && r.project.Security != nil && r.project.Security.Mode == project.Login
}
