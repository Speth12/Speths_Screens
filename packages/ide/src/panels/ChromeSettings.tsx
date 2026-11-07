// The project's header and navigation: the operator screen's own, or custom widgets pinned to the
// screen edges (the frame). Each slot is one custom widget, with the edge it sits on and its size,
// which a tablet or a phone can change.
import type { Device } from "@speths-screens/widgets";
import type { FrameSlot, FrameSlotOverride, Shell } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";

const field = "bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-500";
const EDGES = ["top", "right", "bottom", "left"] as const;
const DEVICES: Device[] = ["desktop", "tablet", "phone"];

function uniqueId(slots: readonly FrameSlot[]): string {
  let n = slots.length + 1;
  while (slots.some((s) => s.id === `slot${n}`)) n++;
  return `slot${n}`;
}

/** The slot with a smaller screen's override changed; an override with nothing left is removed. */
export function withOverride(slot: FrameSlot, device: "tablet" | "phone", patch: FrameSlotOverride): FrameSlot {
  const next: FrameSlotOverride = { ...(slot[device] ?? {}), ...patch };
  for (const k of Object.keys(next) as (keyof FrameSlotOverride)[]) if (next[k] === undefined) delete next[k];
  const { [device]: _old, ...rest } = slot;
  return Object.keys(next).length ? { ...rest, [device]: next } : rest;
}

/** The slot shown on a screen size or not; every size listed (or none named) means all. */
export function withDevice(slot: FrameSlot, device: Device, on: boolean): FrameSlot {
  const current = new Set<Device>(slot.devices ?? DEVICES);
  if (on) current.add(device); else current.delete(device);
  const { devices: _old, ...rest } = slot;
  return current.size === DEVICES.length ? rest : { ...rest, devices: DEVICES.filter((d) => current.has(d)) };
}

export function ChromeSettings() {
  const shell = useProject((s) => s.project.shell);
  const customWidgets = useProject((s) => s.project.customWidgets) ?? [];
  const setShell = useProject((s) => s.setShell);
  const addDefaultChrome = useProject((s) => s.addDefaultChrome);
  const custom = shell?.chrome === "custom";
  const slots = shell?.frame ?? [];

  const put = (patch: Partial<Shell>) => {
    const next: Shell = { ...(shell ?? {}), ...patch };
    for (const k of Object.keys(next) as (keyof Shell)[]) if (next[k] === undefined) delete next[k];
    setShell(next);
  };
  const setSlot = (i: number, slot: FrameSlot) => put({ frame: slots.map((s, j) => (j === i ? slot : s)) });

  return (
    <div className="p-3 space-y-3 text-xs">
      <div role="radiogroup" aria-label="Header and navigation" className="space-y-1.5">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="chrome" checked={!custom} onChange={() => put({ chrome: undefined })} className="mt-0.5" />
          <span><span className="text-zinc-200">Built-in</span><span className="block text-[10px] text-zinc-500">The operator screen's own top bar and navigation.</span></span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="chrome" checked={custom} onChange={() => put({ chrome: "custom" })} className="mt-0.5" />
          <span><span className="text-zinc-200">Custom</span><span className="block text-[10px] text-zinc-500">Custom widgets pinned to the edges of every page.</span></span>
        </label>
      </div>

      {custom && (
        <>
          {slots.length === 0 && <div className="text-[11px] text-zinc-500 italic">No slots yet: the screen shows only the page.</div>}
          {slots.map((slot, i) => (
            <div key={slot.id} data-testid={`slot-${slot.id}`} className="rounded border border-zinc-800 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select aria-label={`${slot.id} custom widget`} className={`${field} flex-1 min-w-0`} value={slot.customWidgetId}
                  onChange={(e) => setSlot(i, { ...slot, customWidgetId: e.target.value })}>
                  {!customWidgets.some((c) => c.id === slot.customWidgetId) && <option value={slot.customWidgetId}>{slot.customWidgetId} (missing)</option>}
                  {customWidgets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button aria-label={`Remove ${slot.id}`} title="Remove this slot" onClick={() => put({ frame: slots.filter((_, j) => j !== i) })}
                  className="text-zinc-600 hover:text-red-400 px-1">×</button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 text-[10px] text-zinc-500">Edge
                  <select aria-label={`${slot.id} edge`} className={field} value={slot.edge} onChange={(e) => setSlot(i, { ...slot, edge: e.target.value as FrameSlot["edge"] })}>
                    {EDGES.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-500">Size (px)
                  <input type="number" min={1} aria-label={`${slot.id} size`} className={`${field} w-16`} value={slot.size}
                    onChange={(e) => setSlot(i, { ...slot, size: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                </label>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                Shown on
                {DEVICES.map((d) => (
                  <label key={d} className="flex items-center gap-1">
                    <input type="checkbox" aria-label={`${slot.id} on ${d}`} checked={!slot.devices || slot.devices.includes(d)}
                      onChange={(e) => setSlot(i, withDevice(slot, d, e.target.checked))} />{d}
                  </label>
                ))}
              </div>
              {(["tablet", "phone"] as const).map((d) => (
                <div key={d} className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="w-12">{d}</span>
                  <select aria-label={`${slot.id} ${d} edge`} className={field} value={slot[d]?.edge ?? ""}
                    onChange={(e) => setSlot(i, withOverride(slot, d, { edge: (e.target.value || undefined) as FrameSlotOverride["edge"] }))}>
                    <option value="">same edge</option>
                    {EDGES.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input type="number" min={1} aria-label={`${slot.id} ${d} size`} placeholder="same size" className={`${field} w-20`} value={slot[d]?.size ?? ""}
                    onChange={(e) => setSlot(i, withOverride(slot, d, { size: e.target.value === "" ? undefined : Math.max(1, Math.round(Number(e.target.value) || 1)) }))} />
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => put({ frame: [...slots, { id: uniqueId(slots), customWidgetId: customWidgets[0]?.id ?? "", edge: "top", size: 60 }] })}
              disabled={customWidgets.length === 0} title={customWidgets.length === 0 ? "Make a custom widget first" : undefined}
              className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300">+ Add slot</button>
            <button onClick={addDefaultChrome} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="Adds the default header and navigation custom widgets, and a slot for each, if the project does not have them">Add the default header and navigation</button>
          </div>
        </>
      )}
    </div>
  );
}
