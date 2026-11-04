// Runtime scripts (Phase 4): JavaScript the runtime runs on its own, on a
// trigger. The editor checks the source as you type (the same check the
// runtime and deploy make) and shows each script's state on the runtime.
import { useEffect, useMemo, useState } from "react";
import type { Role, RuntimeScript, ScriptTrigger, SessionVar, Type } from "@speths-screens/shared-types";
import { syntaxProblem } from "@speths-screens/shared-types/scripts";
import { useProject } from "../store/projectStore";
import { apiFetch } from "../store/runtimeAuth";
import { ScriptEditor } from "./ScriptEditor";
import { typedInitial } from "./typedInitial";

/** One script's state on the runtime, from GET /api/v1/scripts. */
export interface ScriptStatus {
  id: string;
  state: "running" | "stopped";
  reason?: string;
  runs: number;
  lastError?: string;
  interrupts: number;
  dropped: number;
}

const ROLES: Role[] = ["operator", "supervisor", "engineer", "admin"];

const field = "w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px]";

/** The triggers as the form edits them. */
export function triggerText(t: ScriptTrigger): { every: string; onChange: string } {
  return { every: t.every ? String(t.every) : "", onChange: (t.onChange ?? []).join(", ") };
}

/** Applies a form change to a trigger, leaving out empty parts. */
export function withTrigger(t: ScriptTrigger, patch: { every?: string; onChange?: string; onStart?: boolean; onAlarm?: string[] }): ScriptTrigger {
  const next: ScriptTrigger = { ...t };
  if (patch.every !== undefined) {
    const n = Number(patch.every);
    if (patch.every.trim() === "" || !Number.isFinite(n)) delete next.every;
    else next.every = Math.round(n);
  }
  if (patch.onChange !== undefined) {
    const paths = patch.onChange.split(",").map((p) => p.trim()).filter(Boolean);
    if (paths.length) next.onChange = paths;
    else delete next.onChange;
  }
  if (patch.onStart !== undefined) {
    if (patch.onStart) next.onStart = true;
    else delete next.onStart;
  }
  if (patch.onAlarm !== undefined) {
    if (patch.onAlarm.length) next.onAlarm = patch.onAlarm;
    else delete next.onAlarm;
  }
  return next;
}

function useScriptStatus(): Map<string, ScriptStatus> {
  const [status, setStatus] = useState(new Map<string, ScriptStatus>());
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await apiFetch("/api/v1/scripts");
        if (res.ok && !stop) {
          const list = (await res.json()) as ScriptStatus[];
          setStatus(new Map(list.map((s) => [s.id, s])));
        }
      } catch {
        // No runtime reachable: no status to show.
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return status;
}

export function Scripts() {
  const { project, addScript, updateScript, removeScript, setScriptRole } = useProject();
  const scripts = project.scripts ?? [];
  const rules = project.alarmRules ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const status = useScriptStatus();

  const add = () => {
    let n = scripts.length + 1;
    while (scripts.some((s) => s.id === `script${n}`)) n++;
    const id = `script${n}`;
    addScript({ id, name: `Script ${n}`, trigger: { every: 1000 }, source: "// readTag, quality, await writeTag, log, emit; `state` keeps values between runs\n" });
    setOpen(id);
  };

  return (
    <div className="space-y-2 text-[11px]">
      <label className="flex items-center gap-2 text-zinc-400">
        Scripts write as
        <select aria-label="script role" value={project.scriptRole ?? "operator"} onChange={(e) => setScriptRole(e.target.value === "operator" ? undefined : (e.target.value as Role))} className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {scripts.map((s) => (
        <ScriptRow key={s.id} script={s} rules={rules.map((r) => ({ id: r.id, name: r.name }))} status={status.get(s.id)}
          open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
          onChange={(patch) => updateScript(s.id, patch)} onRemove={() => removeScript(s.id)} />
      ))}
      <button onClick={add} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add script</button>
    </div>
  );
}

function ScriptRow({ script, rules, status, open, onToggle, onChange, onRemove }: {
  script: RuntimeScript;
  rules: { id: string; name: string }[];
  status?: ScriptStatus;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<RuntimeScript>) => void;
  onRemove: () => void;
}) {
  const problem = useMemo(() => syntaxProblem(script.source), [script.source]);
  const t = script.trigger;
  const text = triggerText(t);
  const setTrigger = (patch: Parameters<typeof withTrigger>[1]) => onChange({ trigger: withTrigger(t, patch) });
  const dot = !status ? "bg-zinc-600" : status.state === "running" ? (status.lastError ? "bg-amber-500" : "bg-emerald-500") : "bg-red-500";
  const noTrigger = !t.every && !t.onStart && !t.onChange?.length && !t.onAlarm?.length;

  return (
    <div className="border border-zinc-800 rounded">
      <div className="flex items-center gap-2 px-2 py-1 cursor-pointer group" onClick={onToggle}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={status ? `${status.state}, ${status.runs} runs` : "not on the runtime"} />
        <span className="flex-1 truncate">{script.name}</span>
        {problem && <span className="text-red-400" title={problem}>!</span>}
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove script" className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400">×</button>
      </div>
      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          <input aria-label="script name" value={script.name} onChange={(e) => onChange({ name: e.target.value })} className={field} />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-1 text-zinc-400">every
              <input aria-label="every ms" value={text.every} onChange={(e) => setTrigger({ every: e.target.value })} placeholder="ms" className={field} />
            </label>
            <label className="flex items-center gap-1 text-zinc-400">
              <input type="checkbox" checked={!!t.onStart} onChange={(e) => setTrigger({ onStart: e.target.checked })} />on start
            </label>
          </div>
          <input aria-label="on change" value={text.onChange} onChange={(e) => setTrigger({ onChange: e.target.value })} placeholder="on change: plc:Run, ns:Line1/Temp" className={`${field} font-mono`} />
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-x-2 text-zinc-400">on alarm:
              {rules.map((r) => (
                <label key={r.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={!!t.onAlarm?.includes(r.id)}
                    onChange={(e) => setTrigger({ onAlarm: e.target.checked ? [...(t.onAlarm ?? []), r.id] : (t.onAlarm ?? []).filter((x) => x !== r.id) })} />
                  {r.name}
                </label>
              ))}
            </div>
          )}
          {noTrigger && <div className="text-amber-400">A script needs at least one trigger.</div>}
          {t.every !== undefined && t.every < 100 && <div className="text-amber-400">every must be at least 100 ms.</div>}
          <ScriptEditor kind="runtime" label="script source" value={script.source} onChange={(source) => onChange({ source })} />
          {problem && <div className="text-red-400 font-mono">{problem}</div>}
          {status && (
            <div className="text-zinc-500">
              {status.state === "stopped" ? <span className="text-red-400">stopped: {status.reason}</span> : `running, ${status.runs} runs`}
              {status.dropped > 0 && `, ${status.dropped} dropped`}
              {status.lastError && <div className="text-amber-400 font-mono truncate" title={status.lastError}>{status.lastError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TYPES: Type[] = ["bool", "int", "real", "string"];

/** Session variables: typed values each browser tab keeps for itself, read
 *  as {session:name}. */
export function SessionVars() {
  const { project, setSessionVars } = useProject();
  const vars = project.sessionVars ?? [];
  // The initial values as typed, so text that is not yet a number stays.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const set = (i: number, patch: Partial<SessionVar>) => setSessionVars(vars.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const setInitial = (i: number, raw: string) => {
    setDrafts((d) => ({ ...d, [i]: raw }));
    set(i, { initial: typedInitial(vars[i]!.type, raw) }); // undefined: not saved
  };
  const add = () => {
    let n = vars.length + 1;
    while (vars.some((v) => v.name === `var${n}`)) n++;
    setSessionVars([...vars, { name: `var${n}`, type: "int" }]);
  };
  const remove = (i: number) => {
    setDrafts({});
    setSessionVars(vars.filter((_, j) => j !== i));
  };
  return (
    <div className="space-y-1.5 text-[11px]">
      {vars.map((v, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input aria-label={`session variable ${i + 1} name`} value={v.name} onChange={(e) => set(i, { name: e.target.value })} className="w-24 shrink-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono" />
          <select aria-label={`session variable ${i + 1} type`} value={v.type} onChange={(e) => { const type = e.target.value as Type; set(i, { type, initial: typedInitial(type, drafts[i] ?? (v.initial === undefined ? "" : String(v.initial))) }); }} className="bg-zinc-950 border border-zinc-800 rounded px-1 py-1">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input aria-label={`session variable ${i + 1} initial`} value={drafts[i] ?? (v.initial === undefined ? "" : String(v.initial))} onChange={(e) => setInitial(i, e.target.value)} placeholder="initial" className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 font-mono" />
          <button onClick={() => remove(i)} title="Remove variable" className="text-zinc-600 hover:text-red-400 px-1">×</button>
        </div>
      ))}
      <button onClick={add} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add variable</button>
      <div className="text-[10px] text-zinc-600">Each browser tab keeps its own; read them as <code className="text-zinc-400">{"{session:name}"}</code>.</div>
    </div>
  );
}
