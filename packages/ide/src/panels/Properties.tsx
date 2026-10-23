import { useRef, useState, useEffect } from "react";
import { useProject, type Dynamic } from "../store/projectStore";
import { useTag } from "../hooks/useTag";
import { PositionEditor } from "./Canvas";
import { registerWidget, getWidget, type PropertiesPanelProps } from "../widgets/widgetRegistry";

const qualityColor: Record<string, string> = {
  Good: "text-emerald-400", Bad: "text-red-400", Uncertain: "text-amber-400",
  Unknown: "text-zinc-600", Write: "text-purple-400",
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? `${v}` : v.toFixed(3);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
};

// ── Binding input with ns: autocomplete ──────────────────────────────────────

function BindingInput({
  value,
  onChange,
  placeholder = "ds:tagPath",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { project } = useProject();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const nsNodes = project.namespace ?? [];

  // Filter namespace suggestions when user has typed "ns:"
  const suggestions = (() => {
    if (!value.startsWith("ns:")) return [];
    const query = value.slice(3).toLowerCase();
    return nsNodes
      .filter((n) => (n.type === "tag" || n.type === "virtual") && n.path.toLowerCase().includes(query))
      .slice(0, 12);
  })();

  const showDrop = open && suggestions.length > 0;

  // Close on outside click
  useEffect(() => {
    if (!showDrop) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDrop]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {showDrop && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {suggestions.map((n) => (
            <button
              key={n.path}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(`ns:${n.path}`);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-700 flex items-center gap-2 min-w-0"
            >
              <span className="text-emerald-400 text-[10px] shrink-0">◆</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-zinc-100 font-mono truncate">{n.path}</div>
                {(n.driverId || n.description) && (
                  <div className="text-[9px] text-zinc-500 truncate">
                    {n.driverId && <span className="font-mono">{n.driverId}:{n.driverAddr}</span>}
                    {n.description && <span className="ml-1">{n.description}</span>}
                  </div>
                )}
              </div>
              {n.unit && <span className="text-[9px] text-zinc-600 shrink-0">{n.unit}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTagPreview({ binding }: { binding?: string }) {
  const t = useTag(binding);
  if (!binding) return null;
  return (
    <div className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded bg-zinc-950/60 border border-zinc-800">
      <span className="text-xs font-mono font-semibold text-zinc-200">{fmt(t.value)}</span>
      <span className={`text-[10px] ml-auto ${qualityColor[t.quality] ?? "text-zinc-600"}`}>{t.quality}</span>
    </div>
  );
}

function PageProperties({ page }: { page: { id: string; name: string; backgroundColor?: string; script?: string } }) {
  const { updatePage } = useProject();
  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  return (
    <div className="p-3 space-y-4 overflow-auto">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 pb-1 border-b border-zinc-800">Page Properties</div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Page name</div>
        <input value={page.name} onChange={(e) => updatePage(page.id, { name: e.target.value })} className={inp} />
      </div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-1">Background color</div>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {["default", "custom"].map((opt) => {
            const cur = page.backgroundColor ?? "";
            const active = opt === "default" ? cur === "" : cur !== "";
            return (
              <button key={opt}
                onClick={() => updatePage(page.id, { backgroundColor: opt === "default" ? "" : "#111111" })}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}>{opt}</button>
            );
          })}
        </div>
        {(page.backgroundColor ?? "") !== "" && (
          <div className="flex gap-1.5 items-center">
            <input type="color" value={page.backgroundColor ?? "#111111"}
              onChange={(e) => updatePage(page.id, { backgroundColor: e.target.value })}
              className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            <input value={page.backgroundColor ?? ""} onChange={(e) => updatePage(page.id, { backgroundColor: e.target.value })}
              className={`${inp} font-mono text-[10px]`} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Page Script</div>
        <div className="text-[10px] text-zinc-600 mb-1.5 leading-relaxed">
          Variables available: <code className="bg-zinc-800 px-0.5 rounded text-zinc-400">tags</code> object with tag paths as keys.<br />
          Example: <code className="bg-zinc-800 px-0.5 rounded text-zinc-400">{"// tags['rest:path'] > 5000"}</code>
        </div>
        <textarea
          value={page.script ?? ""}
          onChange={(e) => updatePage(page.id, { script: e.target.value })}
          placeholder={"// Page-level script runs when tags update\n// Example:\n// if (tags['rest:ds:path'] > 100) { ... }"}
          rows={8}
          className={`${inp} font-mono text-[10px] resize-y`}
        />
        <div className="text-[10px] text-zinc-600 mt-1">Page scripting executes in runtime — logic here affects all widgets on this page.</div>
      </div>
    </div>
  );
}

export function Properties() {
  const { project, activePageId, selectedWidgetId, updateWidget } = useProject();
  const page = project.pages.find((p) => p.id === activePageId);
  const w = page?.widgets.find((x) => x.id === selectedWidgetId);

  if (!w || !page) {
    return page
      ? <PageProperties page={page} />
      : <div className="p-3 text-xs text-zinc-500">No page selected.</div>;
  }

  const setConfig = (k: string, v: unknown) =>
    updateWidget(page.id, w.id, { config: { ...(w.config ?? {}), [k]: v } });

  const cfgStr = (k: string, def = "") => (w.config?.[k] as string) ?? def;
  const cfgNum = (k: string, def?: number) => (w.config?.[k] as number | undefined) ?? def;
  const cfgBool = (k: string, def = false) => (w.config?.[k] as boolean | undefined) ?? def;

  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  const numInp = `${inp} font-mono`;
  const label = (t: string) => <div className="text-[10px] text-zinc-500 mb-0.5">{t}</div>;

  const panelProps: PropertiesPanelProps = { w, page, project, setConfig, cfgStr, cfgNum, cfgBool, inp, numInp, label };
  const WidgetPanel = getWidget(w.type)?.PropertiesPanel;

  return (
    <div className="p-3 space-y-4 overflow-auto">
      {/* Widget meta */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Widget</div>
        <div className="text-sm font-medium">{w.type}</div>
        <div className="text-[10px] text-zinc-600 font-mono">{w.id}</div>
      </div>

      {/* Binding + live value */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Binding</div>
        <BindingInput
          value={w.binding ?? ""}
          onChange={(v) => updateWidget(page.id, w.id, { binding: v || undefined })}
          placeholder="ds:tagPath or ns:path"
          className={`${inp} font-mono w-full`}
        />
        <div className="text-[10px] text-zinc-600 mt-0.5">Drag tag from browser → widget</div>
        <LiveTagPreview binding={w.binding} />
      </div>

      {/* Dynamics */}
      <DynamicsEditor w={w} pageId={page.id} />

      {/* Layout */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Layout</div>
        <PositionEditor pageId={page.id} widgetId={w.id} />
      </div>

      {/* Color binding (all types) */}
      <ColorBindingEditor w={w} setConfig={setConfig} cfgStr={cfgStr} inp={inp} numInp={numInp} label={label} />

      {/* Label (all types) */}
      <div>
        {label("Label")}
        <input value={cfgStr("label")} onChange={(e) => setConfig("label", e.target.value)} className={inp} />
      </div>

      {/* Appearance — all widget types */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Appearance</div>

        {/* Background */}
        <div>
          {label("Background")}
          <div className="flex gap-1.5 flex-wrap">
            {["default", "transparent", "custom"].map((opt) => {
              const cur = cfgStr("bgColor", "");
              const active = opt === "transparent" ? cur === "transparent" || cur === "none"
                           : opt === "default"     ? cur === ""
                           : cur !== "" && cur !== "transparent" && cur !== "none";
              return (
                <button key={opt}
                  onClick={() => {
                    if (opt === "default")      setConfig("bgColor", "");
                    if (opt === "transparent")  setConfig("bgColor", "transparent");
                    if (opt === "custom")       setConfig("bgColor", "#1c1c1e");
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{opt}</button>
              );
            })}
            {cfgStr("bgColor","") !== "" && cfgStr("bgColor","") !== "transparent" && cfgStr("bgColor","") !== "none" && (
              <div className="flex gap-1 items-center flex-1 min-w-0">
                <input type="color" value={cfgStr("bgColor","#1c1c1e")}
                  onChange={(e) => setConfig("bgColor", e.target.value)}
                  className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                <input value={cfgStr("bgColor","")} onChange={(e) => setConfig("bgColor", e.target.value)}
                  className={`${inp} font-mono text-[10px]`} />
              </div>
            )}
          </div>
        </div>

        {/* Border */}
        <div>
          {label("Border color")}
          <div className="flex gap-1.5 flex-wrap">
            {["default", "none", "custom"].map((opt) => {
              const cur = cfgStr("borderColor", "");
              const active = opt === "none"    ? cur === "transparent" || cur === "none"
                           : opt === "default" ? cur === ""
                           : cur !== "" && cur !== "transparent" && cur !== "none";
              return (
                <button key={opt}
                  onClick={() => {
                    if (opt === "default") setConfig("borderColor", "");
                    if (opt === "none")    setConfig("borderColor", "transparent");
                    if (opt === "custom")  setConfig("borderColor", "#3f3f46");
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{opt}</button>
              );
            })}
            {cfgStr("borderColor","") !== "" && cfgStr("borderColor","") !== "transparent" && cfgStr("borderColor","") !== "none" && (
              <div className="flex gap-1 items-center flex-1 min-w-0">
                <input type="color" value={cfgStr("borderColor","#3f3f46")}
                  onChange={(e) => setConfig("borderColor", e.target.value)}
                  className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                <input value={cfgStr("borderColor","")} onChange={(e) => setConfig("borderColor", e.target.value)}
                  className={`${inp} font-mono text-[10px]`} />
              </div>
            )}
          </div>
        </div>

        {/* Quality indicator toggle */}
        <label className="flex items-center gap-2 cursor-pointer pt-0.5">
          <input type="checkbox"
            checked={cfgBool("showQuality", true)}
            onChange={(e) => setConfig("showQuality", e.target.checked)}
            className="accent-blue-500" />
          <span className="text-xs text-zinc-300">Show quality indicator (Good / Bad)</span>
        </label>

        {/* No padding toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox"
            checked={cfgBool("noPadding", false)}
            onChange={(e) => setConfig("noPadding", e.target.checked)}
            className="accent-blue-500" />
          <span className="text-xs text-zinc-300">Remove padding</span>
        </label>
      </div>

      {/* Typography — all widget types */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Typography</div>

        {/* Font family */}
        <div>
          {label("Font")}
          <div className="flex gap-1 flex-wrap">
            {(["default", "mono", "sans", "serif"] as const).map((f) => {
              const cur = cfgStr("fontFamily", "");
              const active = f === "default" ? cur === "" : cur === f;
              const fontCls = f === "mono" ? "font-mono" : f === "sans" ? "font-sans" : f === "serif" ? "font-serif" : "";
              return (
                <button key={f} onClick={() => setConfig("fontFamily", f === "default" ? "" : f)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${fontCls} ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{f === "default" ? "default" : f}</button>
              );
            })}
          </div>
        </div>

        {/* Font size */}
        <div>
          {label("Size")}
          <div className="flex gap-1 flex-wrap">
            {(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"] as const).map((s) => {
              const cur = cfgStr("fontSize", "");
              const active = s === "base" ? cur === "" || cur === "base" : cur === s;
              return (
                <button key={s} onClick={() => setConfig("fontSize", s === "base" ? "" : s)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{s}</button>
              );
            })}
          </div>
        </div>

        {/* Style toggles + alignment */}
        <div className="flex gap-3 items-center flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={cfgBool("fontBold", false)}
              onChange={(e) => setConfig("fontBold", e.target.checked)}
              className="accent-blue-500" />
            <span className="text-xs text-zinc-300 font-bold">Bold</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={cfgBool("fontItalic", false)}
              onChange={(e) => setConfig("fontItalic", e.target.checked)}
              className="accent-blue-500" />
            <span className="text-xs text-zinc-300 italic">Italic</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={cfgBool("fontUnderline", false)}
              onChange={(e) => setConfig("fontUnderline", e.target.checked)}
              className="accent-blue-500" />
            <span className="text-xs text-zinc-300 underline">Underline</span>
          </label>
        </div>

        {/* Text align */}
        <div>
          {label("Align")}
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => {
              const cur = cfgStr("textAlign", "");
              const active = a === "left" ? cur === "" || cur === "left" : cur === a;
              return (
                <button key={a} onClick={() => setConfig("textAlign", a === "left" ? "" : a)}
                  className={`px-2.5 py-0.5 rounded text-[10px] border transition-colors ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{a === "left" ? "⬛ Left" : a === "center" ? "⬛ Center" : "⬛ Right"}</button>
              );
            })}
          </div>
        </div>

        {/* Text color */}
        <div>
          {label("Text color")}
          <div className="flex gap-1.5 items-center flex-wrap">
            {["default", "custom"].map((opt) => {
              const cur = cfgStr("textColor", "");
              const active = opt === "default" ? cur === "" : cur !== "";
              return (
                <button key={opt} onClick={() => setConfig("textColor", opt === "default" ? "" : "#e4e4e7")}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{opt}</button>
              );
            })}
            {cfgStr("textColor", "") !== "" && (
              <div className="flex gap-1 items-center flex-1 min-w-0">
                <input type="color" value={cfgStr("textColor", "#e4e4e7")}
                  onChange={(e) => setConfig("textColor", e.target.value)}
                  className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                <input value={cfgStr("textColor", "")} onChange={(e) => setConfig("textColor", e.target.value)}
                  className={`${inp} font-mono text-[10px]`} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-widget panel — looked up from the registry */}
      {WidgetPanel && <WidgetPanel {...panelProps} />}
    </div>
  );
}

// ── Multi-State editor ────────────────────────────────────────────────────

type StateEntry = { value: number | string; label: string; color: string; textColor?: string };

function MultiStateEditor({ w, setConfig, inp, label }: {
  w: { config?: Record<string, unknown> };
  setConfig: (k: string, v: unknown) => void;
  inp: string; label: LabelFn;
}) {
  const states: StateEntry[] = (w.config?.states as StateEntry[]) ?? [
    { value: 0, label: "OFF",      color: "#27272a", textColor: "#a1a1aa" },
    { value: 1, label: "RUNNING",  color: "#14532d", textColor: "#4ade80" },
    { value: 2, label: "FAULT",    color: "#450a0a", textColor: "#f87171" },
  ];

  const update = (idx: number, patch: Partial<StateEntry>) => {
    const next = states.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setConfig("states", next);
  };

  const add = () => {
    setConfig("states", [...states, { value: states.length, label: "STATE " + states.length, color: "#1c1c1e", textColor: "#ffffff" }]);
  };

  const remove = (idx: number) => setConfig("states", states.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label("States")}
        <button onClick={add} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
      </div>
      <div className="space-y-1.5">
        {states.map((s, i) => (
          <div key={i} className="border border-zinc-700/50 rounded p-1.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 shrink-0">val</span>
              <input value={String(s.value)} placeholder="0"
                onChange={(e) => update(i, { value: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })}
                className={`${inp} w-12 font-mono text-[10px]`} />
              <input value={s.label} placeholder="label"
                onChange={(e) => update(i, { label: e.target.value })}
                className={`${inp} flex-1`} />
              <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 w-6">bg</span>
              <input type="color" value={s.color}
                onChange={(e) => update(i, { color: e.target.value })}
                className="h-5 w-7 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
              <span className="text-[10px] text-zinc-500 w-6">txt</span>
              <input type="color" value={s.textColor ?? "#ffffff"}
                onChange={(e) => update(i, { textColor: e.target.value })}
                className="h-5 w-7 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trend series editor ────────────────────────────────────────────────────

const SERIES_COLORS = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#a855f7","#06b6d4"];
type TrendSeries = { binding: string; color: string; label?: string; fill?: boolean; yMin?: number; yMax?: number };
type RefLine = { value: number; color: string; label?: string };

function TrendSeriesEditor({ w, setConfig, inp, label }: {
  w: { binding?: string; config?: Record<string, unknown> };
  setConfig: (k: string, v: unknown) => void;
  inp: string; label: LabelFn;
}) {
  const cfgTags = w.config?.tags as TrendSeries[] | undefined;
  // If no explicit tags config, seed from the widget binding (series 0).
  const tags: TrendSeries[] = cfgTags ?? (w.binding ? [{ binding: w.binding, color: SERIES_COLORS[0]! }] : []);

  const update = (idx: number, patch: Partial<TrendSeries>) => {
    const next = tags.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setConfig("tags", next);
  };

  const add = () => {
    const color = SERIES_COLORS[tags.length % SERIES_COLORS.length]!;
    setConfig("tags", [...tags, { binding: "", color, label: "" }]);
  };

  const remove = (idx: number) => setConfig("tags", tags.filter((_, i) => i !== idx));

  if (tags.length <= 1 && !cfgTags) {
    // Single-series mode — show "add series" to switch to multi.
    return (
      <div>
        {label("Multi-series")}
        <button onClick={add} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 w-full text-left">
          + add second series
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label("Series")}
        {tags.length < 6 && (
          <button onClick={add} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
        )}
      </div>
      <div className="space-y-2">
        {tags.map((s, i) => (
          <div key={i} className="border border-zinc-700/50 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <input type="color" value={s.color}
                onChange={(e) => update(i, { color: e.target.value })}
                className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
              <input value={s.label ?? ""} placeholder="label"
                onChange={(e) => update(i, { label: e.target.value })}
                className={`${inp} flex-1`} />
              <label className="flex items-center gap-0.5 text-[9px] text-zinc-500 shrink-0 cursor-pointer" title="Fill area">
                <input type="checkbox" checked={s.fill ?? false}
                  onChange={(e) => update(i, { fill: e.target.checked || undefined })}
                  className="accent-blue-500 scale-75" />
                fill
              </label>
              {tags.length > 1 && (
                <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
              )}
            </div>
            <input value={s.binding} placeholder="ds:tagPath"
              onChange={(e) => update(i, { binding: e.target.value })}
              className={`${inp} font-mono text-[10px]`} />
            <div className="flex gap-1 items-center">
              <span className="text-[9px] text-zinc-600 shrink-0">Y range</span>
              <input type="number" placeholder="min"
                value={s.yMin ?? ""}
                onChange={(e) => update(i, { yMin: e.target.value === "" ? undefined : Number(e.target.value) })}
                className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:border-zinc-500" />
              <span className="text-[9px] text-zinc-600">–</span>
              <input type="number" placeholder="max"
                value={s.yMax ?? ""}
                onChange={(e) => update(i, { yMax: e.target.value === "" ? undefined : Number(e.target.value) })}
                className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:border-zinc-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reference lines editor ────────────────────────────────────────────────

function RefLinesEditor({ w, setConfig, inp, label }: {
  w: { config?: Record<string, unknown> };
  setConfig: (k: string, v: unknown) => void;
  inp: string; label: LabelFn;
}) {
  const lines: RefLine[] = (w.config?.refLines as RefLine[]) ?? [];
  const update = (idx: number, patch: Partial<RefLine>) =>
    setConfig("refLines", lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const add = () => setConfig("refLines", [...lines, { value: 0, color: "#ef4444", label: "" }]);
  const remove = (idx: number) => setConfig("refLines", lines.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label("Reference Lines")}
        <button onClick={add} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
      </div>
      {lines.length === 0 && <div className="text-[10px] text-zinc-600 italic">No reference lines.</div>}
      <div className="space-y-1.5">
        {lines.map((rl, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="color" value={rl.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            <input type="number" value={rl.value}
              onChange={(e) => update(i, { value: Number(e.target.value) })}
              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-zinc-500" />
            <input value={rl.label ?? ""} placeholder="label"
              onChange={(e) => update(i, { label: e.target.value })}
              className={`${inp} flex-1`} />
            <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Image source editor ────────────────────────────────────────────────────

function ImageUploadEditor({ setConfig, cfgStr, inp, label }: {
  setConfig: (k: string, v: unknown) => void;
  cfgStr: (k: string, def?: string) => string;
  inp: string; label: LabelFn;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const src = cfgStr("src");
  const images = useProject(s => s.project.images ?? []);

  // Resolve current src for preview
  const isLib = src.startsWith("lib:");
  const libId = isLib ? src.slice(4) : null;
  const libAsset = libId ? images.find(i => i.id === libId) : null;
  const previewSrc = isLib ? (libAsset?.dataUrl ?? null) : (src || null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setConfig("src", reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Library picker */}
      {images.length > 0 && (
        <div>
          {label("From image library")}
          <div className="grid grid-cols-3 gap-1 mt-1 max-h-40 overflow-auto">
            {images.map(img => (
              <button
                key={img.id}
                onClick={() => setConfig("src", `lib:${img.id}`)}
                title={img.name}
                className={`rounded border p-0.5 transition-colors ${
                  libId === img.id
                    ? "border-blue-500 bg-blue-950/30"
                    : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40"
                }`}
              >
                <img src={img.dataUrl} alt={img.name}
                  className="w-full object-contain rounded"
                  style={{ height: 40 }} />
              </button>
            ))}
          </div>
          {images.length > 0 && (
            <div className="text-[9px] text-zinc-600 mt-1">Click to select · or use URL / upload below</div>
          )}
        </div>
      )}

      {/* URL input */}
      <div>
        {label("Image URL")}
        <input
          value={isLib ? "" : src}
          onChange={e => setConfig("src", e.target.value)}
          placeholder="https://… or leave blank"
          className={`mt-1 ${inp}`}
        />
      </div>

      {/* Upload fallback */}
      <button onClick={() => fileRef.current?.click()}
        className="w-full py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 border-dashed">
        Upload from file…
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* Preview + clear */}
      {previewSrc && (
        <div className="space-y-1">
          <img src={previewSrc} alt=""
            className="w-full max-h-24 object-contain rounded border border-zinc-700 bg-zinc-950" />
          {libAsset && (
            <div className="text-[10px] text-zinc-500 text-center">{libAsset.name} · {libAsset.width}×{libAsset.height}</div>
          )}
          <button onClick={() => setConfig("src", undefined)}
            className="text-[10px] text-red-500 hover:text-red-400">Remove image</button>
        </div>
      )}
    </div>
  );
}

// ── Color binding editor ───────────────────────────────────────────────────

type ColorThreshold = { value: number; toValue?: number; color: string };

function ColorBindingEditor({ w, setConfig, cfgStr, inp, numInp, label }: {
  w: { binding?: string; config?: Record<string, unknown> };
  setConfig: (k: string, v: unknown) => void;
  cfgStr: (k: string, def?: string) => string;
  inp: string; numInp: string; label: LabelFn;
}) {
  const thresholds: ColorThreshold[] = (w.config?.colorThresholds as ColorThreshold[]) ?? [];

  const update = (idx: number, patch: Partial<ColorThreshold>) => {
    setConfig("colorThresholds", thresholds.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };
  const add = () => {
    const lastVal = thresholds.at(-1)?.value ?? 75;
    setConfig("colorThresholds", [...thresholds, { value: lastVal + 10, color: "#ef4444" }]);
  };
  const remove = (idx: number) => setConfig("colorThresholds", thresholds.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Frame Border Color</div>
      <div className="mb-1.5">
        <div className="text-[10px] text-zinc-500 mb-0.5">Source tag (blank = use binding)</div>
        <BindingInput
          value={cfgStr("colorBinding")}
          onChange={(v) => setConfig("colorBinding", v || undefined)}
          placeholder="ds:tagPath or ns:path"
          className={`${inp} font-mono w-full`}
        />
      </div>
      <div className="flex items-center justify-between mb-1">
        {label("Thresholds (from → to → color)")}
        <button onClick={add} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
      </div>
      <div className="space-y-1">
        {thresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input type="number" value={t.value}
              onChange={(e) => update(i, { value: Number(e.target.value) })}
              title="From (≥)"
              className={`${numInp} w-14`} />
            <span className="text-[10px] text-zinc-600">→</span>
            <input type="number" value={t.toValue ?? ""}
              onChange={(e) => update(i, { toValue: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="∞"
              title="To (exclusive, blank = no upper bound)"
              className={`${numInp} w-14`} />
            <input type="color" value={t.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            <input value={t.color} onChange={(e) => update(i, { color: e.target.value })}
              className={`${inp} flex-1 font-mono text-[10px]`} />
            <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
          </div>
        ))}
        {thresholds.length === 0 && (
          <div className="text-[10px] text-zinc-600 italic">No thresholds — default border</div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-editors ─────────────────────────────────────────────────────

type LabelFn = (t: string) => React.ReactNode;

function RangeEditor({ cfgNum, setConfig, inp, numInp, label, note }: {
  cfgNum: (k: string, def?: number) => number | undefined;
  setConfig: (k: string, v: unknown) => void;
  inp: string; numInp: string; label: LabelFn; note?: string;
}) {
  return (
    <div>
      {label("Range")}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] text-zinc-600">min
          <input type="number" value={cfgNum("min") ?? ""} placeholder="auto"
            onChange={(e) => setConfig("min", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`mt-0.5 ${numInp}`} />
        </label>
        <label className="text-[10px] text-zinc-600">max
          <input type="number" value={cfgNum("max") ?? ""} placeholder="auto"
            onChange={(e) => setConfig("max", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`mt-0.5 ${numInp}`} />
        </label>
      </div>
      {note && <div className="text-[10px] text-zinc-600 mt-0.5">{note}</div>}
    </div>
  );
}

function UnitEditor({ cfgStr, setConfig, inp, label }: {
  cfgStr: (k: string, def?: string) => string;
  setConfig: (k: string, v: unknown) => void;
  inp: string; label: LabelFn;
}) {
  return (
    <div>
      {label("Unit")}
      <input value={cfgStr("unit")} onChange={(e) => setConfig("unit", e.target.value)}
        placeholder="°C, bar, rpm…" className={inp} />
    </div>
  );
}

type Threshold = { value: number; toValue?: number; color: string };

function ThresholdEditor({ w, setConfig, inp, numInp, label }: {
  w: { config?: Record<string, unknown> };
  setConfig: (k: string, v: unknown) => void;
  inp: string; numInp: string; label: LabelFn;
}) {
  const thresholds: Threshold[] = (w.config?.thresholds as Threshold[]) ?? [];

  const update = (idx: number, patch: Partial<Threshold>) => {
    const next = thresholds.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setConfig("thresholds", next);
  };

  const add = () => {
    const lastVal = thresholds.at(-1)?.value ?? 75;
    setConfig("thresholds", [...thresholds, { value: lastVal + 10, color: "#ef4444" }]);
  };

  const remove = (idx: number) => {
    setConfig("thresholds", thresholds.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label("Fill Color Thresholds (from → to)")}
        <button onClick={add} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
      </div>
      <div className="space-y-1">
        {thresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input type="number" value={t.value}
              onChange={(e) => update(i, { value: Number(e.target.value) })}
              title="From (≥)"
              className={`${numInp} w-14`} />
            <span className="text-[10px] text-zinc-600">→</span>
            <input type="number" value={t.toValue ?? ""}
              onChange={(e) => update(i, { toValue: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="∞"
              title="To (exclusive, blank = no upper bound)"
              className={`${numInp} w-14`} />
            <input type="color" value={t.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            <input value={t.color} onChange={(e) => update(i, { color: e.target.value })}
              className={`${inp} flex-1 font-mono text-[10px]`} />
            <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
          </div>
        ))}
        {thresholds.length === 0 && (
          <div className="text-[10px] text-zinc-600 italic">No thresholds — default fill color</div>
        )}
      </div>
    </div>
  );
}

// ── Dynamics editor ───────────────────────────────────────────────────────

const DYN_KINDS: { kind: Dynamic["kind"]; label: string; group: "property" | "action" | "script" }[] = [
  { kind: "visibility", label: "Visibility",   group: "property" },
  { kind: "colorFill",  label: "Color / Fill", group: "property" },
  { kind: "blink",      label: "Blink",        group: "property" },
  { kind: "rotation",   label: "Rotation",     group: "property" },
  { kind: "disable",    label: "Disable",      group: "property" },
  { kind: "script",     label: "Script / Expression", group: "script" },
  { kind: "onClick",    label: "On Click",     group: "action"   },
  { kind: "onPressed",  label: "On Pressed",   group: "action"   },
  { kind: "onReleased", label: "On Released",  group: "action"   },
];

const ACTION_TYPES: { value: string; label: string }[] = [
  { value: "writeValue",    label: "Write value"    },
  { value: "toggleValue",   label: "Toggle value"   },
  { value: "incrementValue",label: "Increment value"},
  { value: "navigate",      label: "Navigate page"  },
  { value: "openUrl",       label: "Open URL"       },
];

function uid() { return Math.random().toString(36).slice(2, 8); }

function DynamicCard({ d, onUpdate, onRemove, pages, inp, numInp }: {
  d: Dynamic;
  onUpdate: (patch: Partial<Dynamic>) => void;
  onRemove: () => void;
  pages: { id: string; name: string }[];
  inp: string; numInp: string;
}) {
  const [open, setOpen] = useState(true);
  const meta = DYN_KINDS.find((k) => k.kind === d.kind);
  const isAction = meta?.group === "action";

  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-zinc-800/60 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[9px] text-zinc-500">{open ? "▼" : "▶"}</span>
        <span className="text-[11px] font-medium text-zinc-200 flex-1">{meta?.label ?? d.kind}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-zinc-600 hover:text-red-400 text-sm leading-none px-1"
        >×</button>
      </div>

      {open && (
        <div className="p-2 space-y-2 bg-zinc-900/40">
          {/* Property dynamics — binding */}
          {!isAction && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-0.5">Binding</div>
              <BindingInput
                value={d.binding ?? ""}
                onChange={(v) => onUpdate({ binding: v || undefined })}
                placeholder="ds:tagPath or ns:path"
                className={`${inp} font-mono text-[10px] w-full`}
              />
            </div>
          )}

          {/* colorFill colors */}
          {d.kind === "colorFill" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">True color</div>
                <div className="flex gap-1">
                  <input type="color" value={d.trueColor ?? "#22c55e"} onChange={(e) => onUpdate({ trueColor: e.target.value })}
                    className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
                  <input value={d.trueColor ?? "#22c55e"} onChange={(e) => onUpdate({ trueColor: e.target.value })}
                    className={`${inp} flex-1 font-mono text-[10px]`} />
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">False color</div>
                <div className="flex gap-1">
                  <input type="color" value={d.falseColor ?? "#3f3f46"} onChange={(e) => onUpdate({ falseColor: e.target.value })}
                    className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
                  <input value={d.falseColor ?? "#3f3f46"} onChange={(e) => onUpdate({ falseColor: e.target.value })}
                    className={`${inp} flex-1 font-mono text-[10px]`} />
                </div>
              </div>
            </div>
          )}

          {/* blink period */}
          {d.kind === "blink" && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-0.5">Period (ms)</div>
              <input type="number" min={100} max={5000} step={100}
                value={d.blinkPeriodMs ?? 800}
                onChange={(e) => onUpdate({ blinkPeriodMs: Number(e.target.value) })}
                className={numInp} />
            </div>
          )}

          {/* rotation range */}
          {d.kind === "rotation" && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Value min</div>
                  <input type="number" value={d.minValue ?? 0} onChange={(e) => onUpdate({ minValue: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Value max</div>
                  <input type="number" value={d.maxValue ?? 100} onChange={(e) => onUpdate({ maxValue: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Angle min °</div>
                  <input type="number" value={d.minAngle ?? -90} onChange={(e) => onUpdate({ minAngle: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Angle max °</div>
                  <input type="number" value={d.maxAngle ?? 90} onChange={(e) => onUpdate({ maxAngle: Number(e.target.value) })} className={numInp} />
                </div>
              </div>
            </>
          )}

          {/* script dynamic */}
          {d.kind === "script" && (
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Tag binding</div>
                <BindingInput
                  value={d.binding ?? ""}
                  onChange={(v) => onUpdate({ binding: v || undefined })}
                  placeholder="ds:tagPath or ns:path"
                  className={`${inp} font-mono text-[10px] w-full`}
                />
                <LiveTagPreview binding={d.binding} />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Expression <span className="text-zinc-600 font-normal normal-case">(use <code className="bg-zinc-800 px-0.5 rounded">value</code> for tag value)</span></div>
                <input value={d.expression ?? "value"} onChange={(e) => onUpdate({ expression: e.target.value })}
                  placeholder="value > 5000" className={`${inp} font-mono text-[10px]`} />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Target property</div>
                <select value={d.targetProp ?? "bgColor"} onChange={(e) => onUpdate({ targetProp: e.target.value })} className={inp}>
                  <option value="bgColor">Background color</option>
                  <option value="borderColor">Border color</option>
                  <option value="textColor">Text color</option>
                  <option value="visible">Visibility (hide when false)</option>
                </select>
              </div>
              {d.targetProp !== "visible" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-0.5">When TRUE</div>
                    <div className="flex gap-1">
                      <input type="color" value={d.trueValue ?? "#22c55e"}
                        onChange={(e) => onUpdate({ trueValue: e.target.value })}
                        className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                      <input value={d.trueValue ?? ""} onChange={(e) => onUpdate({ trueValue: e.target.value })}
                        placeholder="#22c55e" className={`${inp} font-mono text-[10px]`} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-0.5">When FALSE</div>
                    <div className="flex gap-1">
                      <input type="color" value={d.falseValue ?? "#3f3f46"}
                        onChange={(e) => onUpdate({ falseValue: e.target.value })}
                        className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                      <input value={d.falseValue ?? ""} onChange={(e) => onUpdate({ falseValue: e.target.value })}
                        placeholder="(leave blank to keep default)" className={`${inp} font-mono text-[10px]`} />
                    </div>
                  </div>
                </div>
              )}
              <div className="text-[10px] text-zinc-600 italic border-t border-zinc-800 pt-1">
                Example: <code className="bg-zinc-800 px-0.5 rounded">value &gt; 5000</code> → background turns red when tag exceeds 5000
              </div>
            </div>
          )}

          {/* action dynamics */}
          {isAction && (
            <>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Action</div>
                <select value={d.actionType ?? ""}
                  onChange={(e) => onUpdate({ actionType: e.target.value as Dynamic["actionType"] || undefined })}
                  className={inp}>
                  <option value="">— choose —</option>
                  {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>

              {d.actionType === "navigate" && (
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Target page</div>
                  <select value={d.pageId ?? ""} onChange={(e) => onUpdate({ pageId: e.target.value })} className={inp}>
                    <option value="">— select —</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {d.actionType === "openUrl" && (
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">URL</div>
                  <input value={d.url ?? ""} onChange={(e) => onUpdate({ url: e.target.value })} placeholder="https://…" className={inp} />
                </div>
              )}

              {(d.actionType === "writeValue" || d.actionType === "toggleValue" || d.actionType === "incrementValue") && (
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Write to binding</div>
                  <BindingInput
                    value={d.writeTo ?? ""}
                    onChange={(v) => onUpdate({ writeTo: v || undefined })}
                    placeholder="ds:tagPath or ns:path"
                    className={`${inp} font-mono text-[10px] w-full`}
                  />
                </div>
              )}

              {d.actionType === "writeValue" && (
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Value</div>
                  <input value={String(d.writeValue ?? "")}
                    onChange={(e) => onUpdate({ writeValue: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })}
                    placeholder="0" className={numInp} />
                </div>
              )}

              {d.actionType === "incrementValue" && (
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Step</div>
                  <input type="number" value={d.step ?? 1} onChange={(e) => onUpdate({ step: Number(e.target.value) })} className={numInp} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DynamicsEditor({ w, pageId }: { w: import("../store/projectStore").Widget; pageId: string }) {
  const { project, updateWidget } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const dynamics = w.dynamics ?? [];
  const pages = project.pages.map((p) => ({ id: p.id, name: p.name }));

  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  const numInp = `${inp} font-mono`;

  const add = (kind: Dynamic["kind"]) => {
    updateWidget(pageId, w.id, { dynamics: [...dynamics, { id: uid(), kind }] });
    setAddOpen(false);
  };

  const update = (id: string, patch: Partial<Dynamic>) => {
    updateWidget(pageId, w.id, { dynamics: dynamics.map((d) => d.id === id ? { ...d, ...patch } : d) });
  };

  const remove = (id: string) => {
    updateWidget(pageId, w.id, { dynamics: dynamics.filter((d) => d.id !== id) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Dynamics</div>
        <div className="relative">
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          >+ Add</button>
          {addOpen && (
            <div className="absolute right-0 top-6 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-[150px]">
              <div className="text-[9px] text-zinc-500 px-3 py-1 uppercase tracking-wider">Property</div>
              {DYN_KINDS.filter((k) => k.group === "property").map((k) => (
                <button key={k.kind} onClick={() => add(k.kind)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 text-zinc-200">{k.label}</button>
              ))}
              <div className="border-t border-zinc-700 my-1" />
              <div className="text-[9px] text-zinc-500 px-3 py-1 uppercase tracking-wider">Script</div>
              {DYN_KINDS.filter((k) => k.group === "script").map((k) => (
                <button key={k.kind} onClick={() => add(k.kind)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 text-zinc-200">{k.label}</button>
              ))}
              <div className="border-t border-zinc-700 my-1" />
              <div className="text-[9px] text-zinc-500 px-3 py-1 uppercase tracking-wider">Action</div>
              {DYN_KINDS.filter((k) => k.group === "action").map((k) => (
                <button key={k.kind} onClick={() => add(k.kind)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 text-zinc-200">{k.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {dynamics.length === 0 ? (
        <div className="text-[10px] text-zinc-600 italic">No dynamics. Click + Add to begin.</div>
      ) : (
        <div className="space-y-2">
          {dynamics.map((d) => (
            <DynamicCard key={d.id} d={d} onUpdate={(p) => update(d.id, p)} onRemove={() => remove(d.id)}
              pages={pages} inp={inp} numInp={numInp} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-widget PropertiesPanel components ─────────────────────────────────

function GaugeProps({ setConfig, cfgNum, cfgStr, inp, numInp, label, w }: PropertiesPanelProps) {
  return (
    <>
      <RangeEditor cfgNum={cfgNum} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
      <UnitEditor cfgStr={cfgStr} setConfig={setConfig} inp={inp} label={label} />
      <ThresholdEditor w={w} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
    </>
  );
}

function NumericDisplayProps({ setConfig, cfgNum, cfgStr, inp, numInp, label }: PropertiesPanelProps) {
  return (
    <>
      <RangeEditor cfgNum={cfgNum} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
      <UnitEditor cfgStr={cfgStr} setConfig={setConfig} inp={inp} label={label} />
    </>
  );
}

function NumericInputProps({ setConfig, cfgStr, inp, label }: PropertiesPanelProps) {
  return <UnitEditor cfgStr={cfgStr} setConfig={setConfig} inp={inp} label={label} />;
}

function LEDProps({ setConfig, cfgStr, inp, label }: PropertiesPanelProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {label("ON color")}
          <div className="flex gap-1">
            <input type="color" value={cfgStr("trueColor", "#22c55e")}
              onChange={(e) => setConfig("trueColor", e.target.value)}
              className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
            <input value={cfgStr("trueColor", "#22c55e")}
              onChange={(e) => setConfig("trueColor", e.target.value)}
              className={`${inp} flex-1 font-mono text-[10px]`} />
          </div>
        </div>
        <div>
          {label("OFF color")}
          <div className="flex gap-1">
            <input type="color" value={cfgStr("falseColor", "#3f3f46")}
              onChange={(e) => setConfig("falseColor", e.target.value)}
              className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
            <input value={cfgStr("falseColor", "#3f3f46")}
              onChange={(e) => setConfig("falseColor", e.target.value)}
              className={`${inp} flex-1 font-mono text-[10px]`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>{label("ON label")}<input value={cfgStr("trueLabel", "ON")} onChange={(e) => setConfig("trueLabel", e.target.value)} className={inp} /></div>
        <div>{label("OFF label")}<input value={cfgStr("falseLabel", "OFF")} onChange={(e) => setConfig("falseLabel", e.target.value)} className={inp} /></div>
      </div>
    </>
  );
}

function ButtonStyleEditor({ setConfig, cfgStr, inp, label }: Pick<PropertiesPanelProps, "setConfig" | "cfgStr" | "inp" | "label">) {
  const sel = (k: string, v: string, cur: string) => (
    <button onClick={() => setConfig(k, v)}
      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
        cur === v ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
      }`}>{v}</button>
  );

  const variant  = cfgStr("btnVariant", "filled");
  const color    = cfgStr("btnColor",   "blue");
  const rounded  = cfgStr("btnRounded", "md");

  const COLOR_SWATCHES: Record<string, string> = {
    blue: "#3b82f6", green: "#22c55e", red: "#ef4444",
    amber: "#f59e0b", zinc: "#71717a", purple: "#a855f7", orange: "#f97316", white: "#f4f4f5",
  };

  return (
    <>
      <div className="border-t border-zinc-800 pt-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Button Style</div>

        <div className="space-y-2">
          <div>
            {label("Variant")}
            <div className="flex flex-wrap gap-1">
              {["filled","outlined","ghost","flat","industrial"].map((v) => sel("btnVariant", v, variant))}
            </div>
          </div>

          <div>
            {label("Color")}
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {Object.entries(COLOR_SWATCHES).map(([c, hex]) => (
                <button key={c} title={c}
                  onClick={() => setConfig("btnColor", c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-zinc-700 hover:border-zinc-400"}`}
                  style={{ backgroundColor: hex }} />
              ))}
            </div>
          </div>

          <div>
            {label("Corners")}
            <div className="flex gap-1">
              {["none","sm","md","lg","full"].map((r) => sel("btnRounded", r, rounded))}
            </div>
          </div>

          <div>
            {label("Icon (emoji or symbol)")}
            <input value={cfgStr("icon", "")} onChange={(e) => setConfig("icon", e.target.value)}
              placeholder="e.g. ▶ 🔴 ⚙" className={inp} />
          </div>

          {cfgStr("action", "write") === "write" && !cfgStr("momentary", "true") && (
            <>
              <div>
                {label("Toggle ON color")}
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {Object.entries(COLOR_SWATCHES).map(([c, hex]) => (
                    <button key={c} title={c}
                      onClick={() => setConfig("toggleOnColor", c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${cfgStr("toggleOnColor","green") === c ? "border-white scale-110" : "border-zinc-700"}`}
                      style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
              <div>
                {label("Toggle OFF color")}
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {Object.entries(COLOR_SWATCHES).map(([c, hex]) => (
                    <button key={c} title={c}
                      onClick={() => setConfig("toggleOffColor", c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${cfgStr("toggleOffColor","zinc") === c ? "border-white scale-110" : "border-zinc-700"}`}
                      style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ButtonProps({ setConfig, cfgStr, cfgNum, cfgBool, inp, numInp, label, project }: PropertiesPanelProps) {
  return (
    <>
      <div>
        {label("Action")}
        <div className="flex gap-2">
          {(["write", "navigate"] as const).map((a) => (
            <button key={a} onClick={() => setConfig("action", a)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                cfgStr("action", "write") === a
                  ? "bg-blue-700 border-blue-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}>{a}</button>
          ))}
        </div>
      </div>
      {cfgStr("action", "write") === "navigate" ? (
        <div>
          {label("Target page")}
          <select value={cfgStr("navigateTo")} onChange={(e) => setConfig("navigateTo", e.target.value)} className={inp}>
            <option value="">— select page —</option>
            {project.pages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div>
            {label("Mode")}
            <div className="flex gap-2">
              {["momentary", "toggle"].map((m) => (
                <button key={m} onClick={() => setConfig("momentary", m === "momentary")}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    (m === "momentary") === cfgBool("momentary", true)
                      ? "bg-blue-700 border-blue-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}>{m}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {label("ON value")}
              <input type="number" value={cfgNum("onValue", 1)} onChange={(e) => setConfig("onValue", Number(e.target.value))} className={numInp} />
            </div>
            <div>
              {label("OFF value")}
              <input type="number" value={cfgNum("offValue", 0)} onChange={(e) => setConfig("offValue", Number(e.target.value))} className={numInp} />
            </div>
          </div>
        </>
      )}
      <ButtonStyleEditor setConfig={setConfig} cfgStr={cfgStr} inp={inp} label={label} />
    </>
  );
}

function TankProps({ setConfig, cfgNum, cfgStr, inp, numInp, label, w }: PropertiesPanelProps) {
  return (
    <>
      <RangeEditor cfgNum={cfgNum} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
      <UnitEditor cfgStr={cfgStr} setConfig={setConfig} inp={inp} label={label} />
      <ThresholdEditor w={w} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
    </>
  );
}

function SetpointProps({ setConfig, cfgNum, cfgStr, inp, numInp, label }: PropertiesPanelProps) {
  return (
    <>
      <RangeEditor cfgNum={cfgNum} setConfig={setConfig} inp={inp} numInp={numInp} label={label} />
      <UnitEditor cfgStr={cfgStr} setConfig={setConfig} inp={inp} label={label} />
      <div>
        {label("Step")}
        <input type="number" min={0.01} step={0.1} value={cfgNum("step", 1)}
          onChange={(e) => setConfig("step", Number(e.target.value))}
          className={numInp} />
      </div>
    </>
  );
}

function MultiStateProps({ setConfig, inp, label, w }: PropertiesPanelProps) {
  return <MultiStateEditor w={w} setConfig={setConfig} inp={inp} label={label} />;
}

function TrendProps({ setConfig, cfgNum, cfgStr, inp, numInp, label, w }: PropertiesPanelProps) {
  return (
    <>
      <div>
        {label("Duration (seconds)")}
        <input type="number" min={10} value={cfgNum("duration", 300)}
          onChange={(e) => setConfig("duration", Number(e.target.value))}
          className={numInp} />
      </div>
      <div>
        {label("X-axis format")}
        <select value={cfgStr("xFormat", "time")} onChange={(e) => setConfig("xFormat", e.target.value)} className={inp}>
          <option value="time">HH:MM:SS</option>
          <option value="time-short">HH:MM</option>
          <option value="relative">Relative (−5m, −1m…)</option>
          <option value="datetime">Date + time</option>
        </select>
      </div>
      <RangeEditor cfgNum={cfgNum} setConfig={setConfig} inp={inp} numInp={numInp} label={label} note="Leave blank for auto-scale" />
      <TrendSeriesEditor w={w} setConfig={setConfig} inp={inp} label={label} />
      <RefLinesEditor w={w} setConfig={setConfig} inp={inp} label={label} />
    </>
  );
}

function HistoryLogProps({ setConfig, cfgNum, numInp, label }: PropertiesPanelProps) {
  return (
    <div>
      {label("Rows to fetch")}
      <input type="number" min={10} max={500} value={cfgNum("pageSize", 100)}
        onChange={(e) => setConfig("pageSize", Number(e.target.value))}
        className={numInp} />
    </div>
  );
}

function AlarmBannerProps({ setConfig, cfgNum, cfgBool, numInp, label }: PropertiesPanelProps) {
  return (
    <>
      <div>
        {label("Max rows")}
        <input type="number" min={1} max={20} value={cfgNum("maxRows", 5)}
          onChange={(e) => setConfig("maxRows", Number(e.target.value))}
          className={numInp} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="showAcked" checked={cfgBool("showAcked")}
          onChange={(e) => setConfig("showAcked", e.target.checked)}
          className="accent-blue-500" />
        <label htmlFor="showAcked" className="text-xs text-zinc-300 cursor-pointer">Show acknowledged alarms</label>
      </div>
    </>
  );
}

function ImageProps({ setConfig, cfgStr, inp, label }: PropertiesPanelProps) {
  return (
    <>
      <ImageUploadEditor setConfig={setConfig} cfgStr={cfgStr} inp={inp} label={label} />
      <div>
        {label("Fit")}
        <select value={cfgStr("fit", "contain")} onChange={(e) => setConfig("fit", e.target.value)} className={inp}>
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="fill">Fill</option>
        </select>
      </div>
    </>
  );
}

function TextDisplayProps({ setConfig, cfgStr, inp, label }: PropertiesPanelProps) {
  return (
    <div>
      {label("Static text (leave blank to show tag value)")}
      <input value={cfgStr("staticText", "")} onChange={(e) => setConfig("staticText", e.target.value)}
        placeholder="e.g. Pump Status" className={inp} />
    </div>
  );
}

// ── Register per-widget properties panels ─────────────────────────────────
// Merges into registry entries created by widgets/index.tsx at module load.

registerWidget({ type: "textDisplay", label: "Text", defaultW: 4, defaultH: 2, PropertiesPanel: TextDisplayProps });
registerWidget({ type: "gauge",          label: "Gauge",       defaultW: 4, defaultH: 3, PropertiesPanel: GaugeProps });
registerWidget({ type: "numericDisplay", label: "Numeric",     defaultW: 3, defaultH: 2, PropertiesPanel: NumericDisplayProps });
registerWidget({ type: "numericInput",   label: "Numeric In",  defaultW: 3, defaultH: 2, PropertiesPanel: NumericInputProps });
registerWidget({ type: "led",            label: "LED",         defaultW: 2, defaultH: 2, PropertiesPanel: LEDProps });
registerWidget({ type: "button",         label: "Button",      defaultW: 3, defaultH: 2, PropertiesPanel: ButtonProps });
registerWidget({ type: "tank",           label: "Tank",        defaultW: 2, defaultH: 4, PropertiesPanel: TankProps });
registerWidget({ type: "setpoint",       label: "Setpoint",    defaultW: 4, defaultH: 2, PropertiesPanel: SetpointProps });
registerWidget({ type: "multiState",     label: "Multi-State", defaultW: 3, defaultH: 2, PropertiesPanel: MultiStateProps });
registerWidget({ type: "trend",          label: "Trend",       defaultW: 6, defaultH: 4, PropertiesPanel: TrendProps });
registerWidget({ type: "historyLog",     label: "History",     defaultW: 6, defaultH: 4, PropertiesPanel: HistoryLogProps });
registerWidget({ type: "alarmBanner",    label: "Alarms",      defaultW: 6, defaultH: 3, PropertiesPanel: AlarmBannerProps });
registerWidget({ type: "image",          label: "Image",       defaultW: 3, defaultH: 3, PropertiesPanel: ImageProps });
