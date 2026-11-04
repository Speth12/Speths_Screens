// Package script runs a project's runtime scripts (Phase 4): JavaScript the
// runtime runs on its own, in goja. Each script has its own VM and its own
// goroutine, so one script can neither see another's variables nor stall it;
// the runtime's pump, drivers and alarms never wait on a script.
//
// A script's source runs as the body of an async function each time one of
// its triggers fires (a tag changes, an interval, the start, an alarm), so
// top-level await and return work. Values kept between runs go in the
// script's `state` object; `event` says what fired the run.
//
// Limits: a run gets RunBudget of work each time it enters the VM (a run
// that awaits a write enters again when the write answers); past it the VM
// is interrupted. A script interrupted MaxInterrupts times in a minute is
// stopped. Triggers wait in a queue of QueueSize runs; when it is full the
// oldest is dropped and counted.
package script

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dop251/goja"

	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Limits; tests lower them.
var (
	RunBudget     = 100 * time.Millisecond
	MaxInterrupts = 5
	QueueSize     = 256
)

// WriteOutcome is what a write answered, as the write pipeline's result.
type WriteOutcome struct {
	Status string // confirmed, not_confirmed, sent, failed
	Reason string
}

// Host is what scripts reach the plant through. The runtime implements it:
// Write goes through the write pipeline as the project's scriptRole, with
// the script named in the audit.
type Host interface {
	Write(ctx context.Context, scriptID, path string, value any) WriteOutcome
	Log(scriptID, line string)
	Emit(scriptID, typ string, payload any)
}

// Status is one script's state, for GET /api/v1/scripts.
type Status struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	State      string    `json:"state"` // running, stopped
	Reason     string    `json:"reason,omitempty"`
	Runs       int       `json:"runs"`
	LastRun    time.Time `json:"lastRun,omitzero"`
	LastError  string    `json:"lastError,omitempty"`
	Interrupts int       `json:"interrupts"`
	Dropped    int       `json:"dropped"`
	Queued     int       `json:"queued"`
}

// Engine runs a project's scripts.
type Engine struct {
	store *tagstore.TagStore
	host  Host

	mu      sync.Mutex
	runners []*runner
}

// New returns an engine reading tags from store and writing through host.
func New(store *tagstore.TagStore, host Host) *Engine { return &Engine{store: store, host: host} }

// Load stops the running scripts and starts these. A script whose source
// does not compile is listed as stopped with the reason (validation
// refuses such a project before it gets here).
func (e *Engine) Load(scripts []project.RuntimeScript) {
	e.Stop()
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, s := range scripts {
		r := newRunner(s, e.store, e.host)
		e.runners = append(e.runners, r)
		r.start()
	}
}

// Stop stops every script and waits for them.
func (e *Engine) Stop() {
	e.mu.Lock()
	runners := e.runners
	e.runners = nil
	e.mu.Unlock()
	for _, r := range runners {
		r.stop()
	}
}

// AlarmChanged runs the scripts that name the alarm rule in onAlarm.
func (e *Engine) AlarmChanged(ruleID string, active bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, r := range e.runners {
		for _, id := range r.spec.Trigger.OnAlarm {
			if id == ruleID {
				r.trigger(map[string]any{"kind": "alarm", "rule": ruleID, "active": active})
			}
		}
	}
}

// Status lists every script's state.
func (e *Engine) Status() []Status {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]Status, 0, len(e.runners))
	for _, r := range e.runners {
		out = append(out, r.status())
	}
	return out
}

// ── one script ──────────────────────────────────────────────────────────────

var errBudget = errors.New("time budget")

type runner struct {
	spec  project.RuntimeScript
	store *tagstore.TagStore
	host  Host

	runs     chan map[string]any // triggers, bounded (oldest dropped)
	resolves chan func()         // write answers to hand back to the VM
	done     chan struct{}
	wg       sync.WaitGroup
	ctx      context.Context
	cancel   context.CancelFunc

	mu         sync.Mutex
	st         Status
	interrupts []time.Time
}

func newRunner(s project.RuntimeScript, store *tagstore.TagStore, host Host) *runner {
	ctx, cancel := context.WithCancel(context.Background())
	return &runner{
		spec: s, store: store, host: host,
		runs: make(chan map[string]any, QueueSize), resolves: make(chan func(), QueueSize),
		done: make(chan struct{}), ctx: ctx, cancel: cancel,
		st: Status{ID: s.ID, Name: s.Name, State: "running"},
	}
}

func (r *runner) status() Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	st := r.st
	st.Queued = len(r.runs)
	return st
}

// trigger queues a run, dropping the oldest when the queue is full.
func (r *runner) trigger(event map[string]any) {
	for {
		select {
		case r.runs <- event:
			return
		default:
		}
		select {
		case <-r.runs:
			r.mu.Lock()
			r.st.Dropped++
			r.mu.Unlock()
		default:
		}
	}
}

func (r *runner) start() {
	vm := goja.New()
	fn, err := r.compile(vm)
	if err != nil {
		r.setStopped(err.Error())
		return
	}
	r.wg.Add(1)
	go r.loop(vm, fn)

	t := r.spec.Trigger
	if t.OnStart != nil && *t.OnStart {
		r.trigger(map[string]any{"kind": "start"})
	}
	if t.Every != nil && *t.Every >= 100 {
		r.wg.Add(1)
		go func(every time.Duration) {
			defer r.wg.Done()
			tick := time.NewTicker(every)
			defer tick.Stop()
			for {
				select {
				case <-r.done:
					return
				case <-tick.C:
					r.trigger(map[string]any{"kind": "every"})
				}
			}
		}(time.Duration(*t.Every) * time.Millisecond)
	}
	if len(t.OnChange) > 0 && r.store != nil {
		w := r.store.Watch()
		w.Add(t.OnChange...)
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			defer w.Close()
			for {
				select {
				case <-r.done:
					return
				case <-w.C():
					for _, u := range w.Drain() {
						r.trigger(map[string]any{"kind": "change", "path": u.Path, "value": u.State.Value, "quality": u.State.Quality})
					}
				}
			}
		}()
	}
}

func (r *runner) stop() {
	select {
	case <-r.done:
	default:
		close(r.done)
	}
	r.cancel()
	r.wg.Wait()
}

func (r *runner) setStopped(reason string) {
	r.mu.Lock()
	r.st.State, r.st.Reason = "stopped", reason
	r.mu.Unlock()
	r.host.Log(r.spec.ID, "stopped: "+reason)
}

// compile installs the API and compiles the source as an async function.
func (r *runner) compile(vm *goja.Runtime) (goja.Callable, error) {
	id := r.spec.ID
	_ = vm.Set("state", vm.NewObject())
	_ = vm.Set("readTag", func(path string) any {
		s, ok := r.store.Get(path)
		if !ok {
			return nil
		}
		return s.Value
	})
	_ = vm.Set("quality", func(path string) string {
		s, ok := r.store.Get(path)
		if !ok {
			return "Bad"
		}
		return s.Quality
	})
	_ = vm.Set("writeTag", func(path string, value goja.Value) *goja.Promise {
		p, resolve, _ := vm.NewPromise()
		v := value.Export()
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			out := r.host.Write(r.ctx, id, path, v)
			select {
			case r.resolves <- func() { _ = resolve(map[string]any{"status": out.Status, "reason": out.Reason}) }:
			case <-r.done:
			}
		}()
		return p
	})
	_ = vm.Set("log", func(call goja.FunctionCall) goja.Value {
		parts := make([]string, len(call.Arguments))
		for i, a := range call.Arguments {
			parts[i] = a.String()
		}
		r.host.Log(id, strings.Join(parts, " "))
		return goja.Undefined()
	})
	_ = vm.Set("emit", func(typ string, payload goja.Value) {
		var v any
		if payload != nil {
			v = payload.Export()
		}
		r.host.Emit(id, typ, v)
	})
	prog, err := goja.Compile(id, "(async function () {\n"+r.spec.Source+"\n})", false)
	if err != nil {
		return nil, err
	}
	v, err := vm.RunProgram(prog)
	if err != nil {
		return nil, err
	}
	fn, ok := goja.AssertFunction(v)
	if !ok {
		return nil, fmt.Errorf("the script is not a function")
	}
	return fn, nil
}

// loop is the script's only goroutine on the VM: runs and write answers.
func (r *runner) loop(vm *goja.Runtime, fn goja.Callable) {
	defer r.wg.Done()
	var pending []*goja.Promise // runs still awaiting something
	for {
		var stopped bool
		select {
		case <-r.done:
			return
		case resolve := <-r.resolves:
			stopped = r.enter(vm, func() error { resolve(); return nil })
		case event := <-r.runs:
			r.mu.Lock()
			r.st.Runs++
			r.st.LastRun = time.Now()
			r.mu.Unlock()
			stopped = r.enter(vm, func() error {
				_ = vm.Set("event", event)
				v, err := fn(goja.Undefined())
				if err == nil {
					if p, ok := v.Export().(*goja.Promise); ok {
						pending = append(pending, p)
					}
				}
				return err
			})
		}
		if stopped {
			return
		}
		pending = r.settle(pending)
	}
}

// enter runs f on the VM within the time budget. It reports whether the
// script has been stopped for using it up too often.
func (r *runner) enter(vm *goja.Runtime, f func() error) bool {
	timer := time.AfterFunc(RunBudget, func() { vm.Interrupt(errBudget) })
	err := f()
	timer.Stop()
	vm.ClearInterrupt()
	if err == nil {
		return false
	}
	var interrupted *goja.InterruptedError
	if !errors.As(err, &interrupted) {
		r.recordError(err.Error())
		return false
	}
	now := time.Now()
	r.mu.Lock()
	r.st.Interrupts++
	keep := r.interrupts[:0]
	for _, t := range r.interrupts {
		if now.Sub(t) < time.Minute {
			keep = append(keep, t)
		}
	}
	r.interrupts = append(keep, now)
	tooMany := len(r.interrupts) >= MaxInterrupts
	r.mu.Unlock()
	r.recordError(fmt.Sprintf("interrupted: a run used more than %v of work", RunBudget))
	if tooMany {
		r.setStopped(fmt.Sprintf("interrupted %d times in a minute", MaxInterrupts))
		return true
	}
	return false
}

// settle records the error of every run that ended rejected and keeps the
// ones still pending.
func (r *runner) settle(pending []*goja.Promise) []*goja.Promise {
	keep := pending[:0]
	for _, p := range pending {
		switch p.State() {
		case goja.PromiseStatePending:
			keep = append(keep, p)
		case goja.PromiseStateRejected:
			r.recordError(fmt.Sprint(p.Result()))
		}
	}
	return keep
}

func (r *runner) recordError(msg string) {
	r.mu.Lock()
	r.st.LastError = msg
	r.mu.Unlock()
	r.host.Log(r.spec.ID, "error: "+msg)
}
