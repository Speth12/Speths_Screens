// The Alarms tab: the project's alarm rules as a list on the left, and on the right the chosen rule to edit, the
// events the runtime has raised (live), and their history. A rule is edited as a draft and saved or reverted
// explicitly, like a datasource.
import { useCallback, useEffect, useMemo, useState } from "react";
import { compile } from "@speths-screens/expr";
import { useProject, type AlarmRule, type AlarmSeverity } from "../store/projectStore";
import { NEW_ITEM, useWorkspace } from "../store/workspace";
import { isDirty, useDraft, useDrafts } from "../store/drafts";
import { apiFetch } from "../store/runtimeAuth";
import { useClientAlarms } from "../store/alarmEngine";
import { ackAlarm, byUrgency, needsAttention, useAlarmFeed, type AlarmEvent } from "../store/alarmFeed";
import { BindingInput } from "./BindingInput";
import { LiveValue } from "./LiveValue";
import { Badge, Button, Field, Input, Select, Tabs, type BadgeTone } from "../ui";
import { EmptyState, SelectList, TabHeader } from "../ui/Layout";
import { AddIcon, CheckIcon, DeleteIcon, RefreshIcon } from "../ui/icons";

const SEVERITIES: AlarmSeverity[] = ["critical", "warning", "info"];
const TONE: Record<AlarmSeverity, BadgeTone> = { critical: "danger", warning: "warning", info: "info" };
const NONE: AlarmRule[] = [];

const uid = () => `alarm-${Math.random().toString(36).slice(2, 8)}`;

type View = "rule" | "live" | "history";

export function AlarmsTab() {
  const rules = useProject((s) => s.project.alarmRules) ?? NONE;
  const { addAlarmRule, updateAlarmRule, removeAlarmRule } = useProject.getState();
  const chosen = useWorkspace((s) => s.selection.alarms);
  const select = useWorkspace((s) => s.select);
  const events = useAlarmFeed();
  const client = useClientAlarms();

  const [view, setView] = useState<View>(rules.length ? "rule" : "live");
  const [filter, setFilter] = useState("");
  const drafts = useDrafts((s) => s.entries);
  const creating = chosen === NEW_ITEM;

  const rule = creating ? undefined : (rules.find((r) => r.id === chosen) ?? rules[0]);
  // A rule the runtime and the editor both find active is one alarm, counted once.
  const activeRules = new Set([...events.filter(needsAttention).map((e) => e.ruleId), ...client.map((a) => a.ruleId)]);
  const activeCount = activeRules.size;
  const stateOf = (id: string) => events.find((e) => e.ruleId === id && e.active) ?? null;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rules.filter((r) => `${r.name} ${r.expr} ${r.message}`.toLowerCase().includes(q)) : rules;
  }, [rules, filter]);

  const choose = (id: string) => { select("alarms", id); setView("rule"); };
  const startNew = () => { select("alarms", NEW_ITEM); setView("rule"); };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <TabHeader title="Alarms"
        summary={`${rules.length} rule${rules.length === 1 ? "" : "s"} · ${activeCount} active`}
        actions={<Button variant="primary" icon={<AddIcon size={14} />} onClick={startNew}>New rule</Button>} />
      <div className="flex-1 flex min-h-0">
        <section className="w-80 shrink-0 min-w-0 flex flex-col border-r border-zinc-800">
          <div className="px-3 py-2 border-b border-zinc-800/60 shrink-0">
            <Input aria-label="Search alarm rules" placeholder="Search rules…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {rules.length === 0 ? (
            <EmptyState title="No alarm rules yet">
              A rule raises an alarm while its expression is true, for example <code className="text-zinc-300">{"{ns:Tank1/Level} > 95"}</code>.
            </EmptyState>
          ) : shown.length === 0 ? (
            <div className="p-4 text-ui text-zinc-500">No rule matches “{filter}”.</div>
          ) : (
            <SelectList label="Alarm rules" className="flex-1 min-h-0" selected={creating ? null : (rule?.id ?? null)} onSelect={choose}
              items={shown.map((r) => {
                const live = stateOf(r.id);
                return {
                  id: r.id,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={TONE[r.severity]}>{r.severity}</Badge>
                        <span className="flex-1 truncate text-ui font-medium text-zinc-100">{r.name || "Unnamed rule"}</span>
                        {isDirty(drafts, `alarm:${r.id}`, draftOf(r)) && <Badge tone="warning">unsaved</Badge>}
                        {live ? <Badge tone={live.acked ? "neutral" : TONE[live.severity]}>{live.acked ? "acknowledged" : "active"}</Badge>
                          : activeRules.has(r.id) && <Badge tone={TONE[r.severity]}>active</Badge>}
                      </div>
                      <div className="truncate font-mono text-ui-label text-zinc-500">{r.expr}</div>
                    </div>
                  ),
                };
              })} />
          )}
        </section>

        <section className="flex-1 min-w-0 flex flex-col">
          <Tabs label="Alarm views" active={view} onSelect={(v) => setView(v as View)} className="px-2 shrink-0"
            tabs={[
              { id: "rule", label: creating ? "New rule" : "Rule" },
              { id: "live", label: activeCount ? `Live (${activeCount})` : "Live" },
              { id: "history", label: "History" },
            ]} />
          {/* The rule editor stays mounted behind the other views, so a draft is not lost on a look at the events. */}
          <div className={view === "rule" ? "flex-1 min-h-0 overflow-auto" : "hidden"}>
            {creating || rule ? (
              <RuleEditor key={creating ? "new" : rule!.id} initial={creating ? undefined : rule}
                onSave={(r) => {
                  if (creating) { addAlarmRule(r); select("alarms", r.id); }
                  else updateAlarmRule(r.id, r);
                }}
                onCancel={creating ? () => select("alarms", "") : undefined}
                onDelete={rule && !creating ? () => removeAlarmRule(rule.id) : undefined} />
            ) : (
              <EmptyState title="Choose a rule, or make one"
                action={<Button variant="primary" icon={<AddIcon size={14} />} onClick={startNew}>New rule</Button>} />
            )}
          </div>
          {view === "live" && <LiveEvents events={events} client={client} />}
          {view === "history" && <History />}
        </section>
      </div>
    </div>
  );
}

// ── The rule editor ────────────────────────────────────────────────────────

type Draft = { name: string; expr: string; severity: AlarmSeverity; message: string };
const draftOf = (r?: AlarmRule): Draft => ({ name: r?.name ?? "", expr: r?.expr ?? "", severity: r?.severity ?? "warning", message: r?.message ?? "" });

function RuleEditor({ initial, onSave, onCancel, onDelete }: {
  initial?: AlarmRule;
  onSave: (r: AlarmRule) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  // The draft is kept outside this tab, so it is still here after a look at another tab.
  const { value: draft, dirty, set: setDraft, revert } = useDraft(initial ? `alarm:${initial.id}` : "alarm:new", draftOf(initial));
  const [pick, setPick] = useState("");
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const check = draft.expr.trim() ? compile(draft.expr) : undefined;
  const problem = !draft.name.trim() ? "Give the rule a name." : !draft.expr.trim() ? "Say when the alarm is active." : check && !check.ok ? check.error : "";
  const reads = check?.ok ? check.expr.refs : [];

  return (
    <div className="p-4 max-w-2xl space-y-4">
      <Field label="Name">
        <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="High pressure" />
      </Field>

      <Field label="Active while"
        hint={check?.ok ? "A valid expression. The alarm is active while it is true." : "Name tags in braces, for example {ns:Tank1/Level} > 95 && {ns:Tank1/InletOpen}"}
        error={check && !check.ok ? check.error : undefined}>
        <Input mono value={draft.expr} onChange={(e) => set({ expr: e.target.value })} placeholder="{ns:Tank1/Level} > 95" />
      </Field>

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-ui-label text-zinc-400 mb-1">Insert a tag</div>
          <BindingInput ariaLabel="Tag to insert" value={pick} onChange={setPick} className="w-full h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-ui font-mono text-zinc-100" />
        </div>
        <Button disabled={!pick} onClick={() => { set({ expr: `${draft.expr}{${pick}}` }); setPick(""); }}>Insert</Button>
      </div>

      {reads.length > 0 && (
        <div className="rounded border border-zinc-800 divide-y divide-zinc-800/70" aria-label="Tags the expression reads">
          <div className="px-3 py-1.5 text-ui-label uppercase tracking-wide text-zinc-500">Reads now</div>
          {reads.map((t) => (
            <div key={t} className="flex items-center gap-3 px-3 py-1.5 text-ui">
              <span className="flex-1 min-w-0 truncate font-mono text-zinc-300" title={t}>{t}</span>
              <LiveValue path={t} className="text-zinc-100" />
            </div>
          ))}
        </div>
      )}

      <fieldset>
        <legend className="text-ui-label text-zinc-400 mb-1">Severity</legend>
        <div className="flex gap-2" role="group" aria-label="Severity">
          {SEVERITIES.map((s) => (
            <Button key={s} variant={draft.severity === s ? "primary" : "secondary"} aria-pressed={draft.severity === s} onClick={() => set({ severity: s })}>{s}</Button>
          ))}
        </div>
      </fieldset>

      <Field label="Message" hint="Shown to the operator with the alarm.">
        <Input value={draft.message} onChange={(e) => set({ message: e.target.value })} placeholder="Pressure exceeded the limit" />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="primary" disabled={!!problem || (!dirty && !!initial)} icon={<CheckIcon size={14} />}
          onClick={() => { onSave({ id: initial?.id ?? uid(), name: draft.name.trim(), expr: draft.expr, severity: draft.severity, message: draft.message }); revert(); }}>
          {initial ? "Save changes" : "Add rule"}
        </Button>
        {initial ? <Button disabled={!dirty} onClick={revert}>Revert</Button> : <Button onClick={() => { revert(); onCancel?.(); }}>Cancel</Button>}
        {problem && (dirty || !initial) && <span className="text-ui-label text-zinc-500">{problem}</span>}
        <div className="flex-1" />
        {onDelete && (confirm ? (
          <>
            <span className="text-ui-label text-red-500">Delete this rule?</span>
            <Button variant="danger" onClick={onDelete}>Delete</Button>
            <Button onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : <Button variant="ghost" icon={<DeleteIcon size={14} />} onClick={() => setConfirm(true)}>Delete</Button>)}
      </div>
    </div>
  );
}

// ── Live events ────────────────────────────────────────────────────────────

function EventCard({ ev, onAck }: { ev: AlarmEvent; onAck?: () => void }) {
  const urgent = needsAttention(ev);
  return (
    <div className={`rounded border px-3 py-2 ${urgent ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40"}`}>
      <div className="flex items-center gap-2">
        <Badge tone={ev.active ? TONE[ev.severity] : "neutral"}>{ev.active ? "active" : "normal"} · {ev.severity}</Badge>
        <span className="flex-1 min-w-0 truncate text-ui font-medium text-zinc-100">{ev.ruleName}</span>
        {urgent && onAck && <Button size="sm" onClick={onAck}>Acknowledge</Button>}
        {ev.acked && <span className="text-ui-label text-zinc-500">acknowledged</span>}
      </div>
      <div className="mt-1 text-ui text-zinc-300">{ev.message || ev.binding}</div>
      {ev.reason && <div className="text-ui-label text-amber-500">Held: {ev.reason}</div>}
      <div className="mt-0.5 font-mono text-ui-label text-zinc-500">
        value {Number(ev.value).toFixed(2)} · {new Date(ev.triggeredAt).toLocaleString()}
        {ev.normalAt && ` · normal ${new Date(ev.normalAt).toLocaleTimeString()}`}
      </div>
    </div>
  );
}

function LiveEvents({ events, client }: { events: AlarmEvent[]; client: ReturnType<typeof useClientAlarms> }) {
  const sorted = byUrgency(events);
  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      {sorted.length === 0 && client.length === 0 && (
        <EmptyState title="No alarms right now">Alarms the runtime raises appear here while the editor is connected to it.</EmptyState>
      )}
      {sorted.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-ui-label font-semibold uppercase tracking-wide text-zinc-400">From the runtime ({sorted.length})</h3>
          {sorted.map((ev) => <EventCard key={ev.id} ev={ev} onAck={() => void ackAlarm(ev.id)} />)}
        </div>
      )}
      {client.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-ui-label font-semibold uppercase tracking-wide text-zinc-400">Evaluated in the editor ({client.length})</h3>
          {client.map((a) => (
            <div key={a.ruleId} className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge tone={TONE[a.severity as AlarmSeverity] ?? "neutral"}>active · {a.severity}</Badge>
                <span className="flex-1 min-w-0 truncate text-ui font-medium text-zinc-100">{a.name}</span>
              </div>
              <div className="mt-1 text-ui text-zinc-300">{a.message}</div>
              <div className="mt-0.5 font-mono text-ui-label text-zinc-500">value {a.value.toFixed(2)} · {new Date(a.since).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────────

const WINDOWS = [
  { id: "3600000", label: "Last hour" },
  { id: "28800000", label: "Last 8 hours" },
  { id: "86400000", label: "Last 24 hours" },
  { id: "604800000", label: "Last 7 days" },
];

function History() {
  const [events, setEvents] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [windowMs, setWindowMs] = useState(WINDOWS[1]!.id);
  const [severity, setSeverity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = (Date.now() - Number(windowMs)) * 1_000_000; // ns
      const r = await apiFetch(`/api/v1/alarms/history?from=${from}&limit=200${severity ? `&severity=${severity}` : ""}`);
      setEvents(r.ok ? ((await r.json()) as AlarmEvent[] | null) ?? [] : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [windowMs, severity]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <Select aria-label="Time window" className="w-40" value={windowMs} onChange={(e) => setWindowMs(e.target.value)}>
          {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </Select>
        <Select aria-label="Severity" className="w-36" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="flex-1" />
        <Button icon={<RefreshIcon size={14} />} onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2">
        {events.length === 0 && !loading && <EmptyState title="No alarm history in this window" />}
        {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </div>
    </div>
  );
}
