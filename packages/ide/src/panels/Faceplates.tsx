import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useProject, type Faceplate, type FaceplateParam, type FaceplateWidget, type WidgetType } from "../store/projectStore";

const uid = () => `lw-${Math.random().toString(36).slice(2, 8)}`;
const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

// ── Grid constants ─────────────────────────────────────────────────────────
const CELL = 72;  // pixels per grid cell in the editor canvas
const COLS = 12;
const ROWS = 8;

// Widget types available in the faceplate palette
const PALETTE_WIDGETS: { type: WidgetType; label: string; defaultW: number; defaultH: number; icon: string }[] = [
  { type: "button",         label: "Button",       defaultW: 3, defaultH: 1, icon: "⬛" },
  { type: "led",            label: "LED",          defaultW: 2, defaultH: 2, icon: "🔴" },
  { type: "numericDisplay", label: "Numeric",      defaultW: 3, defaultH: 2, icon: "123" },
  { type: "textDisplay",    label: "Text",         defaultW: 4, defaultH: 1, icon: "T" },
  { type: "gauge",          label: "Gauge",        defaultW: 4, defaultH: 3, icon: "◑" },
  { type: "tank",           label: "Tank",         defaultW: 2, defaultH: 4, icon: "▊" },
  { type: "setpoint",       label: "Setpoint",     defaultW: 4, defaultH: 2, icon: "⇔" },
  { type: "numericInput",   label: "Numeric In",   defaultW: 3, defaultH: 2, icon: "▣" },
  { type: "multiState",     label: "Multi-State",  defaultW: 3, defaultH: 2, icon: "◈" },
  { type: "trend",          label: "Trend",        defaultW: 6, defaultH: 4, icon: "📈" },
  { type: "table",          label: "Table",        defaultW: 4, defaultH: 4, icon: "⊞" },
  { type: "image",          label: "Image",        defaultW: 4, defaultH: 3, icon: "🖼" },
];

// ── FaceplateWidgetProps — mini property editor ────────────────────────────

function FpWidgetProps({
  w, params, onChange, onRemove,
}: {
  w: FaceplateWidget;
  params: FaceplateParam[];
  onChange: (patch: Partial<FaceplateWidget>) => void;
  onRemove: () => void;
}) {
  const setConfig = (k: string, v: unknown) =>
    onChange({ config: { ...(w.config ?? {}), [k]: v } });

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
        <input value={w.binding ?? ""} onChange={(e) => onChange({ binding: e.target.value || undefined })}
          placeholder="e.g. {prefix}.Status" className={inp} />
        <div className="mt-1 flex flex-wrap gap-1">
          {params.map((p) => (
            <button key={p.name} onClick={() => onChange({ binding: (w.binding ?? "") + `{${p.name}}` })}
              className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-purple-300 font-mono">
              {`{${p.name}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Label</div>
        <input value={(w.config?.label as string) ?? ""} onChange={(e) => setConfig("label", e.target.value)}
          className={inp} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">X (col)</div>
          <input type="number" min={0} max={COLS - 1} value={w.x}
            onChange={(e) => onChange({ x: Math.max(0, Math.min(COLS - w.w, Number(e.target.value))) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Y (row)</div>
          <input type="number" min={0} max={ROWS - 1} value={w.y}
            onChange={(e) => onChange({ y: Math.max(0, Math.min(ROWS - w.h, Number(e.target.value))) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Width (cols)</div>
          <input type="number" min={1} max={COLS} value={w.w}
            onChange={(e) => onChange({ w: Math.max(1, Math.min(COLS - w.x, Number(e.target.value))) })}
            className={inp} />
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Height (rows)</div>
          <input type="number" min={1} max={ROWS} value={w.h}
            onChange={(e) => onChange({ h: Math.max(1, Math.min(ROWS - w.y, Number(e.target.value))) })}
            className={inp} />
        </div>
      </div>

      {/* Widget-type specific quick config */}
      {(w.type === "gauge" || w.type === "tank" || w.type === "setpoint") && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-zinc-500 mb-0.5">Min</div>
            <input type="number" value={(w.config?.min as number) ?? 0}
              onChange={(e) => setConfig("min", Number(e.target.value))} className={inp} />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-0.5">Max</div>
            <input type="number" value={(w.config?.max as number) ?? 100}
              onChange={(e) => setConfig("max", Number(e.target.value))} className={inp} />
          </div>
        </div>
      )}

      {w.type === "button" && (
        <div>
          <div className="text-[10px] text-zinc-500 mb-0.5">Action</div>
          <select value={(w.config?.action as string) ?? "write"}
            onChange={(e) => setConfig("action", e.target.value)} className={inp}>
            <option value="write">Write value</option>
            <option value="navigate">Navigate page</option>
          </select>
        </div>
      )}

      {w.type === "led" && (
        <div className="grid grid-cols-2 gap-1">
          <div>
            <div className="text-[10px] text-zinc-500 mb-0.5">ON label</div>
            <input value={(w.config?.trueLabel as string) ?? "ON"} onChange={(e) => setConfig("trueLabel", e.target.value)} className={inp} />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-0.5">OFF label</div>
            <input value={(w.config?.falseLabel as string) ?? "OFF"} onChange={(e) => setConfig("falseLabel", e.target.value)} className={inp} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Faceplate visual editor modal ─────────────────────────────────────────

function FaceplateEditorModal({
  fp, onClose, onSave,
}: {
  fp: Faceplate;
  onClose: () => void;
  onSave: (widgets: FaceplateWidget[], params: FaceplateParam[]) => void;
}) {
  const [widgets, setWidgets]   = useState<FaceplateWidget[]>(() => JSON.parse(JSON.stringify(fp.widgets)));
  const [params,  setParams]    = useState<FaceplateParam[]>(() => JSON.parse(JSON.stringify(fp.params)));
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Drag to reposition ──────────────────────────────────────────────────
  const dragState = useRef<{
    localId: string; startMouseX: number; startMouseY: number;
    origX: number; origY: number;
  } | null>(null);

  const onWidgetMouseDown = useCallback((e: React.MouseEvent, localId: string) => {
    e.stopPropagation();
    setSelected(localId);
    const w = widgets.find((x) => x.localId === localId);
    if (!w || !canvasRef.current) return;
    dragState.current = { localId, startMouseX: e.clientX, startMouseY: e.clientY, origX: w.x, origY: w.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = Math.round((ev.clientX - dragState.current.startMouseX) / CELL);
      const dy = Math.round((ev.clientY - dragState.current.startMouseY) / CELL);
      const { origX, origY } = dragState.current;
      setWidgets((ws) => ws.map((w) => {
        if (w.localId !== localId) return w;
        const nx = Math.max(0, Math.min(COLS - w.w, origX + dx));
        const ny = Math.max(0, Math.min(ROWS - w.h, origY + dy));
        return { ...w, x: nx, y: ny };
      }));
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widgets]);

  // ── Resize handle ───────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e: React.MouseEvent, localId: string) => {
    e.stopPropagation();
    const w = widgets.find((x) => x.localId === localId);
    if (!w) return;
    const startX = e.clientX, startY = e.clientY;
    const origW = w.w, origH = w.h;

    const onMove = (ev: MouseEvent) => {
      const dw = Math.round((ev.clientX - startX) / CELL);
      const dh = Math.round((ev.clientY - startY) / CELL);
      setWidgets((ws) => ws.map((x) => {
        if (x.localId !== localId) return x;
        return { ...x, w: Math.max(1, Math.min(COLS - x.x, origW + dw)), h: Math.max(1, Math.min(ROWS - x.y, origH + dh)) };
      }));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widgets]);

  const addWidget = (type: WidgetType, defW: number, defH: number) => {
    const id = uid();
    setWidgets((ws) => [...ws, { localId: id, type, x: 0, y: 0, w: defW, h: defH, binding: params[0] ? `{${params[0].name}}` : undefined, config: {} }]);
    setSelected(id);
  };

  const updateWidget = (localId: string, patch: Partial<FaceplateWidget>) =>
    setWidgets((ws) => ws.map((w) => w.localId === localId ? { ...w, ...patch } : w));

  const selectedWidget = widgets.find((w) => w.localId === selected) ?? null;

  // ── Params bar helpers ──────────────────────────────────────────────────
  const addParam = () => setParams((ps) => [...ps, { name: `param${ps.length + 1}` }]);
  const updateParam = (i: number, patch: Partial<FaceplateParam>) =>
    setParams((ps) => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const removeParam = (i: number) => setParams((ps) => ps.filter((_, j) => j !== i));

  return createPortal(
    <div className="fixed inset-0 bg-zinc-950/98 z-50 flex flex-col" style={{ fontFamily: "ui-monospace, monospace" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
        <span className="text-sm font-semibold text-zinc-100">{fp.name}</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-600">Faceplate Editor</span>
        <div className="flex-1" />
        <button
          onClick={() => { onSave(widgets, params); onClose(); }}
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
            <button onClick={() => removeParam(i)} className="text-zinc-600 hover:text-red-400 text-[10px] ml-0.5">×</button>
          </div>
        ))}
        <button onClick={addParam}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 shrink-0">
          + Add Parameter
        </button>
        <span className="text-[9px] text-zinc-600 shrink-0">Use {"{paramName}"} in bindings</span>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* Palette */}
        <div className="w-40 border-r border-zinc-800 flex flex-col shrink-0 overflow-auto bg-zinc-900/30">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 pt-3 pb-2">Widgets</div>
          {PALETTE_WIDGETS.map(({ type, label, defaultW, defaultH, icon }) => (
            <button key={type}
              onClick={() => addWidget(type, defaultW, defaultH)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 text-left transition-colors"
            >
              <span className="text-sm w-5 shrink-0 text-center">{icon}</span>
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-3 py-3 text-[9px] text-zinc-600 leading-relaxed border-t border-zinc-800/60">
            Drag widgets to reposition. Drag bottom-right corner to resize.
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-6 bg-zinc-950 flex items-start justify-center">
          <div>
            <div className="text-[9px] text-zinc-600 mb-2 text-center">{COLS} × {ROWS} grid — drag to place</div>
            <div
              ref={canvasRef}
              className="relative bg-zinc-900/40 border border-zinc-700 rounded-lg overflow-hidden select-none"
              style={{ width: COLS * CELL, height: ROWS * CELL }}
              onClick={() => setSelected(null)}
            >
              {/* Grid lines */}
              <svg className="absolute inset-0 pointer-events-none opacity-20"
                   width={COLS * CELL} height={ROWS * CELL}>
                {Array.from({ length: COLS + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={ROWS * CELL} stroke="#52525b" strokeWidth={i === 0 || i === COLS ? 1.5 : 0.5} />
                ))}
                {Array.from({ length: ROWS + 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * CELL} x2={COLS * CELL} y2={i * CELL} stroke="#52525b" strokeWidth={i === 0 || i === ROWS ? 1.5 : 0.5} />
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
                      left:   w.x * CELL + 2,
                      top:    w.y * CELL + 2,
                      width:  w.w * CELL - 4,
                      height: w.h * CELL - 4,
                    }}
                    onMouseDown={(e) => onWidgetMouseDown(e, w.localId)}
                  >
                    {/* Type badge */}
                    <div className={`absolute top-1 left-1.5 text-[9px] font-semibold uppercase tracking-wider px-1 rounded ${
                      isSelected ? "text-blue-300" : "text-zinc-500"
                    }`}>
                      {w.type}
                    </div>

                    {/* Binding preview */}
                    {w.binding && (
                      <div className="absolute bottom-1 left-1.5 right-6 text-[8px] font-mono text-purple-400 truncate">
                        {w.binding}
                      </div>
                    )}

                    {/* Label preview */}
                    {typeof w.config?.label === "string" && w.config.label && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-300 pointer-events-none">
                        {w.config.label}
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
                  <span className="text-3xl opacity-30">⬛</span>
                  <span className="text-[11px]">Click a widget type on the left to add it</span>
                </div>
              )}
            </div>
            <div className="text-[9px] text-zinc-600 mt-2 text-center">
              {widgets.length} widget{widgets.length !== 1 ? "s" : ""} · Click canvas to deselect
            </div>
          </div>
        </div>

        {/* Properties */}
        <div className="w-64 border-l border-zinc-800 bg-zinc-900/30 overflow-auto shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-3 pt-3 pb-2">Properties</div>
          <div className="px-3 pb-4">
            {selectedWidget ? (
              <FpWidgetProps
                w={selectedWidget}
                params={params}
                onChange={(patch) => updateWidget(selectedWidget.localId, patch)}
                onRemove={() => {
                  setWidgets((ws) => ws.filter((x) => x.localId !== selectedWidget.localId));
                  setSelected(null);
                }}
              />
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
  param: FaceplateParam;
  onChange: (patch: Partial<FaceplateParam>) => void;
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
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 text-xs">×</button>
    </div>
  );
}

// ── Faceplate card (in left panel tree) ───────────────────────────────────

function FaceplateCard({ fp }: { fp: Faceplate }) {
  const { updateFaceplate, removeFaceplate } = useProject();
  const [open,       setOpen]       = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const setPs = (params: FaceplateParam[]) => updateFaceplate(fp.id, { params });
  const addParam    = () => setPs([...fp.params, { name: `param${fp.params.length + 1}` }]);
  const updateParam = (i: number, patch: Partial<FaceplateParam>) =>
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
          <span className="text-[10px] text-zinc-500 w-3">{open ? "▾" : "▸"}</span>
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <input
            value={fp.name}
            onChange={(e) => { e.stopPropagation(); updateFaceplate(fp.id, { name: e.target.value }); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-xs font-medium text-zinc-200 outline-none"
            placeholder="Faceplate Name"
          />
          <span className="text-[10px] text-zinc-600 shrink-0">
            {fp.params.length}p · {fp.widgets.length}w
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); removeFaceplate(fp.id); }}
            className="text-zinc-600 hover:text-red-400 text-xs shrink-0"
          >×</button>
        </div>

        {/* Expanded detail */}
        {open && (
          <div className="px-3 py-2 space-y-3 bg-zinc-900/30">
            <input
              value={fp.description ?? ""}
              onChange={(e) => updateFaceplate(fp.id, { description: e.target.value || undefined })}
              placeholder="Description"
              className={`${inp} text-[10px]`}
            />

            {/* Open visual editor */}
            <button
              onClick={() => setShowEditor(true)}
              className="w-full text-xs py-2 rounded bg-purple-700/60 hover:bg-purple-600/70 text-purple-100 font-medium flex items-center justify-center gap-2"
            >
              <span>⬛</span> Open Visual Editor
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
                  <span className="text-zinc-600 font-mono flex-1 truncate text-purple-400">{w.binding ?? "—"}</span>
                  <span className="text-zinc-700">{w.w}×{w.h}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showEditor && (
        <FaceplateEditorModal
          fp={fp}
          onClose={() => setShowEditor(false)}
          onSave={(widgets, params) => {
            updateFaceplate(fp.id, { widgets, params });
          }}
        />
      )}
    </>
  );
}

// ── Faceplates panel ───────────────────────────────────────────────────────

export function Faceplates() {
  const { project, addFaceplate } = useProject();
  const faceplates = project.faceplates ?? [];

  const handleAdd = () => addFaceplate({
    id: `fp-${Math.random().toString(36).slice(2, 8)}`,
    name: `Faceplate ${faceplates.length + 1}`,
    params: [{ name: "prefix", description: "Tag prefix" }],
    widgets: [],
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Faceplate Templates</div>
        <button onClick={handleAdd}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">
          + New
        </button>
      </div>

      {faceplates.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic leading-relaxed">
          Faceplates are reusable HMI templates. Create one, build its layout in the visual editor, then drop it onto the canvas and set parameter values (e.g. tag prefix).
        </div>
      )}

      <div className="space-y-2">
        {faceplates.map((fp) => <FaceplateCard key={fp.id} fp={fp} />)}
      </div>
    </div>
  );
}
