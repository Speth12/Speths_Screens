import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useProject, type CustomWidget, type CustomWidgetParam, type CustomWidgetPart, type WidgetType } from "../store/projectStore";
import type { CustomWidgetLayout } from "@speths-screens/shared-types";
import { manifestFor, type Device } from "@speths-screens/widgets";
import type { Widget } from "../store/projectStore";
import { SettingsFields } from "./SettingsEditor";
import { LayoutStrip, PartFlexFields, StackPreview } from "./CustomWidgetStack";
import { canvasCaption, clampPart, editorCanvas, guideLines, movePartBy, newPartSize, resizePartBy, type EditorCanvas } from "../store/customWidgetCanvas";
import { CloseIcon, ChevronDownIcon, ChevronRightIcon, EditIcon, WidgetIcon } from "../ui/icons";

const uid = () => `lw-${Math.random().toString(36).slice(2, 8)}`;
const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

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
        <div className="text-xs font-semibold text-zinc-200">{w.type}</div>
        <button onClick={onRemove}
          className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 hover:bg-red-800/60 text-red-300">
          Remove
        </button>
      </div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Binding</div>
        <input value={tag} onChange={(e) => setTag(e.target.value)}
          placeholder="e.g. {prefix}.Status" className={inp} />
        <div className="mt-1 flex flex-wrap gap-1">
          {params.map((p) => (
            <button key={p.name} onClick={() => setTag(tag + `{${p.name}}`)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-purple-300 font-mono">
              {`{${p.name}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Label</div>
        <input value={(props.label as string) ?? ""} onChange={(e) => setProp("label", e.target.value || undefined)}
          className={inp} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">X ({unit ?? "col"})</div>
          <input type="number" min={0} max={canvas.cols - 1} value={w.x} aria-label="X"
            onChange={(e) => place({ x: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Y ({unit ?? "row"})</div>
          <input type="number" min={0} max={canvas.rows - 1} value={w.y} aria-label="Y"
            onChange={(e) => place({ y: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Width ({unit ?? "cols"})</div>
          <input type="number" min={1} max={canvas.cols} value={w.w} aria-label="Width"
            onChange={(e) => place({ w: Number(e.target.value) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Height ({unit ?? "rows"})</div>
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

// ── CustomWidget visual editor modal ─────────────────────────────────────────

function CustomWidgetEditorModal({
  fp, onClose, onSave,
}: {
  fp: CustomWidget;
  onClose: () => void;
  onSave: (widgets: CustomWidgetPart[], params: CustomWidgetParam[], layout: CustomWidgetLayout | undefined) => void;
}) {
  const [widgets, setWidgets]   = useState<CustomWidgetPart[]>(() => JSON.parse(JSON.stringify(fp.widgets)));
  const [params,  setParams]    = useState<CustomWidgetParam[]>(() => JSON.parse(JSON.stringify(fp.params)));
  const [layout, setLayout] = useState<CustomWidgetLayout | undefined>(fp.layout);
  const [device, setDevice] = useState<Device>("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The box is worked out once, when the editor opens, so it does not change size under a drag.
  const [canvas] = useState(() => editorCanvas(useProject.getState().project, fp.id, fp.widgets));

  // ── Drag to reposition ──────────────────────────────────────────────────
  const dragState = useRef<{ startMouseX: number; startMouseY: number; start: CustomWidgetPart } | null>(null);

  const onWidgetMouseDown = useCallback((e: React.MouseEvent, localId: string) => {
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
  }, [widgets, canvas]);

  // ── Resize handle ───────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e: React.MouseEvent, localId: string) => {
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
  }, [widgets, canvas]);

  const addWidget = (type: WidgetType, defW: number, defH: number) => {
    const id = uid();
    const size = newPartSize(defW, defH, canvas);
    setWidgets((ws) => [...ws, { localId: id, type, x: 0, y: 0, w: size.w, h: size.h, ...(params[0] ? { bindings: { value: `{${params[0].name}}` } } : {}), ...manifestFor(type)?.defaults }]);
    setSelected(id);
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

  return createPortal(
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col" style={{ fontFamily: "ui-monospace, monospace" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
        <span className="text-sm font-semibold text-zinc-100">{fp.name}</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">Custom widget editor</span>
        <div className="flex-1" />
        <button
          onClick={() => { onSave(widgets, params, layout); onClose(); }}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded font-medium text-white"
        >
          Save & Close
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">
          Cancel
        </button>
      </div>

      {/* ── Params strip ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/60 shrink-0 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Parameters:</span>
        {params.map((p, i) => (
          <div key={i} className="flex items-center gap-1 bg-zinc-800 rounded px-2 py-0.5 shrink-0">
            <span className="text-[10px] text-purple-400 font-mono">{`{`}</span>
            <input value={p.name} onChange={(e) => updateParam(i, { name: e.target.value })}
              className="bg-transparent text-[10px] text-purple-300 font-mono w-20 outline-none" />
            <span className="text-[10px] text-purple-400 font-mono">{`}`}</span>
            <button onClick={() => removeParam(i)} aria-label="Remove parameter" className="text-zinc-600 hover:text-red-400 text-[10px] ml-0.5"><CloseIcon size={14} /></button>
          </div>
        ))}
        <button onClick={addParam}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 shrink-0">
          + Add Parameter
        </button>
        <span className="text-[9px] text-zinc-600 shrink-0">Use {"{paramName}"} in bindings</span>
      </div>

      <LayoutStrip layout={layout} device={device} onDevice={setDevice} onChange={setLayout} />

      {/* ── Main body ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* Palette */}
        <div className="w-40 border-r border-zinc-800 flex flex-col shrink-0 overflow-auto bg-zinc-900/30">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 pt-3 pb-2">Widgets</div>
          {PALETTE_WIDGETS.map(({ type, label, defaultW, defaultH }) => (
            <button key={type}
              onClick={() => addWidget(type, defaultW, defaultH)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 text-left transition-colors"
            >
              <WidgetIcon type={type} size={14} className="w-5" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-3 py-3 text-[9px] text-zinc-600 leading-relaxed border-t border-zinc-800/60">
            Drag widgets to reposition. Drag bottom-right corner to resize.
          </div>
        </div>

        {/* Canvas (free layout) or the stack as it is laid out */}
        {layout?.mode === "stack" ? (
          <StackPreview layout={layout} parts={widgets} device={device} selected={selected} onSelect={setSelected} onReorder={setWidgets} />
        ) : (
        <div className="flex-1 overflow-auto p-6 bg-zinc-950 flex items-start justify-center">
          <div>
            <div className="text-[9px] text-zinc-600 mb-2 text-center">{canvasCaption(canvas)}</div>
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
                    <div className={`absolute top-1 left-1.5 text-[9px] font-semibold uppercase tracking-wider px-1 rounded ${
                      isSelected ? "text-blue-300" : "text-zinc-500"
                    }`}>
                      {w.type}
                    </div>

                    {/* Binding preview */}
                    {w.bindings?.value && (
                      <div className="absolute bottom-1 left-1.5 right-6 text-[8px] font-mono text-purple-400 truncate">
                        {w.bindings.value}
                      </div>
                    )}

                    {/* Label preview */}
                    {w.props?.label && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-300 pointer-events-none">
                        {w.props.label}
                      </div>
                    )}

                    {/* Resize handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-zinc-600 hover:text-zinc-300"
                      onMouseDown={(e) => { e.stopPropagation(); onResizeMouseDown(e, w.localId); }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
                  <WidgetIcon type="customWidget" size={32} className="opacity-30" />
                  <span className="text-[11px]">Click a widget type on the left to add it</span>
                </div>
              )}
            </div>
            <div className="text-[9px] text-zinc-600 mt-2 text-center">
              {widgets.length} widget{widgets.length !== 1 ? "s" : ""} · Click canvas to deselect
            </div>
          </div>
        </div>
        )}

        {/* Properties */}
        <div className="w-64 border-l border-zinc-800 bg-zinc-900/30 overflow-auto shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 pt-3 pb-2">Properties</div>
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
              <div className="text-[11px] text-zinc-600 italic leading-relaxed">
                Select a widget on the canvas to edit its binding, label, and position.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>,
    document.body,
  );
}

// ── Param Row (compact) ────────────────────────────────────────────────────

function ParamRow({ param, onChange, onRemove }: {
  param: CustomWidgetParam;
  onChange: (patch: Partial<CustomWidgetParam>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1.5 items-center">
      <input value={param.name} onChange={(e) => onChange({ name: e.target.value })}
        placeholder="paramName"
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[11px] font-mono focus:outline-none" />
      <input value={param.description ?? ""} onChange={(e) => onChange({ description: e.target.value || undefined })}
        placeholder="description"
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[11px] focus:outline-none" />
      <button onClick={onRemove} aria-label="Remove part" className="text-zinc-600 hover:text-red-400 text-xs"><CloseIcon size={14} /></button>
    </div>
  );
}

// ── CustomWidget card (in left panel tree) ───────────────────────────────────

function CustomWidgetCard({ fp }: { fp: CustomWidget }) {
  const { updateCustomWidget, removeCustomWidget } = useProject();
  const [open,       setOpen]       = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const setPs = (params: CustomWidgetParam[]) => updateCustomWidget(fp.id, { params });
  const addParam    = () => setPs([...fp.params, { name: `param${fp.params.length + 1}` }]);
  const updateParam = (i: number, patch: Partial<CustomWidgetParam>) =>
    setPs(fp.params.map((p, j) => j === i ? { ...p, ...patch } : p));
  const removeParam = (i: number) => setPs(fp.params.filter((_, j) => j !== i));

  return (
    <>
      <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
        {/* Card header */}
        <div
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 cursor-pointer hover:bg-zinc-800/60"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-[10px] text-zinc-500 w-3">{open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</span>
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <input
            value={fp.name}
            onChange={(e) => { e.stopPropagation(); updateCustomWidget(fp.id, { name: e.target.value }); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-xs font-medium text-zinc-200 outline-none"
            placeholder="Custom widget name"
          />
          <span className="text-[10px] text-zinc-600 shrink-0">
            {fp.params.length}p · {fp.widgets.length}w
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); removeCustomWidget(fp.id); }}
            aria-label={`Delete ${fp.name}`}
            className="text-zinc-600 hover:text-red-400 text-xs shrink-0"
          ><CloseIcon size={14} /></button>
        </div>

        {/* Expanded detail */}
        {open && (
          <div className="px-3 py-2 space-y-3 bg-zinc-900/30">
            <input
              value={fp.description ?? ""}
              onChange={(e) => updateCustomWidget(fp.id, { description: e.target.value || undefined })}
              placeholder="Description"
              className={`${inp} text-[10px]`}
            />

            {/* Open visual editor */}
            <button
              onClick={() => setShowEditor(true)}
              className="w-full text-xs py-2 rounded bg-purple-700/60 hover:bg-purple-600/70 text-purple-100 font-medium flex items-center justify-center gap-2"
            >
              <EditIcon size={14} /> Open Visual Editor
            </button>

            {/* Parameters */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Parameters</span>
                <button onClick={addParam} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
              </div>
              <div className="space-y-1">
                {fp.params.length === 0 && <div className="text-[10px] text-zinc-600 italic">No params.</div>}
                {fp.params.map((p, i) => (
                  <ParamRow key={i} param={p}
                    onChange={(patch) => updateParam(i, patch)}
                    onRemove={() => removeParam(i)} />
                ))}
              </div>
              <div className="text-[10px] text-zinc-600 mt-1">
                Use <code className="text-zinc-400">{"{paramName}"}</code> in bindings.
              </div>
            </div>

            {/* Widget list */}
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                Widgets ({fp.widgets.length})
              </div>
              {fp.widgets.length === 0 && (
                <div className="text-[10px] text-zinc-600 italic">Use the visual editor to add widgets.</div>
              )}
              {fp.widgets.map((w) => (
                <div key={w.localId} className="flex items-center gap-2 text-[10px] py-0.5 border-b border-zinc-800/50">
                  <span className="text-zinc-500 font-mono w-20 truncate">{w.type}</span>
                  <span className="text-zinc-600 font-mono flex-1 truncate text-purple-400">{w.bindings?.value ?? "—"}</span>
                  <span className="text-zinc-700">{w.w}×{w.h}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showEditor && (
        <CustomWidgetEditorModal
          fp={fp}
          onClose={() => setShowEditor(false)}
          onSave={(widgets, params, layout) => {
            updateCustomWidget(fp.id, { widgets, params, layout });
          }}
        />
      )}
    </>
  );
}

// ── CustomWidgets panel ───────────────────────────────────────────────────────

export function CustomWidgets() {
  const { project, addCustomWidget } = useProject();
  const customWidgets = project.customWidgets ?? [];

  const handleAdd = () => addCustomWidget({
    id: `fp-${Math.random().toString(36).slice(2, 8)}`,
    name: `CustomWidget ${customWidgets.length + 1}`,
    params: [{ name: "prefix", description: "Tag prefix" }],
    widgets: [],
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Custom widgets</div>
        <button onClick={handleAdd}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">
          + New
        </button>
      </div>

      {customWidgets.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic leading-relaxed">
          Custom widgets are reusable pieces of screen. Build one in the visual editor (free layout, or a stack that adapts to the screen size), then drop it on a page or pin it to a screen edge, and set its parameters (for example a tag prefix).
        </div>
      )}

      <div className="space-y-2">
        {customWidgets.map((fp) => <CustomWidgetCard key={fp.id} fp={fp} />)}
      </div>
    </div>
  );
}
