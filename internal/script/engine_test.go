package script

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// fakeHost records writes, logs and events; writes answer confirmed.
type fakeHost struct {
	mu     sync.Mutex
	writes []string
	logs   []string
	events []string
	answer WriteOutcome
}

func (h *fakeHost) Write(_ context.Context, id, path string, v any) WriteOutcome {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.writes = append(h.writes, id+" "+path+"="+fmtAny(v))
	if h.answer.Status == "" {
		return WriteOutcome{Status: "confirmed"}
	}
	return h.answer
}
func (h *fakeHost) Log(id, line string) {
	h.mu.Lock()
	h.logs = append(h.logs, id+": "+line)
	h.mu.Unlock()
}
func (h *fakeHost) Emit(id, typ string, p any) {
	h.mu.Lock()
	h.events = append(h.events, id+" "+typ+" "+fmtAny(p))
	h.mu.Unlock()
}
func (h *fakeHost) snapshot() (writes, logs, events []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string{}, h.writes...), append([]string{}, h.logs...), append([]string{}, h.events...)
}

// fmtAny writes a value as the tests compare it: text as is, null for
// nothing, anything else with fmt (a map prints as map[k:v ...]).
func fmtAny(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	}
	return fmt.Sprint(v)
}

func trigger(t project.ScriptTrigger) project.ScriptTrigger { return t }
func ptrBool(b bool) *bool                                  { return &b }
func ptrInt(n int64) *int64                                 { return &n }

// eventually waits until ok holds.
func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func start(t *testing.T, store *tagstore.TagStore, h *fakeHost, scripts ...project.RuntimeScript) *Engine {
	t.Helper()
	e := New(store, h)
	e.Load(scripts)
	t.Cleanup(e.Stop)
	return e
}

func TestOnStartWritesAndAwaitsTheResult(t *testing.T) {
	store := tagstore.New()
	store.Update("plc:T", tagstore.TagState{Value: 20.0, Quality: "Good"})
	h := &fakeHost{}
	start(t, store, h, project.RuntimeScript{ID: "s", Trigger: trigger(project.ScriptTrigger{OnStart: ptrBool(true)}), Source: `
		const r = await writeTag('mem:Double', readTag('plc:T') * 2);
		log('write', r.status, quality('plc:T'), quality('plc:Missing'), readTag('plc:Missing'));`})
	eventually(t, "the log line", func() bool { _, logs, _ := h.snapshot(); return len(logs) == 1 })
	writes, logs, _ := h.snapshot()
	if len(writes) != 1 || writes[0] != "s mem:Double=40" {
		t.Errorf("writes %q", writes)
	}
	if logs[0] != "s: write confirmed Good Bad null" {
		t.Errorf("log %q", logs[0])
	}
}

func TestOnChangeKeepsStateBetweenRuns(t *testing.T) {
	store := tagstore.New()
	h := &fakeHost{}
	start(t, store, h, project.RuntimeScript{ID: "count", Trigger: project.ScriptTrigger{OnChange: []string{"plc:Run"}}, Source: `
		state.n = (state.n ?? 0) + 1;
		emit('changed', { n: state.n, path: event.path, value: event.value });`})
	for _, v := range []bool{true, false, true} {
		store.Update("plc:Run", tagstore.TagState{Value: v, Quality: "Good"})
		time.Sleep(30 * time.Millisecond)
	}
	eventually(t, "three runs", func() bool { _, _, ev := h.snapshot(); return len(ev) == 3 })
	_, _, ev := h.snapshot()
	if !strings.Contains(ev[2], "n:3") || !strings.Contains(ev[2], "path:plc:Run") {
		t.Errorf("events %q", ev)
	}
}

func TestEveryRunsOnAnInterval(t *testing.T) {
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{ID: "tick", Trigger: project.ScriptTrigger{Every: ptrInt(100)}, Source: `state.n = (state.n ?? 0) + 1;`})
	eventually(t, "three runs", func() bool { return e.Status()[0].Runs >= 3 })
}

func TestAlarmTrigger(t *testing.T) {
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{ID: "a", Trigger: project.ScriptTrigger{OnAlarm: []string{"high"}}, Source: `log(event.rule, event.active);`})
	e.AlarmChanged("other", true)
	e.AlarmChanged("high", true)
	eventually(t, "the log line", func() bool { _, logs, _ := h.snapshot(); return len(logs) == 1 })
	if _, logs, _ := h.snapshot(); logs[0] != "a: high true" {
		t.Errorf("log %q", logs)
	}
}

// An endless loop is interrupted each run; five times in a minute stops
// the script. The test (and so the runtime around it) keeps going.
func TestEndlessLoopIsStopped(t *testing.T) {
	old := RunBudget
	RunBudget = 20 * time.Millisecond
	t.Cleanup(func() { RunBudget = old })
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{ID: "spin", Trigger: project.ScriptTrigger{Every: ptrInt(100)}, Source: `while (true) {}`})
	eventually(t, "the script to stop", func() bool { return e.Status()[0].State == "stopped" })
	st := e.Status()[0]
	if st.Interrupts != MaxInterrupts || st.Reason != "interrupted 5 times in a minute" {
		t.Errorf("status %+v", st)
	}
	runs := st.Runs
	time.Sleep(250 * time.Millisecond)
	if e.Status()[0].Runs != runs {
		t.Error("a stopped script still runs")
	}
}

func TestErrorsAreLoggedAndTheScriptGoesOn(t *testing.T) {
	h := &fakeHost{}
	store := tagstore.New()
	e := start(t, store, h, project.RuntimeScript{ID: "e", Trigger: project.ScriptTrigger{OnChange: []string{"plc:X"}}, Source: `
		if (event.value === 1) throw new Error('boom');
		log('ok', event.value);`})
	store.Update("plc:X", tagstore.TagState{Value: 1.0, Quality: "Good"})
	time.Sleep(30 * time.Millisecond)
	store.Update("plc:X", tagstore.TagState{Value: 2.0, Quality: "Good"})
	eventually(t, "the ok line", func() bool { _, logs, _ := h.snapshot(); return len(logs) == 2 })
	_, logs, _ := h.snapshot()
	if !strings.Contains(logs[0], "error: Error: boom") || logs[1] != "e: ok 2" {
		t.Errorf("logs %q", logs)
	}
	if st := e.Status()[0]; st.State != "running" || !strings.Contains(st.LastError, "boom") {
		t.Errorf("status %+v", st)
	}
}

func TestCompileErrorStopsOnlyThatScript(t *testing.T) {
	h := &fakeHost{}
	e := start(t, tagstore.New(), h,
		project.RuntimeScript{ID: "bad", Trigger: project.ScriptTrigger{OnStart: ptrBool(true)}, Source: `if (x {`},
		project.RuntimeScript{ID: "good", Trigger: project.ScriptTrigger{OnStart: ptrBool(true)}, Source: `log('hi')`})
	eventually(t, "the good script", func() bool { _, logs, _ := h.snapshot(); return len(logs) == 2 })
	st := e.Status()
	if st[0].State != "stopped" || !strings.Contains(st[0].Reason, "Unexpected token") || st[1].State != "running" {
		t.Errorf("status %+v", st)
	}
}

// When runs come faster than the script handles them, the queue keeps the
// newest QueueSize and counts the rest.
func TestQueueDropsTheOldest(t *testing.T) {
	old := QueueSize
	QueueSize = 4
	t.Cleanup(func() { QueueSize = old })
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{ID: "slow", Trigger: project.ScriptTrigger{OnAlarm: []string{"a"}}, Source: `
		const t0 = Date.now(); while (Date.now() - t0 < 30) {}`})
	for i := 0; i < 20; i++ {
		e.AlarmChanged("a", true)
	}
	eventually(t, "the queue to empty", func() bool { st := e.Status()[0]; return st.Queued == 0 && st.Runs+st.Dropped == 20 })
	if st := e.Status()[0]; st.Dropped == 0 {
		t.Errorf("nothing dropped: %+v", st)
	}
}

func TestLoadReplacesTheScripts(t *testing.T) {
	h := &fakeHost{}
	e := start(t, tagstore.New(), h, project.RuntimeScript{ID: "one", Trigger: project.ScriptTrigger{Every: ptrInt(100)}, Source: `log(1)`})
	e.Load([]project.RuntimeScript{{ID: "two", Trigger: project.ScriptTrigger{OnStart: ptrBool(true)}, Source: `log(2)`}})
	if st := e.Status(); len(st) != 1 || st[0].ID != "two" {
		t.Errorf("status %+v", st)
	}
	e.Stop()
	if len(e.Status()) != 0 {
		t.Error("scripts left after Stop")
	}
}
