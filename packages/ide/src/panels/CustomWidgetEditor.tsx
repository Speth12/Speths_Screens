// The custom widget editor: the parts of a custom widget laid out on a canvas (or as a stack that adapts to the
// screen size), its parameters, and the properties of the chosen part. It edits a draft that the tab around it keeps and saves.
import { useState, useRef, useCallback } from "react";
import { useProject, type CustomWidgetParam, type CustomWidgetPart, type WidgetType } from "../store/projectStore";
import type { CustomWidgetLayout } from "@speths-screens/shared-types";
import { manifestFor, type Device } from "@speths-screens/widgets";
import type { Widget } from "../store/projectStore";
import { SettingsFields } from "./SettingsEditor";
import { LayoutStrip, PartFlexFields, StackPreview } from "./CustomWidgetStack";
import { canvasCaption, clampPart, editorCanvas, guideLines, movePartBy, newPartSize, resizePartBy, type EditorCanvas } from "../store/customWidgetCanvas";
import { Button } from "../ui";
import { AddIcon, CloseIcon, WidgetIcon } from "../ui/icons";

const uid = () => `lw-${Math.random().toString(36).slice(2, 8)}`;
const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-ui focus:outline-none focus:border-zinc-500";

// Widget types available in the custom widget palette
const PALETTE_WIDGETS: { type: WidgetType; label: string; defaultW: number; defaultH: number }[] = [
  { type: "button",         label: "Button",       defaultW: 3, defaultH: 1 },
  { type: "led",            label: "LED",          defaultW: 2, defaultH: 2 },
  { type: "numericDisplay", label: "Numeric",      defaultW: 3, defaultH: 2 },
  { type: "textDisplay",    label: "Text",         defaultW: 4, defaultH: 1 },
  { type: "gauge",          label: "Gauge",        defaultW: 4, defaultH: 3 },
  { type: "tank",           label: "Tank",         defaultW: 2, defaultH: 4 },
  { type: "setpoint",       label: "Setpoint",     defaultW: 4, defaultH: 2 },
  { type: "numericInput",   label: "Numeric In",   defaultW: 3, defaultH: 2 },
  { type: "multiState",     label: "Multi-State",  defaultW: 3, defaultH: 2 },
  { type: "trend",          label: "Trend",        defaultW: 6, defaultH: 4 },
  { type: "table",          label: "Table",        defaultW: 4, defaultH: 4 },
  { type: "image",          label: "Image",        defaultW: 4, defaultH: 3 },
  { type: "customWidget",   label: "Custom widget", defaultW: 4, defaultH: 2 },
];

// ── Part properties — mini property editor ────────────────────────────

function FpWidgetProps({
  w, params, canvas, onChange, onRemove,
}: {
  w: CustomWidgetPart;
  params: CustomWidgetParam[];
  /** The box the part is placed in; its position fields are in the box's units. */
  canvas: EditorCanvas;
  onChange: (patch: Partial<CustomWidgetPart>) => void;
  onRemove: () => void;
}) {
  const props: Record<string, unknown> = w.props ?? {};
  const setProp = (k: string, v: unknown) => {
    const next = { ...props };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange({ props: next });
  };
  const tag = w.bindings?.value ?? "";
  const setTag = (value: string) => onChange({ bindings: { ...w.bindings, value: value || undefined } });
  const manifest = manifestFor(w.type);
  const unit = canvas.pixel ? "px" : null;
  const place = (patch: Partial<Pick<CustomWidgetPart, "x" | "y" | "w" | "h">>) => {
    const { x, y, w: width, h } = clampPart({ ...w, ...patch }, canvas);
    onChange({ x, y, w: width, h });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-ui font-semibold text-zinc-100">{w.type}</div>
        <Button size="sm" variant="danger" onClick={onRemove}>Remove part</Button>
      </div>

      <div>
        <div className="text-ui-label text-zinc-400 mb-0.5">Binding</div>
        <input aria-label="Binding" value={tag} onChange={(e) => setTag(e.target.value)}
          placeholder="e.g. {prefix}.Status" className={inp} />
        <div className="mt-1 flex flex-wrap gap-1">
          {params.map((p) => (
            <button key={p.name} onClick={() => setTag(tag + `{${p.name}}`)}
              className="text-ui-label px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-purple-400 font-mono">
              {`{${p.name}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-ui-label text-zinc-400 mb-0.5">Label</div>
        <input aria-label="Label" value={(props.label as string) ?? ""} onChange={(e) => setProp("label", e.target.value || undefined)}
          className={inp} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-ui-label text-zinc-400 mb-0.5">X ({unit ?? "col"})</div>
          <input type="number" min={0} max={canvas.cols - 1} value={w.x} aria-label="X"
            onChange={(e) => place({ x: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-ui-label text-zinc-400 mb-0.5">Y ({unit ?? "row"})</div>
          <input type="number" min={0} max={canvas.rows - 1} value={w.y} aria-label="Y"
            onChange={(e) => place({ y: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-ui-label text-zinc-400 mb-0.5">Width ({unit ?? "cols"})</div>
          <input type="number" min={1} max={canvas.cols} value={w.w} aria-label="Width"
            onChange={(e) => place({ w: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-ui-label text-zinc-400 mb-0.5">Height ({unit ?? "rows"})</div>
          <input type="number" min={1} max={canvas.rows} value={w.h} aria-label="Height"
            onChange={(e) => place({ h: Number(e.target.value) })}
            className={inp} />
        </div>
      </div>

      {/* The widget type's settings, from its manifest */}
      {manifest && manifest.settings.length > 0 && (
        <SettingsFields fields={manifest.settings} config={props} set={setProp} w={{ ...w, id: w.localId } as unknown as Widget} />
      )}
    </div>
  );
}

// ── The editor ───────────────────────────────────────────────────────────────

/** What the editor changes; the rest of a custom widget (its id) stays as it is. */
export type CustomWidgetDraft = {
  name: string;
  description?: string;
  params: CustomWidgetParam[];
  widgets: CustomWidgetPart[];
  layout?: CustomWidgetLayout;
};

/** The width of an element, kept current. 0 until it is measured (and always where the browser cannot measure). */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const watching = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    watching.current = new ResizeObserver(() => setWidth(el.clientWidth));
    watching.current.observe(el);
  }, []);
  return [ref, width];
}

/** Room around the box inside the canvas area. */
const CANVAS_PADDING = 48;

export function CustomWidgetEditor({ id, draft, update }: {
  /** The custom widget being edited; the editor starts again for another one. */
  id: string;
  draft: CustomWidgetDraft;
  update: (change: (d: CustomWidgetDraft) => CustomWidgetDraft) => void;
}) {
  const { widgets, params, layout } = draft;
  const setWidgets = (next: CustomWidgetPart[] | ((ws: CustomWidgetPart[]) => CustomWidgetPart[])) =>
    update((d) => ({ ...d, widgets: typeof next === "function" ? next(d.widgets) : next }));
  const setParams = (next: CustomWidgetParam[] | ((ps: CustomWidgetParam[]) => CustomWidgetParam[])) =>
    update((d) => ({ ...d, params: typeof next === "function" ? next(d.params) : next }));
  const setLayout = (next: CustomWidgetLayout | undefined) => update((d) => ({ ...d, layout: next }));
  const [device, setDevice] = useState<Device>("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [areaRef, areaWidth] = useWidth();
  // The box (its size in the project's units) is worked out once, when the editor opens, so it does not change under a
  // drag; how large it is drawn follows the room there is, so a narrow editor shows all of it.
  const [base] = useState(() => editorCanvas(useProject.getState().project, id, draft.widgets));
  const fit = areaWidth > 0 ? Math.min(1, Math.max(0.15, (areaWidth - CANVAS_PADDING) / (base.cols * base.unit))) : 1;
  const canvas: EditorCanvas = { ...base, unit: base.unit * fit };

  // ── Drag to reposition ──────────────────────────────────────────────────
  const dragState = useRef<{ startMouseX: number; startMouseY: number; start: CustomWidgetPart } | null>(null);

  const onWidgetMouseDown = (e: React.MouseEvent, localId: string) => {
    e.stopPropagation();
    setSelected(localId);
    const w = widgets.find((x) => x.localId === localId);
    if (!w || !canvasRef.current) return;
    dragState.current = { startMouseX: e.clientX, startMouseY: e.clientY, start: w };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const { start, startMouseX, startMouseY } = dragState.current;
      const { x, y } = movePartBy(start, ev.clientX - startMouseX, ev.clientY - startMouseY, canvas);
      setWidgets((ws) => ws.map((w) => (w.localId === localId ? { ...w, x, y } : w)));
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Resize handle ───────────────────────────────────────────────────────
  const onResizeMouseDown = (e: React.MouseEvent, localId: string) => {
    e.stopPropagation();
    const w = widgets.find((x) => x.localId === localId);
    if (!w) return;
    const startX = e.clientX, startY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const size = resizePartBy(w, ev.clientX - startX, ev.clientY - startY, canvas);
      setWidgets((ws) => ws.map((x) => (x.localId === localId ? { ...x, w: size.w, h: size.h } : x)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const addWidget = (type: WidgetType, defW: number, defH: number) => {
    const partId = uid();
    const size = newPartSize(defW, defH, canvas);
    setWidgets((ws) => [...ws, { localId: partId, type, x: 0, y: 0, w: size.w, h: size.h, ...(params[0] ? { bindings: { value: `{${params[0].name}}` } } : {}), ...manifestFor(type)?.defaults }]);
    setSelected(partId);
  };

  const updateWidget = (localId: string, patch: Partial<CustomWidgetPart>) =>
    setWidgets((ws) => ws.map((w) => w.localId === localId ? { ...w, ...patch } : w));

  const selectedWidget = widgets.find((w) => w.localId === selected) ?? null;
  const guides = guideLines(canvas);

  // ── Params bar helpers ──────────────────────────────────────────────────
  const addParam = () => setParams((ps) => [...ps, { name: `param${ps.length + 1}` }]);
  const updateParam = (i: number, patch: Partial<CustomWidgetParam>) =>
    setParams((ps) => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const removeParam = (i: number) => setParams((ps) => ps.filter((_, j) => j !== i));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── Params strip ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 shrink-0 overflow-x-auto">
        <span className="text-ui-label uppercase tracking-wide text-zinc-400 shrink-0">Parameters</span>
        {params.map((p, i) => (
          <div key={i} className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-0.5 shrink-0">
            <span className="text-ui-label text-purple-400 font-mono">{`{`}</span>
            <input aria-label={`Parameter ${i + 1} name`} value={p.name} onChange={(e) => updateParam(i, { name: e.target.value })}
              className="bg-transparent text-ui-label text-purple-400 font-mono w-24 outline-none" />
            <span className="text-ui-label text-purple-400 font-mono">{`}`}</span>
            <button onClick={() => removeParam(i)} aria-label={`Remove parameter ${i + 1}`} className="text-zinc-500 hover:text-red-500 ml-0.5"><CloseIcon size={12} /></button>
          </div>
        ))}
        <Button size="sm" icon={<AddIcon size={12} />} onClick={addParam}>Add parameter</Button>
        <span className="text-ui-label text-zinc-500 shrink-0">Use {"{name}"} in bindings</span>
      </div>

      <LayoutStrip layout={layout} device={device} onDevice={setDevice} onChange={setLayout} />

      {/* ── Add a part ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <span className="text-ui-label uppercase tracking-wide text-zinc-400 mr-1">Add</span>
        {PALETTE_WIDGETS.map(({ type, label, defaultW, defaultH }) => (
          <Button key={type} size="sm" icon={<WidgetIcon type={type} size={14} />} onClick={() => addWidget(type, defaultW, defaultH)}>{label}</Button>
        ))}
      </div>

      {/* ── Main body ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* Canvas (free layout) or the stack as it is laid out */}
        {layout?.mode === "stack" ? (
          <StackPreview layout={layout} parts={widgets} device={device} selected={selected} onSelect={setSelected} onReorder={setWidgets} />
        ) : (
        <div ref={areaRef} className="flex-1 min-w-0 overflow-auto p-6 bg-zinc-950 flex items-start justify-center">
          <div>
            <div className="text-ui-label text-zinc-400 mb-2 text-center">{canvasCaption(canvas)}</div>
            <div
              ref={canvasRef}
              className="relative bg-zinc-900/40 border border-zinc-700 rounded-lg overflow-hidden select-none"
              style={{ width: canvas.cols * canvas.unit, height: canvas.rows * canvas.unit }}
              onClick={() => setSelected(null)}
              data-testid="custom-widget-canvas"
            >
              {/* Grid lines */}
              <svg className="absolute inset-0 pointer-events-none opacity-20"
                   width={canvas.cols * canvas.unit} height={canvas.rows * canvas.unit}>
                {guides.xs.map((x) => (
                  <line key={`v${x}`} x1={x * canvas.unit} y1={0} x2={x * canvas.unit} y2={canvas.rows * canvas.unit} stroke="#52525b" strokeWidth={x === 0 || x === canvas.cols ? 1.5 : 0.5} />
                ))}
                {guides.ys.map((y) => (
                  <line key={`h${y}`} x1={0} y1={y * canvas.unit} x2={canvas.cols * canvas.unit} y2={y * canvas.unit} stroke="#52525b" strokeWidth={y === 0 || y === canvas.rows ? 1.5 : 0.5} />
                ))}
              </svg>

              {/* Widgets */}
              {widgets.map((w) => {
                const isSelected = w.localId === selected;
                return (
                  <div
                    key={w.localId}
                    className={`absolute rounded border-2 cursor-grab active:cursor-grabbing transition-shadow ${
                      isSelected
                        ? "border-blue-400 shadow-[0_0_0_1px_rgba(59,130,246,0.3)] bg-zinc-800/80"
                        : "border-zinc-600 bg-zinc-800/50 hover:border-zinc-500"
                    }`}
                    style={{
                      left:   w.x * canvas.unit + 2,
                      top:    w.y * canvas.unit + 2,
                      width:  w.w * canvas.unit - 4,
                      height: w.h * canvas.unit - 4,
                    }}
                    onMouseDown={(e) => onWidgetMouseDown(e, w.localId)}
                    // The click that ends a press on a part must not reach the canvas, whose click deselects.
                    onClick={(e) => e.stopPropagation()}
                    data-part={w.localId}
                  >
                    {/* Type badge */}
                    <div className={`absolute top-1 left-1.5 text-ui-label font-semibold uppercase tracking-wide px-1 rounded ${
                      isSelected ? "text-blue-400" : "text-zinc-400"
                    }`}>
                      {w.type}
                    </div>

                    {/* Binding preview */}
                    {w.bindings?.value && (
                      <div className="absolute bottom-1 left-1.5 right-6 text-ui-label font-mono text-purple-400 truncate">
                        {w.bindings.value}
                      </div>
                    )}

                    {/* Label preview */}
                    {w.props?.label && (
                      <div className="absolute inset-0 flex items-center justify-center text-ui text-zinc-200 pointer-events-none">
                        {w.props.label}
                      </div>
                    )}

                    {/* Resize handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-zinc-500 hover:text-zinc-200"
                      onMouseDown={(e) => { e.stopPropagation(); onResizeMouseDown(e, w.localId); }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                        <path d="M0 8L8 0V8H0Z" />
                      </svg>
                    </div>

                    {/* Selected indicator dot */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {widgets.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <WidgetIcon type="customWidget" size={32} className="opacity-40" />
                  <span className="text-ui">Add a widget type from the row above</span>
                </div>
              )}
            </div>
            <div className="text-ui-label text-zinc-500 mt-2 text-center">
              {widgets.length} widget{widgets.length !== 1 ? "s" : ""} · drag to move, the corner resizes, click the canvas to deselect
            </div>
          </div>
        </div>
        )}

        {/* Properties */}
        <div className="w-60 border-l border-zinc-800 overflow-auto shrink-0">
          <div className="text-ui-label uppercase tracking-wide text-zinc-400 px-3 pt-3 pb-2">Properties</div>
          <div className="px-3 pb-4">
            {selectedWidget ? (
              <>
              <FpWidgetProps
                w={selectedWidget}
                params={params}
                canvas={canvas}
                onChange={(patch) => updateWidget(selectedWidget.localId, patch)}
                onRemove={() => {
                  setWidgets((ws) => ws.filter((x) => x.localId !== selectedWidget.localId));
                  setSelected(null);
                }}
              />
              {layout?.mode === "stack" && (
                <PartFlexFields part={selectedWidget} device={device} onChange={(next) => updateWidget(selectedWidget.localId, next)} />
              )}
              </>
            ) : (
              <div className="text-ui text-zinc-500 leading-relaxed">
                Select a widget on the canvas to edit its binding, label and position.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
