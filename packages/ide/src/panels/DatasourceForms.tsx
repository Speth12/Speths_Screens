// The tag lists of the two datasources that hold no connection: memory tags (values the runtime keeps) and
// calculated tags (expressions over other tags). Used when adding one and when editing it later.
import type { CalculatedTag, MemoryTag } from "@speths-screens/shared-types";
import { compile } from "@speths-screens/expr";
import { typedInitial } from "./typedInitial";

/** A memory tag as the form edits it: the initial value is text until saved. */
export type MemoryRow = { path: string; type: MemoryTag["type"]; initial: string; retain: boolean };

/** A form row as the project's MemoryTag: the initial value read as its type;
 *  blank (or text that is not of the type) leaves it out, so the tag starts
 *  at false, 0 or empty text. */
export function memoryTag(r: MemoryRow): MemoryTag {
  const initial = typedInitial(r.type, r.initial);
  return { path: r.path.trim(), type: r.type, ...(initial !== undefined ? { initial } : {}), ...(r.retain ? { retain: true } : {}) };
}

/** A project's memory tag as the form edits it. */
export const memoryRow = (t: MemoryTag): MemoryRow => ({ path: t.path, type: t.type, initial: t.initial === undefined ? "" : String(t.initial), retain: !!t.retain });

const cell = "bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono";

export function MemoryRowsEditor({ rows, onChange, maxHeight = "11rem", wide = false }: { rows: MemoryRow[]; onChange: (rows: MemoryRow[]) => void; maxHeight?: string; wide?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-300">Memory Tags</span>
        <button onClick={() => onChange([...rows, { path: "", type: "real", initial: "", retain: false }])} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add tag</button>
      </div>
      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight }}>
        {rows.map((row, i) => {
          const set = (patch: Partial<MemoryRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
          return (
            <div key={i} className="flex gap-1.5 items-center">
              <input aria-label={`memory tag ${i + 1} path`} value={row.path} onChange={(e) => set({ path: e.target.value })} placeholder="Batch/Count" className={`${wide ? "w-72" : "w-28"} shrink-0 ${cell}`} />
              <select aria-label={`memory tag ${i + 1} type`} value={row.type} onChange={(e) => set({ type: e.target.value as MemoryRow["type"] })} className="bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-[11px]">
                <option value="bool">bool</option><option value="int">int</option><option value="real">real</option><option value="string">string</option>
              </select>
              <input aria-label={`memory tag ${i + 1} initial`} value={row.initial} onChange={(e) => set({ initial: e.target.value })} placeholder="initial" className={`flex-1 min-w-0 ${cell}`} />
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 shrink-0" title="Keep the value across a runtime restart">
                <input type="checkbox" checked={row.retain} onChange={(e) => set({ retain: e.target.checked })} />keep
              </label>
              <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 text-xs px-1" aria-label={`remove memory tag ${i + 1}`}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalculatedRowsEditor({ rows, onChange, maxHeight = "11rem", wide = false }: { rows: CalculatedTag[]; onChange: (rows: CalculatedTag[]) => void; maxHeight?: string; wide?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-zinc-300">Computed Tags</span>
        <button onClick={() => onChange([...rows, { path: "", expr: "" }])} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add tag</button>
      </div>
      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight }}>
        {rows.map((row, i) => {
          const check = row.expr.trim() ? compile(row.expr) : undefined;
          return (
            <div key={i}>
              <div className="flex gap-1.5 items-center">
                <input aria-label={`computed tag ${i + 1} name`} value={row.path} onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)))} placeholder="tagName" className={`${wide ? "w-56" : "w-24"} shrink-0 ${cell}`} />
                <span className="text-zinc-600 text-[10px] shrink-0">=</span>
                <input aria-label={`computed tag ${i + 1} expression`} value={row.expr} onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, expr: e.target.value } : r)))} placeholder="{ds:path} * 9/5 + 32" className={`flex-1 min-w-0 ${cell}`} />
                <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 text-xs px-1" aria-label={`remove computed tag ${i + 1}`}>×</button>
              </div>
              {check && !check.ok && <div className="text-[10px] text-red-600 pl-[6.5rem] mt-0.5">{check.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
