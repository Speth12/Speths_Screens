package runtime

import (
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// Runtime scripts start with the project, write through the write
// pipeline (so its checks hold), and onAlarm runs on the alarm engine's
// changes.
func TestRuntimeScripts(t *testing.T) {
	r, plc := startWriteRuntime(t)
	p := writeProject()
	on := true
	p.AlarmRules = []project.AlarmRule{{ID: "hi", Name: "High", Expr: "{plc:T} > 50", Severity: project.Critical, Message: "high"}}
	p.Scripts = []project.RuntimeScript{
		{ID: "boot", Name: "Boot", Trigger: project.ScriptTrigger{OnStart: &on}, Source: `
			state.sp = await writeTag('plc:SP', 42);
			state.shown = await writeTag('plc:SHOWN', 1);
			emit('boot', { sp: state.sp.status, shown: state.shown.status });`},
		{ID: "react", Name: "React", Trigger: project.ScriptTrigger{OnAlarm: []string{"hi"}}, Source: `
			if (event.active) await writeTag('plc:FREE', 'alarm');`},
	}
	events := r.Events.SubscribeN(16, EventScript)
	defer events.Close()
	load(t, r, p)

	select {
	case <-events.C():
		ev, _ := events.Next()
		got := ev[0].Payload.(map[string]any)
		if got["sp"] != WriteConfirmed || got["shown"] != WriteFailed {
			t.Errorf("boot writes: %v", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no event from the boot script")
	}

	r.Alarms.Evaluate("plc:T", tagstore.TagState{Value: 60.0, Quality: "Good"})
	deadline := time.Now().Add(3 * time.Second)
	for {
		plc.mu.Lock()
		v := plc.vals["FREE"]
		plc.mu.Unlock()
		if v == "alarm" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("onAlarm script did not write; FREE = %v", v)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if st := r.Scripts.Status(); len(st) != 2 || st[0].Runs != 1 || st[1].Runs != 1 {
		t.Errorf("status %+v", st)
	}
}
