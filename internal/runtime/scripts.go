package runtime

import (
	"context"
	"log"
	"time"

	"github.com/Speth12/Speths_Screens/internal/alarms"
	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/eventbus"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/script"
	"github.com/Speth12/Speths_Screens/internal/security"
)

// EventScript is what a runtime script's emit() publishes on the event bus.
const EventScript eventbus.EventType = "script.event"

// scriptAlarmQueue is the alarm subscription queue for onAlarm triggers.
const scriptAlarmQueue = 256

// scriptHost backs runtime scripts with the runtime: writes go through the
// write pipeline as the project's scriptRole, audited under the script's id.
type scriptHost struct{ r *Runtime }

// scriptRole is the role scripts write as: the project's scriptRole, else
// Operator.
func (r *Runtime) scriptRole() security.Role {
	r.mu.RLock()
	p := r.project
	r.mu.RUnlock()
	if p != nil && p.ScriptRole != nil && *p.ScriptRole != "" {
		return security.Role(*p.ScriptRole)
	}
	return security.RoleOperator
}

func (h scriptHost) Write(ctx context.Context, id, path string, value any) script.WriteOutcome {
	r := h.r
	var res WriteResult
	if role := r.scriptRole(); !security.HasPermission(role, security.PermWriteTag) {
		res = writeFailed(403, "role %s may not write tags", role)
	} else {
		res = r.WriteTag(ctx, WriteRequest{Binding: path, Value: value})
	}
	if r.Historian != nil && (res.Status == WriteConfirmed || res.Status == WriteSent) {
		_ = r.Historian.RecordWrite(path, value)
	}
	if r.Audit != nil {
		meta := res.Status
		if res.Reason != "" {
			meta += ": " + res.Reason
		}
		_ = r.Audit.Record(context.Background(), "script:"+id, audit.ActionTagWrite, path, nil, value, meta)
	}
	return script.WriteOutcome{Status: res.Status, Reason: res.Reason}
}

func (h scriptHost) Log(id, line string) { log.Printf("[SCRIPT] %s: %s", id, line) }

func (h scriptHost) Emit(id, typ string, payload any) {
	h.r.Events.Publish(eventbus.Event{
		Type: EventScript, Timestamp: time.Now(), Source: "script:" + id, Target: typ, Payload: payload,
	})
}

// loadScripts (re)starts the project's runtime scripts.
func (r *Runtime) loadScripts(p *project.Project) {
	r.Scripts.Load(p.Scripts)
	if n := len(p.Scripts); n > 0 {
		log.Printf("[RUNTIME] %d runtime script(s) started, writing as %s", n, r.scriptRole())
	}
}

// scriptAlarms runs the scripts' onAlarm triggers when an alarm is raised
// or cleared; changes of reason or acknowledgement alone run nothing. When
// the queue overflows, the changes in between are lost (a resync carries
// state, not changes): the current state is taken as known, and that is
// logged.
func (r *Runtime) scriptAlarms(ctx context.Context, sub *alarms.Subscription) {
	defer r.wg.Done()
	defer sub.Close()
	active := map[string]bool{} // event id -> last active state seen
	for {
		select {
		case <-ctx.Done():
			return
		case <-sub.C():
			changes, resync := sub.Next()
			if resync {
				log.Printf("[RUNTIME] scripts fell behind on alarm changes; some onAlarm runs were skipped")
				for _, ev := range r.Alarms.Events() {
					active[ev.ID] = ev.Active
				}
			}
			for _, ev := range changes {
				was, seen := active[ev.ID]
				if (seen && was == ev.Active) || (!seen && !ev.Active) {
					continue // first seen already cleared: nothing was raised
				}
				active[ev.ID] = ev.Active
				r.Scripts.AlarmChanged(ev.RuleID, ev.Active)
			}
		}
	}
}
