// Driven properties: each is an expression and an optional transform. Each
// card shows, live, what the expression gives now and what the property
// becomes (Phase 3, steps 3a and 5).
import { useMemo, useState } from "react";
import { compile, type Input } from "@speths-screens/expr";
import { DRIVEN_PROPS, type Drive, type Transform, type TransformKind, type Widget } from "@speths-screens/shared-types";
import { DRIVEN_KIND, applyTransform, suit } from "@speths-screens/widgets";
import { useTags } from "../hooks/useTags";
import type { TagState } from "../store/tagStoreClient";
import { BindingInput } from "./BindingInput";
import { CloseIcon } from "../ui/icons";

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
const quoted = (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v));

const NEW_TRANSFORM: Record<TransformKind, Transform> = {
  linear: { kind: "linear", in: [0, 100], out: [0, 100] },
  thresholds: { kind: "thresholds", steps: [{ above: 80, value: "#d97706" }] },
  map: { kind: "map", cases: [{ equals: 1, value: "" }] },
};

/** The functions of the expression language, for the reference under the box. */
const FUNCTIONS = [
  "abs(x)", "min(a, b, …)", "max(a, b, …)", "clamp(x, lo, hi)", "round(x, digits)", "floor(x)", "ceil(x)", "sqrt(x)",
  "avg(a, b, …)", "sum(a, b, …)", "map(x, inLo, inHi, outLo, outHi)", "sign(x)", "pow(x, y)", "sin cos tan log log10 log2",
  "bit(word, n)", "format(x, decimals)", "good({tag})",
];

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
            <DriveCard key={prop} prop={prop} d={d} valueTag={w.bindings?.value} onChange={(next) => set(prop, next)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DriveCard({ prop, d, valueTag, onChange }: { prop: string; d: Drive; valueTag?: string; onChange: (d: Drive | undefined) => void }) {
  const check = d.expr.trim() ? compile(d.expr) : undefined;
  const [pick, setPick] = useState("");
  const t = d.transform;
  const color = DRIVEN_KIND[prop] === "color";
  const setT = (next: Transform | undefined) => onChange(next ? { ...d, transform: next } : { expr: d.expr });
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2 space-y-1.5" data-testid={`drive-${prop}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-zinc-200">{prop}</span>
        <button aria-label={`Stop driving ${prop}`} onClick={() => onChange(undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1"><CloseIcon size={14} /></button>
      </div>
      <input aria-label={`${prop} expression`} value={d.expr} placeholder="{ns:Tank1/Level} > 80"
        onChange={(e) => onChange({ ...d, expr: e.target.value })} className={mono} />
      {check && !check.ok && <div className="text-[10px] text-red-400">{check.error}</div>}
      <div className="flex gap-1 items-center">
        <BindingInput value={pick} onChange={setPick} className={`${mono} text-[10px]`} />
        <button disabled={!pick} onClick={() => { onChange({ ...d, expr: `${d.expr}{${pick}}` }); setPick(""); }}
          className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 shrink-0">insert tag</button>
      </div>
      <details className="text-[10px] text-zinc-500">
        <summary className="cursor-pointer">functions, and value for the widget's tag</summary>
        <div className="font-mono mt-1 leading-relaxed">{FUNCTIONS.join(" · ")}</div>
      </details>
      <select aria-label={`${prop} transform`} value={t?.kind ?? ""} className={inp}
        onChange={(e) => setT(e.target.value ? NEW_TRANSFORM[e.target.value as TransformKind] : undefined)}>
        <option value="">the expression's value</option>
        <option value="linear">scale (linear)</option>
        <option value="thresholds">steps (thresholds)</option>
        <option value="map">lookup (map)</option>
      </select>
      {t?.kind === "linear" && <LinearFields t={t} onChange={setT} />}
      {t?.kind === "thresholds" && <ThresholdFields t={t} color={color} onChange={setT} />}
      {t?.kind === "map" && <MapFields t={t} color={color} onChange={setT} />}
      {check?.ok && <LivePreview prop={prop} d={d} valueTag={valueTag} />}
    </div>
  );
}

function input(s: TagState | undefined): Input | undefined {
  if (!s || (s.quality === "Unknown" && (s.value === null || s.value === undefined))) return undefined;
  return { value: s.value, quality: s.quality };
}

/** What the expression gives now, and what the property becomes, from the
 *  IDE's live tag values: the same steps the screen takes. */
export function LivePreview({ prop, d, valueTag }: { prop: string; d: Drive; valueTag?: string }) {
  const c = useMemo(() => compile(d.expr), [d.expr]);
  const paths = useMemo(() => (c.ok ? [...c.expr.refs, ...(c.expr.usesValue && valueTag ? [valueTag] : [])] : []), [c, valueTag]);
  const vals = useTags(paths);
  if (!c.ok) return null;
  const r = c.expr.eval({ tag: (ref) => input(vals[ref]), value: () => (valueTag ? input(vals[valueTag]) : undefined) });
  if (!r.ok) {
    return <div className="text-[10px] text-amber-400" data-testid="drive-preview">now unknown: {r.reason}; {prop} keeps its own setting</div>;
  }
  const after = applyTransform(r.value, d.transform);
  const v = after === undefined ? undefined : suit(prop, after);
  return (
    <div className="text-[10px] text-zinc-400 flex items-center gap-1" data-testid="drive-preview">
      <span>now {quoted(r.value)}</span>
      {d.transform && <span>→ {after === undefined ? "no step" : quoted(after)}</span>}
      {v === undefined
        ? <span className="text-amber-400">; not a {DRIVEN_KIND[prop] ?? "value"} for {prop}, which keeps its own setting</span>
        : <span>→ {prop} = {quoted(v)}</span>}
      {v !== undefined && DRIVEN_KIND[prop] === "color" && <span className="inline-block w-3 h-3 rounded-sm border border-zinc-700" style={{ background: String(v) }} />}
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

/** A transform value: text, with a color swatch for color properties. */
function ValueBox({ label, value, color, blank, onChange }: {
  label: string; value: TransformValue | undefined; color: boolean; blank?: string; onChange: (v: TransformValue | undefined) => void;
}) {
  const hex = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="flex gap-1 items-center flex-1 min-w-0">
      {color && (
        <input type="color" aria-label={`${label} color`} value={hex} onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 shrink-0 bg-transparent border border-zinc-700 rounded" />
      )}
      <input aria-label={label} placeholder={blank} value={show(value)} className={mono}
        onChange={(e) => onChange(blank !== undefined && e.target.value === "" ? undefined : parseValue(e.target.value))} />
    </div>
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

function ThresholdFields({ t, color, onChange }: { t: Transform; color: boolean; onChange: (t: Transform) => void }) {
  const steps = t.steps ?? [];
  const put = (i: number, s: (typeof steps)[number] | undefined) =>
    onChange({ ...t, steps: s ? steps.map((x, j) => (j === i ? s : x)) : steps.filter((_, j) => j !== i) });
  return (
    <div className="space-y-1">
      <ValueBox label="below the first step" blank="below the first step (blank: own setting)" value={t.below} color={color}
        onChange={(v) => onChange({ ...t, below: v })} />
      <Rows rows={steps} label="+ step" add={() => onChange({ ...t, steps: [...steps, { above: (steps.at(-1)?.above ?? 0) + 10, value: "" }] })}
        render={(s, i) => (<>
          <span className="text-[10px] text-zinc-500 shrink-0">from</span>
          <NumberBox label={`step ${i + 1} from`} value={s.above} onChange={(n) => put(i, { ...s, above: n })} />
          <ValueBox label={`step ${i + 1} value`} value={s.value} color={color} onChange={(v) => put(i, { ...s, value: v ?? "" })} />
          <button aria-label="Remove" onClick={() => put(i, undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1"><CloseIcon size={14} /></button>
        </>)} />
    </div>
  );
}

function MapFields({ t, color, onChange }: { t: Transform; color: boolean; onChange: (t: Transform) => void }) {
  const cases = t.cases ?? [];
  const put = (i: number, c: (typeof cases)[number] | undefined) =>
    onChange({ ...t, cases: c ? cases.map((x, j) => (j === i ? c : x)) : cases.filter((_, j) => j !== i) });
  return (
    <div className="space-y-1">
      <Rows rows={cases} label="+ case" add={() => onChange({ ...t, cases: [...cases, { equals: cases.length + 1, value: "" }] })}
        render={(c, i) => (<>
          <input aria-label={`case ${i + 1} equals`} value={show(c.equals)} className={mono} onChange={(e) => put(i, { ...c, equals: parseValue(e.target.value) })} />
          <span className="text-[10px] text-zinc-500 shrink-0">→</span>
          <ValueBox label={`case ${i + 1} value`} value={c.value} color={color} onChange={(v) => put(i, { ...c, value: v ?? "" })} />
          <button aria-label="Remove" onClick={() => put(i, undefined)} className="text-zinc-600 hover:text-red-400 text-xs px-1"><CloseIcon size={14} /></button>
        </>)} />
      <ValueBox label="otherwise" blank="otherwise (blank: own setting)" value={t.default} color={color}
        onChange={(v) => onChange({ ...t, default: v })} />
    </div>
  );
}
