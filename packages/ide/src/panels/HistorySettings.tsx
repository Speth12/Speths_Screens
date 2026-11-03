// History settings: what the runtime's historian stores and for how long
// (the project's "historian" section).
import type { HistorianSettings, HistorianTagRule } from "@speths-screens/shared-types";

const inp = "bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

/** Drops empty fields; undefined when nothing is set (the runtime's defaults). */
export function cleanHistorian(h: HistorianSettings): HistorianSettings | undefined {
  const out: HistorianSettings = {};
  if (h.deadband) out.deadband = h.deadband;
  if (h.retentionDays) out.retentionDays = h.retentionDays;
  if (h.tags?.length) out.tags = h.tags;
  return Object.keys(out).length ? out : undefined;
}

/** "" → undefined, otherwise a non-negative number. */
function num(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function HistorySettings({ value, onChange }: {
  value: HistorianSettings | undefined;
  onChange: (h: HistorianSettings | undefined) => void;
}) {
  const h = value ?? {};
  const tags = h.tags ?? [];
  const set = (patch: Partial<HistorianSettings>) => onChange(cleanHistorian({ ...h, ...patch }));
  const setTag = (i: number, patch: Partial<HistorianTagRule>) =>
    set({ tags: tags.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">History</div>
      <div className="space-y-2">
        <label className="block">
          <div className="text-[10px] text-zinc-500 mb-0.5">Deadband (blank = store every change)</div>
          <input aria-label="Default deadband" type="number" min={0} step="any" value={h.deadband ?? ""}
            onChange={(e) => set({ deadband: num(e.target.value) })} placeholder="0" className={`w-full ${inp}`} />
        </label>
        <label className="block">
          <div className="text-[10px] text-zinc-500 mb-0.5">Keep history for (days)</div>
          <input aria-label="Days kept" type="number" min={1} step={1} value={h.retentionDays ?? ""}
            onChange={(e) => { const d = num(e.target.value); set({ retentionDays: d && d >= 1 ? Math.round(d) : undefined }); }}
            placeholder="runtime default (7)" className={`w-full ${inp}`} />
        </label>
        <div className="text-[10px] text-zinc-500">Tags (plc1:path, or end with * for a group)</div>
        {tags.map((t, i) => (
          <div key={i} className="flex items-center gap-1">
            <input aria-label={`Rule ${i + 1} tag`} value={t.path} onChange={(e) => setTag(i, { path: e.target.value })}
              placeholder="plc1:Arp.Plc.Eclr/rTemp" className={`flex-1 min-w-0 ${inp}`} />
            <input aria-label={`Rule ${i + 1} deadband`} type="number" min={0} step="any" value={t.deadband ?? ""}
              onChange={(e) => setTag(i, { deadband: num(e.target.value) })} placeholder="±" title="Deadband for these tags"
              className={`w-14 ${inp}`} />
            <label className="flex items-center gap-1 text-[10px] text-zinc-400" title="Store these tags">
              <input aria-label={`Rule ${i + 1} store`} type="checkbox" checked={t.store !== false}
                onChange={(e) => setTag(i, { store: e.target.checked ? undefined : false })} className="accent-blue-500" />
              store
            </label>
            <button aria-label={`Remove rule ${i + 1}`} onClick={() => set({ tags: tags.filter((_, j) => j !== i) })}
              className="text-zinc-500 hover:text-red-400 text-xs px-1">×</button>
          </div>
        ))}
        <button onClick={() => set({ tags: [...tags, { path: "" }] })}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">+ tag rule</button>
      </div>
    </div>
  );
}
