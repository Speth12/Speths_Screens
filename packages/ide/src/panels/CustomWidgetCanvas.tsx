// What the editor shows around a custom widget open on the canvas: a bar above the canvas saying
// what is being edited and the way back to the page, the custom widget's own properties when no
// part is selected (name, designed size, parameters), and a part's anchors.
import { useEffect, useState } from "react";
import type { AnchorX, AnchorY, CustomWidget, CustomWidgetParam } from "@speths-screens/shared-types";
import { partsExtent } from "../store/customWidgetCanvas";
import { useProject } from "../store/projectStore";
import { surfaceCustomWidget } from "../store/surface";
import { customWidgetUsage } from "../store/usage";
import { Button, Field, Input, Select } from "../ui";
import { AddIcon, CloseIcon } from "../ui/icons";

/** The smallest and largest designed size. */
export const MIN_SIZE = 8, MAX_SIZE = 8000;

/** A size typed into a field, or undefined when it is not a whole number in range. */
export function parseSize(text: string): number | undefined {
  if (!/^\s*\d+\s*$/.test(text)) return undefined;
  const n = Number(text);
  return n >= MIN_SIZE && n <= MAX_SIZE ? n : undefined;
}

/** A pixel size field that can be typed freely (cleared, retyped) and is kept when the field is left
 *  or Enter is pressed. A value that is not a size in range goes back to the one kept. */
function SizeField({ label, value, onCommit }: { label: string; value: number | undefined; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value ?? ""));
  useEffect(() => setText(String(value ?? "")), [value]);
  const bad = text.trim() !== "" && parseSize(text) === undefined;
  const commit = () => {
    const v = parseSize(text);
    if (v !== undefined && v !== value) onCommit(v);
    else setText(String(value ?? ""));
  };
  return (
    <Field label={label} error={bad ? `${MIN_SIZE} to ${MAX_SIZE}` : undefined}>
      <Input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") setText(String(value ?? "")); }} />
    </Field>
  );
}

/** How many parts lie (partly) outside the designed box. */
export function partsOutside(cw: Pick<CustomWidget, "width" | "height" | "widgets">): number {
  if (!cw.width || !cw.height) return 0;
  return cw.widgets.filter((p) => p.x + p.w > cw.width! || p.y + p.h > cw.height!).length;
}

/** The bar above the canvas while a custom widget is open on it. */
export function CustomWidgetCanvasBar() {
  const project = useProject((s) => s.project);
  const activePageId = useProject((s) => s.activePageId);
  const returnPageId = useProject((s) => s.returnPageId);
  const close = useProject((s) => s.closeCustomWidgetCanvas);
  const cw = surfaceCustomWidget(project, activePageId);
  if (!cw) return null;
  const back = project.pages.find((p) => p.id === returnPageId) ?? project.pages[0];
  const uses = customWidgetUsage(project, cw.id).total;
  return (
    <div data-testid="custom-widget-bar" className="flex items-center gap-3 px-3 py-1.5 bg-purple-500/15 border-b border-purple-500/40 shrink-0">
      <span className="text-ui-label uppercase tracking-wide text-zinc-300">Custom widget</span>
      <span className="text-ui font-medium text-zinc-100 truncate">{cw.name || "Unnamed"}</span>
      <span className="text-ui-label text-zinc-400 tabular-nums">{cw.width} × {cw.height} px</span>
      <span className="text-ui-label text-zinc-500 hidden md:inline">
        {uses ? `used ${uses} time${uses === 1 ? "" : "s"}; changes show everywhere it is used` : "not used yet"}
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="primary" onClick={close}>Back to {back?.name ?? "the page"}</Button>
    </div>
  );
}

/** A custom widget's own properties, shown when it is open on the canvas and no part is selected. */
export function CustomWidgetProperties({ cw }: { cw: CustomWidget }) {
  const update = useProject((s) => s.updateCustomWidget);
  const set = (patch: Partial<CustomWidget>) => update(cw.id, patch);
  const setParams = (params: CustomWidgetParam[]) => set({ params });
  return (
    <div className="p-3 space-y-3 overflow-auto">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 pb-1 border-b border-zinc-800">Custom widget</div>
      <Field label="Name"><Input value={cw.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Description"><Input value={cw.description ?? ""} placeholder="Optional" onChange={(e) => set({ description: e.target.value || undefined })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <SizeField label="Width (px)" value={cw.width} onCommit={(width) => set({ width })} />
        <SizeField label="Height (px)" value={cw.height} onCommit={(height) => set({ height })} />
      </div>
      {partsOutside(cw) > 0 && (() => {
        const n = partsOutside(cw);
        const ext = partsExtent(cw.widgets);
        return (
          <div role="status" className="rounded border border-amber-700/60 bg-amber-500/10 p-2 text-ui-label text-amber-300 space-y-1.5">
            <div>{n === 1 ? "1 part lies" : `${n} parts lie`} outside the box, so {n === 1 ? "it is" : "they are"} cut off where the custom widget is used.</div>
            <Button size="sm" onClick={() => set({ width: Math.max(cw.width ?? 0, Math.ceil(ext.w)), height: Math.max(cw.height ?? 0, Math.ceil(ext.h)) })}>
              Make the box fit its parts
            </Button>
          </div>
        );
      })()}
      <p className="text-ui-label text-zinc-500 leading-relaxed">
        Placed on a page it is scaled to fit the place you give it. Pinned to a screen edge (Project properties, Header and navigation) each part
        keeps its size and follows its anchors, so a header can span any width.
      </p>

      <div className="space-y-1.5">
        <div className="text-ui-label text-zinc-400">Parameters</div>
        {cw.params.length === 0 && <div className="text-ui-label text-zinc-500">None. A parameter lets each use give its own tag, written {"{name}"} in a part's tag.</div>}
        {cw.params.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-ui-label text-purple-400 font-mono">{"{"}</span>
            <Input mono aria-label={`Parameter ${i + 1} name`} value={p.name}
              onChange={(e) => setParams(cw.params.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)))} />
            <span className="text-ui-label text-purple-400 font-mono">{"}"}</span>
            <button type="button" aria-label={`Remove parameter ${i + 1}`} title="Remove" className="text-zinc-500 hover:text-red-500 px-1"
              onClick={() => setParams(cw.params.filter((_, j) => j !== i))}><CloseIcon size={12} /></button>
          </div>
        ))}
        <Button size="sm" icon={<AddIcon size={12} />} onClick={() => setParams([...cw.params, { name: `param${cw.params.length + 1}` }])}>Add parameter</Button>
      </div>
    </div>
  );
}

/** A part's anchors: where it stays when the custom widget is pinned to an edge wider or taller than it. */
export function AnchorFields({ anchorX, anchorY, onChange }: { anchorX?: AnchorX; anchorY?: AnchorY; onChange: (patch: { anchorX?: AnchorX; anchorY?: AnchorY }) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Anchors (pinned to a screen edge)</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Across">
          <Select value={anchorX ?? "left"} onChange={(e) => onChange({ anchorX: e.target.value === "left" ? undefined : (e.target.value as AnchorX) })}>
            <option value="left">Stay left</option>
            <option value="right">Stay right</option>
            <option value="center">Stay centered</option>
            <option value="stretch">Stretch</option>
          </Select>
        </Field>
        <Field label="Down">
          <Select value={anchorY ?? "top"} onChange={(e) => onChange({ anchorY: e.target.value === "top" ? undefined : (e.target.value as AnchorY) })}>
            <option value="top">Stay at the top</option>
            <option value="bottom">Stay at the bottom</option>
            <option value="center">Stay centered</option>
            <option value="stretch">Stretch</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
