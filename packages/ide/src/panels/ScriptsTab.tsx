// The Scripts tab: the runtime scripts of the project as a list on the left, and the chosen script on the right with
// room for its source. Session variables, the values each browser tab keeps for itself, are a second view. The
// editor checks a script as you type (the same check the runtime and a deploy make) and shows its state on the runtime.
import { useMemo, useState } from "react";
import type { Role, RuntimeScript, SessionVar, Type } from "@speths-screens/shared-types";
import { syntaxProblem, writeListProblems } from "@speths-screens/shared-types/scripts";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";
import { hasNoTrigger, triggerSummary, triggerText, useScriptStatus, withTrigger, withWrites, writesText, type ScriptStatus } from "../store/scriptForm";
import { ScriptEditor } from "./ScriptEditor";
import { typedInitial } from "./typedInitial";
import { Badge, Button, Checkbox, Field, IconButton, Input, Select, Tabs } from "../ui";
import { EmptyState, SelectList, TabHeader } from "../ui/Layout";
import { AddIcon, CloseIcon, DeleteIcon } from "../ui/icons";

const ROLES: Role[] = ["operator", "supervisor", "engineer", "admin"];
const TYPES: Type[] = ["bool", "int", "real", "string"];
const NONE_SCRIPTS: RuntimeScript[] = [];
const NONE_VARS: SessionVar[] = [];

type View = "scripts" | "session";

const stateDot = (s?: ScriptStatus) => (!s ? "bg-zinc-600" : s.state === "running" ? (s.lastError ? "bg-amber-500" : "bg-emerald-500") : "bg-red-500");
const stateText = (s?: ScriptStatus) => (!s ? "not on the runtime" : s.state === "running" ? (s.lastError ? "running, with an error" : "running") : "stopped");

export function ScriptsTab() {
  const scripts = useProject((s) => s.project.scripts) ?? NONE_SCRIPTS;
  const vars = useProject((s) => s.project.sessionVars) ?? NONE_VARS;
  const alarmRules = useProject((s) => s.project.alarmRules);
  const datasources = useProject((s) => s.project.datasources);
  const scriptRole = useProject((s) => s.project.scriptRole);
  const { addScript, updateScript, removeScript, setScriptRole } = useProject.getState();
  const chosen = useWorkspace((s) => s.selection.scripts);
  const select = useWorkspace((s) => s.select);
  const status = useScriptStatus();
  const [view, setView] = useState<View>("scripts");

  const script = scripts.find((s) => s.id === chosen) ?? scripts[0];
  const rules = useMemo(() => (alarmRules ?? []).map((r) => ({ id: r.id, name: r.name })), [alarmRules]);
  const ids = useMemo(() => new Set(["ns", ...datasources.map((d) => d.id)]), [datasources]);
  const running = scripts.filter((s) => status.get(s.id)?.state === "running").length;

  const add = () => {
    let n = scripts.length + 1;
    while (scripts.some((s) => s.id === `script${n}`)) n++;
    const id = `script${n}`;
    addScript({ id, name: `Script ${n}`, trigger: { every: 1000 }, source: "// readTag, quality, await writeTag, log, emit; `state` keeps values between runs\n" });
    select("scripts", id);
    setView("scripts");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <TabHeader title="Scripts"
        summary={`${scripts.length} script${scripts.length === 1 ? "" : "s"}${status.size ? ` · ${running} running` : ""}`}
        actions={
          <>
            <label className="flex items-center gap-2 text-ui text-zinc-300 whitespace-nowrap">
              Scripts write as
              <Select aria-label="Role the scripts write as" className="w-32" value={scriptRole ?? "operator"}
                onChange={(e) => setScriptRole(e.target.value === "operator" ? undefined : (e.target.value as Role))}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </label>
            <Button variant="primary" icon={<AddIcon size={14} />} onClick={add}>New script</Button>
          </>
        } />
      <Tabs label="Scripts views" className="px-2 shrink-0" active={view} onSelect={(v) => setView(v as View)}
        tabs={[{ id: "scripts", label: `Scripts (${scripts.length})` }, { id: "session", label: `Session variables (${vars.length})` }]} />

      {view === "session" ? <SessionVariables /> : (
        <div className="flex-1 flex min-h-0">
          <section className="w-72 shrink-0 min-w-0 flex flex-col border-r border-zinc-800">
            {scripts.length === 0 ? (
              <EmptyState title="No scripts yet" action={<Button variant="primary" icon={<AddIcon size={14} />} onClick={add}>New script</Button>}>
                A script is JavaScript the runtime runs by itself: on a timer, when a tag changes, at start or when an alarm is raised.
              </EmptyState>
            ) : (
              <SelectList label="Scripts" className="flex-1 min-h-0" selected={script?.id ?? null} onSelect={(id) => select("scripts", id)}
                items={scripts.map((s) => {
                  const st = status.get(s.id);
                  return {
                    id: s.id,
                    content: (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${stateDot(st)}`} aria-hidden="true" />
                          <span className="flex-1 truncate text-ui font-medium text-zinc-100">{s.name}</span>
                          <span className="sr-only">{stateText(st)}</span>
                          {syntaxProblem(s.source) && <Badge tone="danger">error</Badge>}
                        </div>
                        <div className="truncate text-ui-label text-zinc-500">{triggerSummary(s.trigger)}</div>
                      </div>
                    ),
                  };
                })} />
            )}
          </section>
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            {script
              ? <ScriptPane key={script.id} script={script} rules={rules} datasources={ids} status={status.get(script.id)}
                  onChange={(patch) => updateScript(script.id, patch)} onRemove={() => removeScript(script.id)} />
              : <EmptyState title="Choose a script, or make one" />}
          </section>
        </div>
      )}
    </div>
  );
}

function ScriptPane({ script, rules, datasources, status, onChange, onRemove }: {
  script: RuntimeScript;
  rules: { id: string; name: string }[];
  /** The ids a tag path may start with: the project's datasources and ns. */
  datasources: Set<string>;
  status?: ScriptStatus;
  onChange: (patch: Partial<RuntimeScript>) => void;
  onRemove: () => void;
}) {
  const problem = useMemo(() => syntaxProblem(script.source), [script.source]);
  // The text as typed while the field has the focus, so a comma or a space typed last is not lost.
  const [writesDraft, setWritesDraft] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const writeProblems = writeListProblems(`script ${JSON.stringify(script.id)}`, script.writes, datasources)
    .map((line) => line.slice(line.indexOf(": writes: ") + ": writes: ".length));
  const t = script.trigger;
  const text = triggerText(t);
  const setTrigger = (patch: Parameters<typeof withTrigger>[1]) => onChange({ trigger: withTrigger(t, patch) });

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Field label="Name" className="flex-1"><Input value={script.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
        {confirm ? (
          <>
            <Button variant="danger" onClick={onRemove}>Delete</Button>
            <Button onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : <IconButton label="Delete script" icon={<DeleteIcon size={16} />} onClick={() => setConfirm(true)} />}
      </div>

      <div className="flex items-center gap-2 text-ui-label text-zinc-400" role="status">
        <span className={`h-2 w-2 rounded-full ${stateDot(status)}`} aria-hidden="true" />
        {!status ? "Not on the runtime: deploy the project to run this script." : status.state === "stopped"
          ? <span className="text-red-500">Stopped: {status.reason}</span>
          : `Running, ${status.runs} run${status.runs === 1 ? "" : "s"}${status.dropped > 0 ? `, ${status.dropped} dropped` : ""}`}
        {status?.lastError && <span className="font-mono text-amber-500 truncate" title={status.lastError}>{status.lastError}</span>}
      </div>

      <fieldset className="rounded border border-zinc-800 p-3 space-y-3">
        <legend className="px-1 text-ui-label font-semibold uppercase tracking-wide text-zinc-400">Runs</legend>
        <div className="flex items-end gap-4 flex-wrap">
          <Field label="Every (ms)" className="w-32"><Input value={text.every} onChange={(e) => setTrigger({ every: e.target.value })} placeholder="off" /></Field>
          <Checkbox label="At start" checked={!!t.onStart} onChange={(e) => setTrigger({ onStart: e.target.checked })} />
        </div>
        <Field label="When one of these tags changes" hint="Separate with commas.">
          <Input mono value={text.onChange} onChange={(e) => setTrigger({ onChange: e.target.value })} placeholder="plc:Run, ns:Line1/Temp" />
        </Field>
        {rules.length > 0 && (
          <div>
            <div className="text-ui-label text-zinc-400 mb-1">When one of these alarms is raised or cleared</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {rules.map((r) => (
                <Checkbox key={r.id} label={r.name} checked={!!t.onAlarm?.includes(r.id)}
                  onChange={(e) => setTrigger({ onAlarm: e.target.checked ? [...(t.onAlarm ?? []), r.id] : (t.onAlarm ?? []).filter((x) => x !== r.id) })} />
              ))}
            </div>
          </div>
        )}
        {hasNoTrigger(t) && <div className="text-ui-label text-amber-500">A script needs at least one trigger.</div>}
        {t.every !== undefined && t.every < 100 && <div className="text-ui-label text-amber-500">Every must be at least 100 ms.</div>}
      </fieldset>

      <Field label="May write these tags" hint="Datasource paths, ns: paths, or a prefix ending in *. A script that writes nothing needs no list."
        error={writeProblems.length ? writeProblems.map((l) => `Writes: ${l}`).join(" · ") : undefined}>
        <Input mono value={writesDraft ?? writesText(script)} placeholder="mem:*, plc:Run, ns:Line1/*"
          onChange={(e) => { setWritesDraft(e.target.value); onChange({ writes: withWrites(e.target.value) }); }}
          onBlur={() => setWritesDraft(null)} />
      </Field>
      {script.source.includes("writeTag") && !script.writes?.length && (
        <div className="text-ui-label text-amber-500">The script calls writeTag but has no writes list: every write is refused.</div>
      )}

      <div className="flex-1 min-h-[16rem] flex flex-col gap-1">
        <div className="text-ui-label text-zinc-400">Source</div>
        <div className="flex-1 min-h-0">
          <ScriptEditor kind="runtime" label="Script source" fill value={script.source} onChange={(source) => onChange({ source })} />
        </div>
      </div>
      {problem && <div role="alert" className="font-mono text-ui-label text-red-500">{problem}</div>}
    </div>
  );
}

// ── Session variables ──────────────────────────────────────────────────────

/** Typed values each browser tab keeps for itself, read as {session:name}. */
function SessionVariables() {
  const vars = useProject((s) => s.project.sessionVars) ?? NONE_VARS;
  const { setSessionVars } = useProject.getState();
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
    <div className="flex-1 min-h-0 overflow-auto p-4 max-w-3xl space-y-3">
      <p className="text-ui text-zinc-400">
        Each browser tab keeps its own copy of these. Screens, driven properties and page scripts read them as <code className="text-zinc-200">{"{session:name}"}</code>; nothing reaches the runtime.
      </p>
      {vars.length === 0 && <div className="text-ui text-zinc-500">No session variables yet.</div>}
      {vars.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_2rem] gap-2 px-1 text-ui-label uppercase tracking-wide text-zinc-500">
          <span>Name</span><span>Type</span><span>Starts as</span><span />
        </div>
      )}
      {vars.map((v, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_2rem] gap-2 items-center">
          <Input mono aria-label={`Session variable ${i + 1} name`} value={v.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Select aria-label={`Session variable ${i + 1} type`} value={v.type}
            onChange={(e) => { const type = e.target.value as Type; set(i, { type, initial: typedInitial(type, drafts[i] ?? (v.initial === undefined ? "" : String(v.initial))) }); }}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input mono aria-label={`Session variable ${i + 1} initial value`} placeholder="initial value"
            value={drafts[i] ?? (v.initial === undefined ? "" : String(v.initial))} onChange={(e) => setInitial(i, e.target.value)} />
          <IconButton label={`Remove session variable ${i + 1}`} size="sm" icon={<CloseIcon size={14} />} onClick={() => remove(i)} />
        </div>
      ))}
      <Button icon={<AddIcon size={14} />} onClick={add}>Add variable</Button>
    </div>
  );
}
