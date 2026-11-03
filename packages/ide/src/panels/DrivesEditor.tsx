// Driven properties: each is an expression and an optional transform
// (Phase 3, step 3a). A richer editor with a live preview comes in step 5.
import { useState } from "react";
import { compile } from "@speths-screens/expr";
import { DRIVEN_PROPS, type Drive, type Transform, type TransformKind, type Widget } from "@speths-screens/shared-types";

/** A transform value: a color, text, number or flag (schema TransformValue). */
type TransformValue = string | number | boolean;

type Drives = Record<string, Drive>;

const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
const mono = `${inp} font-mono`;

/** Reads a typed value: true/false, a number, or text. */
export function parseValue(text: string): TransformValue {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text.trim() !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text;
}
const show = (v: TransformValue | undefined) => (v === undefined ? "" : String(v));

const NEW_TRANSFORM: Record<TransformKind, Transform> = {
  linear: { kind: "linear", in: [0, 100], out: [0, 100] },
  thresholds: { kind: "thresholds", steps: [{ above: 80, value: "#d97706" }] },
  map: { kind: "map", cases: [{ equals: 1, value: "" }] },
};

export function DrivesEditor({ w, onChange }: { w: Widget; onChange: (dynamics: Drives | undefined) => void }) {
  const drives: Drives = w.dynamics ?? {};
  const free = (DRIVEN_PROPS[w.type] ?? []).filter((p) => !(p in drives));
  const set = (prop: string, d: Drive | undefined) => {
    const next = { ...drives };
    if (d) next[prop] = d;
    else delete next[prop];
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Dynamics</div>
        {free.length > 0 && (
          <select aria-label="Drive a property" value="" onChange={(e) => e.target.value && set(e.target.value, { expr: "" })}
            className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300">
            <option value="">+ drive a property</option>
            {free.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>
      {Object.keys(drives).length === 0 ? (
        <div className="text-[10px] text-zinc-600 italic">No driven properties.</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(drives).map(([prop, d]) => (
            <DriveCard key={prop} prop={prop} d={d} onChange={(next) => set(prop, next)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DriveCard({ prop, d, onChange }: { prop: string; d: Drive; onChange: (d: Drive | undefined) => void }) {
  const check = d.expr.trim() ? compile(d.expr) : undefined;
  const t = d.transform;
  const setT = (next: Transform | undefined) => onChange(next ? { ...d, transform: next } : { expr: d.expr });
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2 space-y-1.5" data-testid={`drive-${prop}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-zinc-200">{prop}</span>
        <button aria-label={`Stop driving ${prop}`} onClick={() => onChange(undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1">×</button>
      </div>
      <input aria-label={`${prop} expression`} value={d.expr} placeholder="{ns:Tank1/Level} > 80"
        onChange={(e) => onChange({ ...d, expr: e.target.value })} className={mono} />
      {check && !check.ok && <div className="text-[10px] text-red-400">{check.error}</div>}
      <select aria-label={`${prop} transform`} value={t?.kind ?? ""} className={inp}
        onChange={(e) => setT(e.target.value ? NEW_TRANSFORM[e.target.value as TransformKind] : undefined)}>
        <option value="">the expression's value</option>
        <option value="linear">scale (linear)</option>
        <option value="thresholds">steps (thresholds)</option>
        <option value="map">lookup (map)</option>
      </select>
      {t?.kind === "linear" && <LinearFields t={t} onChange={setT} />}
      {t?.kind === "thresholds" && <ThresholdFields t={t} onChange={setT} />}
      {t?.kind === "map" && <MapFields t={t} onChange={setT} />}
    </div>
  );
}

function NumberBox({ label, value, onChange }: { label: string; value: number | undefined; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value ?? ""));
  return (
    <input aria-label={label} title={label} value={text} className={mono}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() && !Number.isNaN(n)) onChange(n); }} />
  );
}

function LinearFields({ t, onChange }: { t: Transform; onChange: (t: Transform) => void }) {
  const [i0, i1] = (t.in ?? [0, 100]) as [number, number];
  const [o0, o1] = (t.out ?? [0, 100]) as [number, number];
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-1 items-center text-[10px] text-zinc-500">
        <span>from</span>
        <NumberBox label="input low" value={i0} onChange={(n) => onChange({ ...t, in: [n, i1] })} />
        <NumberBox label="input high" value={i1} onChange={(n) => onChange({ ...t, in: [i0, n] })} />
        <span>to</span>
        <NumberBox label="output low" value={o0} onChange={(n) => onChange({ ...t, out: [n, o1] })} />
        <NumberBox label="output high" value={o1} onChange={(n) => onChange({ ...t, out: [o0, n] })} />
      </div>
      <label className="flex items-center gap-1 text-[10px] text-zinc-400">
        <input type="checkbox" checked={t.clamp !== false} onChange={(e) => onChange(e.target.checked ? { ...t, clamp: undefined } : { ...t, clamp: false })} />
        keep inside the output range
      </label>
    </div>
  );
}

function Rows<T>({ rows, render, add, label }: { rows: T[]; render: (r: T, i: number) => React.ReactNode; add: () => void; label: string }) {
  return (
    <div className="space-y-1">
      {rows.map((r, i) => <div key={i} className="flex gap-1 items-center">{render(r, i)}</div>)}
      <button onClick={add} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">{label}</button>
    </div>
  );
}

function ThresholdFields({ t, onChange }: { t: Transform; onChange: (t: Transform) => void }) {
  const steps = t.steps ?? [];
  const put = (i: number, s: (typeof steps)[number] | undefined) =>
    onChange({ ...t, steps: s ? steps.map((x, j) => (j === i ? s : x)) : steps.filter((_, j) => j !== i) });
  return (
    <div className="space-y-1">
      <input aria-label="below the first step" placeholder="below the first step (blank: own setting)" value={show(t.below)} className={mono}
        onChange={(e) => onChange({ ...t, below: e.target.value === "" ? undefined : parseValue(e.target.value) })} />
      <Rows rows={steps} label="+ step" add={() => onChange({ ...t, steps: [...steps, { above: (steps.at(-1)?.above ?? 0) + 10, value: "" }] })}
        render={(s, i) => (<>
          <span className="text-[10px] text-zinc-500 shrink-0">from</span>
          <NumberBox label={`step ${i + 1} from`} value={s.above} onChange={(n) => put(i, { ...s, above: n })} />
          <input aria-label={`step ${i + 1} value`} value={show(s.value)} className={mono} onChange={(e) => put(i, { ...s, value: parseValue(e.target.value) })} />
          <button onClick={() => put(i, undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1">×</button>
        </>)} />
    </div>
  );
}

function MapFields({ t, onChange }: { t: Transform; onChange: (t: Transform) => void }) {
  const cases = t.cases ?? [];
  const put = (i: number, c: (typeof cases)[number] | undefined) =>
    onChange({ ...t, cases: c ? cases.map((x, j) => (j === i ? c : x)) : cases.filter((_, j) => j !== i) });
  return (
    <div className="space-y-1">
      <Rows rows={cases} label="+ case" add={() => onChange({ ...t, cases: [...cases, { equals: cases.length + 1, value: "" }] })}
        render={(c, i) => (<>
          <input aria-label={`case ${i + 1} equals`} value={show(c.equals)} className={mono} onChange={(e) => put(i, { ...c, equals: parseValue(e.target.value) })} />
          <span className="text-[10px] text-zinc-500 shrink-0">→</span>
          <input aria-label={`case ${i + 1} value`} value={show(c.value)} className={mono} onChange={(e) => put(i, { ...c, value: parseValue(e.target.value) })} />
          <button onClick={() => put(i, undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1">×</button>
        </>)} />
      <input aria-label="otherwise" placeholder="otherwise (blank: own setting)" value={show(t.default)} className={mono}
        onChange={(e) => onChange({ ...t, default: e.target.value === "" ? undefined : parseValue(e.target.value) })} />
    </div>
  );
}
