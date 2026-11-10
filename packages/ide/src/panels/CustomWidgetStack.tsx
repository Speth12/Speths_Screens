// The stack part of the custom widget editor: how the parts are laid out, a live preview of that
// layout on each screen size, and how one part takes room.
import type { Device } from "@speths-screens/widgets";
import { DEVICE_WIDTH, partStyle, stackFor, stackStyle } from "@speths-screens/widgets";
import type { CustomWidgetLayout, CustomWidgetPart } from "@speths-screens/shared-types";
import { movePart, setLayoutField, setLayoutMode, setPartFlex, setPartHiddenOn, shownFlex, type StackField } from "../store/customWidgetLayout";
import { ArrowUpIcon, ArrowDownIcon } from "../ui/icons";

const DEVICES: Device[] = ["desktop", "tablet", "phone"];
const field = "bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-500";

const DIRECTIONS = [["row", "Row"], ["column", "Column"]] as const;
const JUSTIFY = [["start", "Start"], ["center", "Center"], ["end", "End"], ["between", "Spread"]] as const;
const ALIGN = [["start", "Start"], ["center", "Center"], ["end", "End"], ["stretch", "Stretch"]] as const;

/** The value a layout field has on a device, as the screen would use it (inherited from a larger size). */
function shown(layout: CustomWidgetLayout, device: Device, key: StackField): unknown {
  const own = (device === "desktop" ? layout : layout[device]) as Record<string, unknown> | undefined;
  if (own?.[key] !== undefined) return own[key];
  return stackFor(layout, device)?.[key];
}

export function LayoutStrip({ layout, device, onDevice, onChange }: {
  layout: CustomWidgetLayout | undefined;
  device: Device;
  onDevice: (d: Device) => void;
  onChange: (l: CustomWidgetLayout | undefined) => void;
}) {
  const stack = layout?.mode === "stack";
  const set = (key: StackField, value: unknown) => onChange(setLayoutField(layout, device, key, value));
  const num = (key: StackField, label: string) => (
    <label className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">{label}
      <input type="number" min={0} aria-label={label} className={`${field} w-14`} value={String(shown(layout!, device, key) ?? 0)}
        onChange={(e) => set(key, Math.max(0, Math.round(Number(e.target.value) || 0)))} />
    </label>
  );
  const pick = (key: StackField, label: string, options: readonly (readonly [string, string])[]) => (
    <label className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">{label}
      <select aria-label={label} className={field} value={String(shown(layout!, device, key))} onChange={(e) => set(key, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/60 shrink-0 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Layout:</span>
      <select aria-label="Layout mode" className={field} value={stack ? "stack" : "free"}
        onChange={(e) => onChange(setLayoutMode(layout, e.target.value as "free" | "stack"))}>
        <option value="free">Free (place each part)</option>
        <option value="stack">Stack (parts follow each other)</option>
      </select>
      {stack && (
        <>
          <div className="flex rounded overflow-hidden border border-zinc-700 shrink-0" role="group" aria-label="Screen size">
            {DEVICES.map((d) => (
              <button key={d} onClick={() => onDevice(d)} aria-pressed={d === device}
                className={`px-2 py-0.5 text-[10px] ${d === device ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>{d}</button>
            ))}
          </div>
          {pick("direction", "Direction", DIRECTIONS)}
          {num("gap", "Gap")}
          {num("padding", "Padding")}
          {pick("justify", "Along", JUSTIFY)}
          {pick("align", "Across", ALIGN)}
          <label className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
            <input type="checkbox" aria-label="Wrap" checked={!!shown(layout!, device, "wrap")} onChange={(e) => set("wrap", e.target.checked || undefined)} />Wrap
          </label>
          {device !== "desktop" && <span className="text-[9px] text-zinc-600 shrink-0">changes apply to {device === "tablet" ? "tablets and phones" : "phones"}</span>}
        </>
      )}
    </div>
  );
}

/** The parts in the order the stack lays them out, with the stack drawn at the chosen screen size. */
export function StackPreview({ layout, parts, device, selected, onSelect, onReorder }: {
  layout: CustomWidgetLayout;
  parts: CustomWidgetPart[];
  device: Device;
  selected: string | null;
  onSelect: (localId: string | null) => void;
  onReorder: (parts: CustomWidgetPart[]) => void;
}) {
  const spec = stackFor(layout, device)!;
  const width = DEVICE_WIDTH[device];
  return (
    <div className="flex-1 overflow-auto p-6 bg-zinc-950 flex flex-col items-center gap-3" onClick={() => onSelect(null)}>
      <div className="text-[9px] text-zinc-600">{device} · {width} px wide · the parts as the stack places them</div>
      <div className="border border-zinc-700 rounded bg-zinc-900/40 overflow-hidden" aria-label="Stack preview"
        style={{ width, maxWidth: "100%", height: spec.direction === "column" ? 420 : 160, minHeight: 60, ...stackStyle(spec) }}>
        {parts.map((p) => {
          const style = partStyle(p, spec, device);
          if (!style) return null;
          return (
            <div key={p.localId} style={style} onClick={(e) => { e.stopPropagation(); onSelect(p.localId); }}
              className={`rounded border-2 px-1.5 py-1 text-[10px] cursor-pointer overflow-hidden ${p.localId === selected ? "border-blue-400 bg-zinc-800" : "border-zinc-600 bg-zinc-800/50 hover:border-zinc-500"}`}>
              <div className="uppercase tracking-wider text-zinc-400">{p.type}</div>
              {p.props?.label ? <div className="text-zinc-300 truncate">{String(p.props.label)}</div> : null}
            </div>
          );
        })}
      </div>
      <ol className="w-full max-w-md text-[11px] text-zinc-400 space-y-1" aria-label="Part order">
        {parts.map((p, i) => (
          <li key={p.localId} className={`flex items-center gap-2 rounded px-2 py-1 ${p.localId === selected ? "bg-zinc-800" : "bg-zinc-900/60"}`}
            onClick={(e) => { e.stopPropagation(); onSelect(p.localId); }}>
            <span className="flex-1 truncate">{i + 1}. {p.type}{p.props?.label ? ` · ${String(p.props.label)}` : ""}</span>
            <button aria-label={`Move ${p.localId} earlier`} disabled={i === 0} className="px-1 disabled:opacity-30 hover:text-zinc-100"
              onClick={(e) => { e.stopPropagation(); onReorder(movePart(parts, i, -1)); }}><ArrowUpIcon size={12} /></button>
            <button aria-label={`Move ${p.localId} later`} disabled={i === parts.length - 1} className="px-1 disabled:opacity-30 hover:text-zinc-100"
              onClick={(e) => { e.stopPropagation(); onReorder(movePart(parts, i, 1)); }}><ArrowDownIcon size={12} /></button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** How one part takes room in the stack. */
export function PartFlexFields({ part, device, onChange }: { part: CustomWidgetPart; device: Device; onChange: (p: CustomWidgetPart) => void }) {
  return (
    <div className="space-y-2 pt-3 mt-3 border-t border-zinc-800">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">In the stack{device !== "desktop" ? ` (${device})` : ""}</div>
      <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">Grow
        <input type="number" min={0} step={1} aria-label="Grow" className={`${field} w-16`} value={shownFlex(part, device, "grow")}
          onChange={(e) => onChange(setPartFlex(part, device, { grow: Math.max(0, Number(e.target.value) || 0) }))} />
      </label>
      <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">Size (px, 0 = from the grid)
        <input type="number" min={0} aria-label="Basis" className={`${field} w-16`} value={shownFlex(part, device, "basis")}
          onChange={(e) => onChange(setPartFlex(part, device, { basis: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
      </label>
      {(["tablet", "phone"] as const).map((size) => (
        <label key={size} className="flex items-center gap-2 text-[11px] text-zinc-400">
          <input type="checkbox" aria-label={`Hide on ${size}`} checked={!!part.hiddenOn?.includes(size)}
            onChange={(e) => onChange(setPartHiddenOn(part, size, e.target.checked))} />Hide on {size}
        </label>
      ))}
    </div>
  );
}
