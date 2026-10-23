// Widget renderers — read, write, and trend support.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Widget, Dynamic } from "../store/projectStore";
import { useProject } from "../store/projectStore";
import { useTag } from "../hooks/useTag";
import { useTags } from "../hooks/useTags";
import { apiBase } from "../store/runtimeTarget";
import { registerWidget } from "./widgetRegistry";

// ── helpers ────────────────────────────────────────────────────────────────

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? `${v}` : v.toFixed(2);
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  return String(v);
};

const qualityColor: Record<string, string> = {
  Good: "text-emerald-400",
  Bad: "text-red-400",
  Uncertain: "text-amber-400",
  Unknown: "text-zinc-500",
};

/** POST a value to the write endpoint. Binding is "dsId:tagPath".
 *  Always uses the current runtime target (local or PLC). */
async function writeTag(binding: string, value: unknown): Promise<void> {
  const sep = binding.indexOf(":");
  if (sep < 0) return;
  const datasource = binding.slice(0, sep);
  const path = binding.slice(sep + 1);
  try {
    await fetch(`${apiBase}/api/v1/tag/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasource, value }),
    });
  } catch {
    // swallow — write failures visible as stale read values
  }
}

// ── Keypad Modal ───────────────────────────────────────────────────────────

export function KeypadModal({
  initial,
  label,
  unit,
  onConfirm,
  onCancel,
}: {
  initial: number;
  label?: string;
  unit?: string;
  onConfirm: (v: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(String(initial));

  const append = (ch: string) => {
    setDraft((d) => {
      if (ch === "." && d.includes(".")) return d;
      if (d === "0" && ch !== ".") return ch;
      if (d === "-0" && ch !== ".") return "-" + ch;
      return d + ch;
    });
  };
  const backspace = () => setDraft((d) => (d.length > 1 ? d.slice(0, -1) : "0"));
  const toggleSign = () => setDraft((d) => (d.startsWith("-") ? d.slice(1) : "-" + d));

  const keys = ["7","8","9","4","5","6","1","2","3","0",".","⌫"];

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-56 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {label && <div className="text-[11px] text-zinc-500 truncate">{label}</div>}
        <div className="text-2xl font-mono text-right bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 min-h-[2.5rem]">
          {draft}
          {unit && <span className="text-sm text-zinc-500 ml-1">{unit}</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => k === "⌫" ? backspace() : append(k)}
              className="py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-sm font-medium transition-all"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={toggleSign} className="py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm col-span-1">+/-</button>
          <button onClick={onCancel} className="py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm">✕</button>
          <button
            onClick={() => { const n = parseFloat(draft); if (!isNaN(n)) onConfirm(n); }}
            className="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium"
          >✓</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Script expression evaluator ───────────────────────────────────────────

function evalExpression(expr: string, value: unknown): unknown {
  try {
    return new Function("value", `"use strict"; return (${expr})`)(value);
  } catch {
    return false;
  }
}

// Context carries script-dynamic overrides (config key → value) from DynamicsApplicator into Frame
const ScriptOverrideContext = createContext<Record<string, unknown>>({});

// ── Typography helper ──────────────────────────────────────────────────────

const FONT_SIZE_MAP: Record<string, string> = {
  xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem",
  xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem",
};
const FONT_FAMILY_MAP: Record<string, string> = {
  mono: "ui-monospace, monospace",
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
};

function fontStyle(config: Record<string, unknown> | undefined): React.CSSProperties {
  if (!config) return {};
  return {
    fontFamily: FONT_FAMILY_MAP[config.fontFamily as string] ?? undefined,
    fontSize:   FONT_SIZE_MAP[config.fontSize as string] ?? undefined,
    fontWeight: config.fontBold    ? "bold"   : undefined,
    fontStyle:  config.fontItalic  ? "italic" : undefined,
    textDecoration: config.fontUnderline ? "underline" : undefined,
    textAlign:  (config.textAlign as React.CSSProperties["textAlign"]) ?? undefined,
    color:      (config.textColor as string) || undefined,
  };
}

// ── Color threshold helper ─────────────────────────────────────────────────

type ColorThreshold = { value: number; toValue?: number; color: string };

function resolveColor(value: unknown, thresholds: ColorThreshold[]): string | null {
  if (!thresholds.length) return null;
  if (typeof value !== "number") return null;
  for (const t of thresholds) {
    if (t.toValue !== undefined && value >= t.value && value < t.toValue) return t.color;
  }
  const sorted = [...thresholds]
    .filter((t) => t.toValue === undefined)
    .sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return null;
}

// ── shared Frame ───────────────────────────────────────────────────────────

function Frame({ w, children }: { w: Widget; children: React.ReactNode }) {
  const overrides  = useContext(ScriptOverrideContext);
  const label      = w.config?.label as string | undefined;
  const bgColor    = (overrides.bgColor      as string | undefined) ?? (w.config?.bgColor    as string | undefined);
  const borderColor= (overrides.borderColor  as string | undefined) ?? (w.config?.borderColor as string | undefined);
  const textColor  = (overrides.textColor    as string | undefined) ?? (w.config?.textColor  as string | undefined);
  const noPadding  = w.config?.noPadding  as boolean | undefined;

  const isTransparent = bgColor === "none" || bgColor === "transparent";

  const style: React.CSSProperties = {
    backgroundColor: isTransparent ? "transparent" : (bgColor ?? undefined),
    borderColor:     isTransparent ? "transparent" : (borderColor ?? undefined),
  };

  return (
    <div
      className={`h-full w-full rounded-lg flex flex-col gap-1 select-none ${
        isTransparent
          ? "border-transparent"
          : bgColor
          ? "border"
          : "bg-zinc-900/80 border border-zinc-800"
      } ${noPadding ? "" : "p-3"}`}
      style={style}
    >
      {label ? (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 truncate shrink-0">{label}</div>
      ) : null}
      <div className="flex-1 min-h-0" style={{ ...fontStyle(w.config), color: textColor ?? undefined }}>{children}</div>
    </div>
  );
}

// ── read-only widgets ──────────────────────────────────────────────────────

// Gauge SVG helpers
const GAUGE_CX = 50, GAUGE_CY = 60, GAUGE_R = 36;
const GAUGE_START = 225; // deg clockwise from top (7:30 position)
const GAUGE_SWEEP = 270; // total arc in degrees

function gaugePolar(angleDeg: number, r = GAUGE_R) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: GAUGE_CX + r * Math.cos(rad), y: GAUGE_CY + r * Math.sin(rad) };
}

function gaugeArcPath(startDeg: number, sweepDeg: number): string {
  const s = Math.max(0.01, Math.min(sweepDeg, GAUGE_SWEEP - 0.01));
  const p0 = gaugePolar(startDeg);
  const p1 = gaugePolar(startDeg + s);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 ${s > 180 ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function GaugeWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const min = (w.config?.min as number) ?? 0;
  const max = (w.config?.max as number) ?? 100;
  const v = typeof t.value === "number" ? t.value : min;
  const pct = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const fillSweep = pct * GAUGE_SWEEP;

  const colorThresholds = (w.config?.colorThresholds as ColorThreshold[]) ?? [];
  const legacyThresholds = (w.config?.thresholds as ColorThreshold[]) ?? [];
  const arcColor = resolveColor(v, colorThresholds.length ? colorThresholds : legacyThresholds) ?? "#22c55e";

  // needleAngle: degrees clockwise from 12 o'clock. Needle drawn at 12 o'clock,
  // rotated via CSS transform for smooth animation.
  const needleAngle = GAUGE_START + fillSweep;
  const minPt = gaugePolar(GAUGE_START, GAUGE_R + 6);
  const maxPt = gaugePolar(GAUGE_START + GAUGE_SWEEP, GAUGE_R + 6);

  return (
    <div className="flex flex-col h-full justify-center gap-0.5">
      <svg viewBox="0 0 100 75" className="w-full max-h-28">
        {/* Track */}
        <path d={gaugeArcPath(GAUGE_START, GAUGE_SWEEP)} fill="none" stroke="#27272a" strokeWidth="7" strokeLinecap="round" />
        {/* Fill */}
        {fillSweep > 0.5 && (
          <path d={gaugeArcPath(GAUGE_START, fillSweep)} fill="none" stroke={arcColor} strokeWidth="7" strokeLinecap="round" />
        )}
        {/* Tick marks at 0%, 25%, 50%, 75%, 100% */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const a = GAUGE_START + p * GAUGE_SWEEP;
          const outer = gaugePolar(a, GAUGE_R + 2);
          const inner = gaugePolar(a, GAUGE_R - 9);
          return (
            <line key={p} x1={outer.x.toFixed(2)} y1={outer.y.toFixed(2)}
              x2={inner.x.toFixed(2)} y2={inner.y.toFixed(2)}
              stroke="#52525b" strokeWidth={p === 0 || p === 1 ? 1.5 : 0.8} />
          );
        })}
        {/* Min/max labels */}
        <text x={minPt.x.toFixed(1)} y={minPt.y.toFixed(1)} textAnchor="end"
          fontSize="5" fill="#52525b" fontFamily="monospace">{min}</text>
        <text x={maxPt.x.toFixed(1)} y={maxPt.y.toFixed(1)} textAnchor="start"
          fontSize="5" fill="#52525b" fontFamily="monospace">{max}</text>
        {/* Needle — rotated via CSS for smooth animation */}
        <g style={{
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: `${GAUGE_CX}px ${GAUGE_CY}px`,
          transition: "transform 0.3s ease-out",
        }}>
          <line x1={GAUGE_CX} y1={GAUGE_CY + 6} x2={GAUGE_CX} y2={GAUGE_CY - (GAUGE_R - 4)}
            stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r="3.5" fill="#52525b" />
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r="1.5" fill="#a1a1aa" />
        {/* Value */}
        <text x={GAUGE_CX} y={GAUGE_CY + 14} textAnchor="middle"
          fontSize="8" fill="#e4e4e7" fontWeight="600" fontFamily="monospace">
          {typeof t.value === "number" ? t.value.toFixed(1) : "—"}
          {w.config?.unit ? ` ${w.config.unit as string}` : ""}
        </text>
      </svg>
      {(w.config?.showQuality ?? true) && (
        <div className={`text-[9px] text-center ${qualityColor[t.quality] ?? "text-zinc-600"}`}>{t.quality}</div>
      )}
    </div>
  );
}

function NumericDisplayWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  return (
    <div className="flex flex-col h-full justify-center">
      <div className="text-3xl font-semibold tabular-nums">
        {fmt(t.value)}
        {w.config?.unit ? <span className="text-base text-zinc-500 ml-1">{w.config.unit as string}</span> : null}
      </div>
      {(w.config?.showQuality ?? true) && (
        <div className={`text-[10px] mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>
      )}
    </div>
  );
}

function TextDisplayWidget({ w }: { w: Widget }) {
  // binding without ":" is treated as a literal constant (e.g. "Pump Status")
  const isLiveBinding = !!w.binding?.includes(":");
  const t = useTag(isLiveBinding ? w.binding : undefined);
  const staticText = w.config?.staticText as string | undefined;
  const align = (w.config?.textAlign as string) || "left";
  const justifyCls = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  const displayText = staticText ?? (isLiveBinding ? fmt(t.value) : (w.binding ?? ""));
  return (
    <div className={`break-words h-full flex items-center ${justifyCls} text-lg`}>
      {displayText}
    </div>
  );
}

function LEDWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const on = !!t.value;
  const trueColor = (w.config?.trueColor as string) ?? "#22c55e";
  const falseColor = (w.config?.falseColor as string) ?? "#3f3f46";
  return (
    <div className="flex items-center gap-2 h-full">
      <div
        className="w-6 h-6 rounded-full shadow-[inset_0_0_8px_rgba(0,0,0,0.4)]"
        style={{ background: on ? trueColor : falseColor, boxShadow: on ? `0 0 10px ${trueColor}88` : undefined }}
      />
      <div className="text-sm font-medium">{on ? (w.config?.trueLabel as string ?? "ON") : (w.config?.falseLabel as string ?? "OFF")}</div>
    </div>
  );
}

// ── Button style system ────────────────────────────────────────────────────

type BtnVariant = "filled" | "outlined" | "ghost" | "flat" | "industrial";
type BtnColor   = "blue" | "green" | "red" | "amber" | "zinc" | "purple" | "orange" | "white";
type BtnRounded = "none" | "sm" | "md" | "lg" | "full";

const BTN_ROUNDED: Record<BtnRounded, string> = {
  none: "rounded-none", sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", full: "rounded-full",
};

const BTN_COLORS: Record<BtnColor, Record<BtnVariant, string>> = {
  blue:   { filled: "bg-blue-600 hover:bg-blue-500 text-white",                 outlined: "border-2 border-blue-500 text-blue-300 hover:bg-blue-900/30",   ghost: "text-blue-300 hover:bg-blue-900/40",      flat: "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50",   industrial: "bg-gradient-to-b from-blue-500 to-blue-700 border border-blue-900 text-white shadow-inner" },
  green:  { filled: "bg-emerald-600 hover:bg-emerald-500 text-white",           outlined: "border-2 border-emerald-500 text-emerald-300 hover:bg-emerald-900/30", ghost: "text-emerald-300 hover:bg-emerald-900/40", flat: "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50", industrial: "bg-gradient-to-b from-emerald-500 to-emerald-700 border border-emerald-900 text-white shadow-inner" },
  red:    { filled: "bg-red-600 hover:bg-red-500 text-white",                   outlined: "border-2 border-red-500 text-red-300 hover:bg-red-900/30",       ghost: "text-red-300 hover:bg-red-900/40",        flat: "bg-red-900/40 text-red-300 hover:bg-red-800/50",       industrial: "bg-gradient-to-b from-red-500 to-red-700 border border-red-900 text-white shadow-inner" },
  amber:  { filled: "bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold",  outlined: "border-2 border-amber-500 text-amber-300 hover:bg-amber-900/30",  ghost: "text-amber-300 hover:bg-amber-900/40",    flat: "bg-amber-900/40 text-amber-300 hover:bg-amber-800/50",  industrial: "bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-900 text-zinc-900 shadow-inner" },
  zinc:   { filled: "bg-zinc-700 hover:bg-zinc-600 text-zinc-100",              outlined: "border-2 border-zinc-500 text-zinc-300 hover:bg-zinc-800",        ghost: "text-zinc-300 hover:bg-zinc-800",          flat: "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",    industrial: "bg-gradient-to-b from-zinc-500 to-zinc-700 border border-zinc-900 text-white shadow-inner" },
  purple: { filled: "bg-purple-600 hover:bg-purple-500 text-white",             outlined: "border-2 border-purple-500 text-purple-300 hover:bg-purple-900/30", ghost: "text-purple-300 hover:bg-purple-900/40",  flat: "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50", industrial: "bg-gradient-to-b from-purple-500 to-purple-700 border border-purple-900 text-white shadow-inner" },
  orange: { filled: "bg-orange-500 hover:bg-orange-400 text-white",             outlined: "border-2 border-orange-500 text-orange-300 hover:bg-orange-900/30", ghost: "text-orange-300 hover:bg-orange-900/40",  flat: "bg-orange-900/40 text-orange-300 hover:bg-orange-800/50", industrial: "bg-gradient-to-b from-orange-400 to-orange-600 border border-orange-900 text-white shadow-inner" },
  white:  { filled: "bg-white hover:bg-zinc-100 text-zinc-900",                 outlined: "border-2 border-zinc-300 text-zinc-100 hover:bg-zinc-800",         ghost: "text-zinc-200 hover:bg-zinc-800",          flat: "bg-white/10 text-zinc-200 hover:bg-white/20",          industrial: "bg-gradient-to-b from-zinc-200 to-zinc-400 border border-zinc-600 text-zinc-900 shadow-inner" },
};

function btnClass(config: Record<string, unknown> | undefined, activeOn = false): string {
  const variant = ((config?.btnVariant as BtnVariant) ?? "filled");
  const color   = ((config?.btnColor   as BtnColor)   ?? "blue");
  const rounded = ((config?.btnRounded as BtnRounded) ?? "md");
  const colorCls = BTN_COLORS[color]?.[variant] ?? BTN_COLORS.blue.filled;
  const roundedCls = BTN_ROUNDED[rounded] ?? "rounded-md";
  const activeCls = activeOn ? "ring-2 ring-current ring-offset-1 ring-offset-zinc-950" : "";
  return `w-full h-full ${roundedCls} ${colorCls} text-sm font-medium transition-all active:scale-95 ${activeCls}`;
}

// ── write widgets ──────────────────────────────────────────────────────────

function ButtonWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const { setActivePage } = useProject();
  const label = (w.config?.label as string) ?? "Press";
  const action = (w.config?.action as string) ?? "write";
  const momentary = (w.config?.momentary as boolean) ?? true;
  const onValue  = w.config?.onValue  ?? 1;
  const offValue = w.config?.offValue ?? 0;
  const icon = w.config?.icon as string | undefined;

  const content = (
    <span className="flex items-center justify-center gap-1.5">
      {icon && <span className="text-base leading-none">{icon}</span>}
      {label}
    </span>
  );

  if (action === "navigate") {
    const targetPage = w.config?.navigateTo as string | undefined;
    const navColor = (w.config?.btnColor as BtnColor) ?? "purple";
    return (
      <button className={btnClass({ ...w.config, btnColor: navColor })}
              onClick={() => targetPage && setActivePage(targetPage)}>
        {content}
      </button>
    );
  }

  if (momentary) {
    return (
      <button
        className={btnClass(w.config)}
        onPointerDown={() => w.binding && writeTag(w.binding, onValue)}
        onPointerUp={()   => w.binding && writeTag(w.binding, offValue)}
        onPointerLeave={()=> w.binding && writeTag(w.binding, offValue)}
      >
        {content}
      </button>
    );
  }

  // Toggle mode — state-aware active styling
  const on = !!t.value;
  const toggleColor: BtnColor = on
    ? ((w.config?.toggleOnColor  as BtnColor) ?? "green")
    : ((w.config?.toggleOffColor as BtnColor) ?? "zinc");
  return (
    <button
      className={btnClass({ ...w.config, btnColor: toggleColor }, on)}
      onClick={() => w.binding && writeTag(w.binding, on ? offValue : onValue)}
    >
      {content}
    </button>
  );
}

function NumericInputWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const [open, setOpen] = useState(false);
  const cur = typeof t.value === "number" ? t.value : 0;

  return (
    <div className="flex flex-col h-full justify-center">
      <div
        onClick={() => setOpen(true)}
        className="text-3xl font-semibold tabular-nums cursor-pointer hover:bg-zinc-800 rounded px-1 transition-colors select-none"
      >
        {fmt(t.value)}
        {w.config?.unit ? <span className="text-base text-zinc-500 ml-1">{w.config.unit as string}</span> : null}
      </div>
      <div className={`text-[10px] mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>
        tap to enter value
      </div>
      {open && (
        <KeypadModal
          initial={cur}
          label={w.config?.label as string | undefined}
          unit={w.config?.unit as string | undefined}
          onConfirm={(n) => { if (w.binding) writeTag(w.binding, n); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function TextInputWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => { setDraft(fmt(t.value)); setEditing(true); };
  const commit = () => {
    if (w.binding) writeTag(w.binding, draft);
    setEditing(false);
  };

  return (
    <div className="flex flex-col h-full justify-center gap-1">
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="text-sm bg-zinc-800 border border-blue-500 rounded px-2 py-1 w-full outline-none font-mono"
        />
      ) : (
        <div onClick={startEdit} className="text-sm cursor-text hover:bg-zinc-800 rounded px-1 transition-colors font-mono">
          {fmt(t.value)}
        </div>
      )}
    </div>
  );
}

// ── tank (vertical level) ─────────────────────────────────────────────────

function TankWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const min = (w.config?.min as number) ?? 0;
  const max = (w.config?.max as number) ?? 100;
  const v = typeof t.value === "number" ? t.value : 0;
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const colorThresholds = (w.config?.colorThresholds as ColorThreshold[]) ?? [];
  const legacyThresholds = (w.config?.thresholds as ColorThreshold[]) ?? [];
  const fillColor = resolveColor(v, colorThresholds.length ? colorThresholds : legacyThresholds) ?? "#3b82f6";

  return (
    <div className="flex gap-3 h-full items-end">
      {/* Vertical bar */}
      <div className="flex flex-col w-10 h-full bg-zinc-800 rounded-md overflow-hidden relative border border-zinc-700">
        {/* Tick marks */}
        {[75, 50, 25].map((p) => (
          <div key={p} className="absolute left-0 right-0 border-t border-zinc-600/50 text-[8px] text-zinc-600 pl-0.5"
            style={{ bottom: `${p}%` }} />
        ))}
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-500 rounded-b-md"
          style={{ height: `${pct}%`, background: fillColor, opacity: 0.85 }}
        />
      </div>
      {/* Value + quality */}
      <div className="flex flex-col justify-end pb-1">
        <div className="text-xl font-semibold tabular-nums leading-none">
          {fmt(t.value)}
        </div>
        {(w.config?.unit as string | undefined) && (
          <div className="text-[10px] text-zinc-500">{w.config!.unit as string}</div>
        )}
        {(w.config?.showQuality ?? true) && (
          <div className={`text-[9px] mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>
        )}
      </div>
    </div>
  );
}

// ── setpoint slider ────────────────────────────────────────────────────────

function SetpointWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const min = (w.config?.min as number) ?? 0;
  const max = (w.config?.max as number) ?? 100;
  const step = (w.config?.step as number) ?? 1;

  // Local draft so the slider feels snappy while the write propagates.
  const [draft, setDraft] = useState<number | null>(null);
  const displayVal = draft ?? (typeof t.value === "number" ? t.value : min);

  const commit = (n: number) => {
    setDraft(null);
    if (w.binding) writeTag(w.binding, n);
  };

  return (
    <div className="flex flex-col h-full justify-center gap-2">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{displayVal.toFixed(step < 1 ? 1 : 0)}</span>
        {(w.config?.unit as string | undefined) && <span className="text-xs text-zinc-500">{w.config!.unit as string}</span>}
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={displayVal}
        onChange={(e) => setDraft(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-blue-500 cursor-pointer"
      />
      <div className="flex justify-between text-[9px] text-zinc-600">
        <span>{min}</span>
        {(w.config?.showQuality ?? true) && (
          <span className={qualityColor[t.quality] ?? "text-zinc-600"}>{t.quality}</span>
        )}
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── trend widget (multi-series) ────────────────────────────────────────────

type Sample = { ts: number; v: number };
type TrendSeries = { binding: string; color: string; label?: string };

const SERIES_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

/** Tracks one time-series: fetches history + appends live updates. */
function useSeries(binding: string | undefined, duration: number): Sample[] {
  const t = useTag(binding);
  const [pts, setPts] = useState<Sample[]>([]);
  const ptsRef = useRef<Sample[]>([]);

  // Fetch history on mount / binding change.
  useEffect(() => {
    if (!binding) { setPts([]); ptsRef.current = []; return; }
    const from = (Date.now() - duration) * 1e6;
    fetch(`${apiBase}/api/v1/history?path=${encodeURIComponent(binding)}&from=${from}&limit=500`)
      .then((r) => (r.ok ? r.json() : []))
      .then((samples: Array<{ ts: number; value: unknown }>) => {
        const loaded: Sample[] = samples
          .filter((s) => typeof s.value === "number")
          .map((s) => ({ ts: s.ts > 1e15 ? s.ts / 1e6 : s.ts, v: s.value as number }));
        ptsRef.current = loaded;
        setPts([...loaded]);
      })
      .catch(() => {});
  }, [binding, duration]);

  // Append live values.
  useEffect(() => {
    if (typeof t.value !== "number" || t.quality === "Unknown") return;
    const now = t.ts > 1e15 ? t.ts / 1e6 : t.ts > 0 ? t.ts : Date.now();
    const cutoff = now - duration;
    const prev = ptsRef.current;
    if (prev.length > 0 && prev[prev.length - 1]!.ts >= now) return;
    const next = [...prev.filter((p) => p.ts >= cutoff), { ts: now, v: t.value as number }];
    ptsRef.current = next;
    setPts(next);
  }, [t.value, t.ts, t.quality, duration]);

  return pts;
}


const TREND_WINDOWS = [
  { label: "30s", sec: 30 },
  { label: "1m",  sec: 60 },
  { label: "5m",  sec: 300 },
  { label: "1h",  sec: 3600 },
];

function TrendWidget({ w }: { w: Widget }) {
  const cfgDuration = (w.config?.duration as number) ?? 300;
  const [windowSec, setWindowSec] = useState(cfgDuration);
  const [panOffsetMs, setPanOffsetMs] = useState(0); // negative = look into the past
  const duration = windowSec * 1000;

  // Pan via mouse/touch drag
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartPan = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    dragStartPan.current = panOffsetMs;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const svgW = svgRef.current?.getBoundingClientRect().width ?? 1;
    const msDelta = ((e.clientX - dragStartX.current) / svgW) * duration;
    setPanOffsetMs(Math.min(0, dragStartPan.current + msDelta));
  };
  const onPointerUp = () => { dragStartX.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const idx = TREND_WINDOWS.findIndex((tw) => tw.sec === windowSec);
    if (e.deltaY < 0 && idx > 0) setWindowSec(TREND_WINDOWS[idx - 1]!.sec);
    if (e.deltaY > 0 && idx < TREND_WINDOWS.length - 1) setWindowSec(TREND_WINDOWS[idx + 1]!.sec);
  };

  // Build series list: config.tags[] for multi-series, or fall back to w.binding.
  const cfgTags = w.config?.tags as TrendSeries[] | undefined;
  const series: TrendSeries[] = cfgTags?.length
    ? cfgTags
    : w.binding
    ? [{ binding: w.binding, color: SERIES_COLORS[0]! }]
    : [];

  // We need fixed-count hooks — support up to 6 series (pad with undefined).
  const s0 = useSeries(series[0]?.binding, duration);
  const s1 = useSeries(series[1]?.binding, duration);
  const s2 = useSeries(series[2]?.binding, duration);
  const s3 = useSeries(series[3]?.binding, duration);
  const s4 = useSeries(series[4]?.binding, duration);
  const s5 = useSeries(series[5]?.binding, duration);
  const allPts = [s0, s1, s2, s3, s4, s5].slice(0, series.length);

  const cfgMin = w.config?.min as number | undefined;
  const cfgMax = w.config?.max as number | undefined;
  const flat = allPts.flat();
  const vMin = cfgMin ?? (flat.length ? Math.min(...flat.map((p) => p.v)) : 0);
  const vMax = cfgMax ?? (flat.length ? Math.max(...flat.map((p) => p.v)) : 100);
  const vRange = vMax - vMin || 1;
  const midVal = (vMin + vMax) / 2;

  // Shared time window: most recent point across all series, adjusted for pan.
  const liveMax = flat.length ? Math.max(...flat.map((p) => p.ts)) : Date.now();
  const tMax = liveMax + panOffsetMs;
  const tMin = tMax - duration;
  const tSpan = tMax - tMin || 1;
  const isPanned = panOffsetMs < -1000;

  return (
    <div className="flex flex-col h-full">
      {/* Time-window picker */}
      <div className="flex gap-1 shrink-0 mb-0.5 items-center">
        {TREND_WINDOWS.map((tw) => (
          <button
            key={tw.sec}
            onClick={() => setWindowSec(tw.sec)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              windowSec === tw.sec
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            }`}
          >
            {tw.label}
          </button>
        ))}
        {isPanned && (
          <button
            onClick={() => setPanOffsetMs(0)}
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-amber-700 text-amber-200 hover:bg-amber-600"
          >live ▶</button>
        )}
      </div>
      {/* Chart area with Y-axis */}
      <div className="flex flex-1 min-h-0 gap-1">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between text-[8px] font-mono text-zinc-600 shrink-0 w-7 text-right py-0.5">
          <span>{vMax.toFixed(0)}</span>
          <span>{midVal.toFixed(0)}</span>
          <span>{vMin.toFixed(0)}</span>
        </div>
        {/* Plot */}
        <svg
          ref={svgRef}
          className="flex-1 overflow-visible cursor-ew-resize"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#27272a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}
          {allPts.map((pts, i) => {
            const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
            const visible = pts.filter((p) => p.ts >= tMin && p.ts <= tMax);
            const last = visible.at(-1);
            return (
              <g key={i}>
                <polyline
                  points={visible.map((p) =>
                    `${(((p.ts - tMin) / tSpan) * 100).toFixed(2)},${(100 - ((p.v - vMin) / vRange) * 100).toFixed(2)}`
                  ).join(" ")}
                  fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
                />
                {last && (
                  <circle
                    cx={(((last.ts - tMin) / tSpan) * 100)}
                    cy={(100 - ((last.v - vMin) / vRange) * 100)}
                    r="2" fill={color} vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legend with live values */}
      <div className="flex items-center gap-2 text-[9px] font-mono mt-0.5 shrink-0 flex-wrap">
        {allPts.map((pts, i) => {
          const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
          const last = pts.at(-1);
          return (
            <span key={i} className="flex items-center gap-1">
              <span className="w-2 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
              <span style={{ color }} className="font-semibold">{series[i]?.label ?? `s${i}`}</span>
              <span className="text-zinc-500">{last ? fmt(last.v) : "—"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── history log ────────────────────────────────────────────────────────────

function HistoryLogWidget({ w }: { w: Widget }) {
  const [rows, setRows] = useState<Array<{ ts: number; value: unknown; quality: string }>>([]);

  useEffect(() => {
    if (!w.binding) return;
    const from = (Date.now() - 3600_000) * 1e6;
    fetch(`${apiBase}/api/v1/history?path=${encodeURIComponent(w.binding)}&from=${from}&limit=${(w.config?.pageSize as number) ?? 100}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [w.binding]);

  const downloadCSV = () => {
    if (!w.binding) return;
    const from = (Date.now() - 3600_000) * 1e6;
    const url = `${apiBase}/api/v1/history?path=${encodeURIComponent(w.binding)}&from=${from}&limit=10000&format=csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${w.binding.replace(/[:/]/g, "_")}.csv`;
    a.click();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end mb-0.5 shrink-0">
        <button onClick={downloadCSV} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
          ↓ CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto text-[10px] font-mono space-y-0.5">
        {(rows?.length ?? 0) === 0 && <div className="text-zinc-600 italic">No history</div>}
        {[...(rows ?? [])].reverse().map((r, i) => (
          <div key={i} className="flex gap-2 border-b border-zinc-800/50 pb-0.5">
            <span className="text-zinc-600 shrink-0">
              {new Date(r.ts > 1e15 ? r.ts / 1e6 : r.ts).toLocaleTimeString()}
            </span>
            <span className="text-zinc-300">{fmt(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MultiState widget ──────────────────────────────────────────────────────

type StateEntry = { value: number | string; label: string; color: string; textColor?: string };

const DEFAULT_STATES: StateEntry[] = [
  { value: 0, label: "OFF",     color: "#27272a", textColor: "#a1a1aa" },
  { value: 1, label: "RUNNING", color: "#14532d", textColor: "#4ade80" },
  { value: 2, label: "FAULT",   color: "#450a0a", textColor: "#f87171" },
];

function MultiStateWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const states: StateEntry[] = (w.config?.states as StateEntry[]) ?? DEFAULT_STATES;
  const raw = t.value;
  // Match by loose equality (handles numeric string vs number).
  const match = states.find((s) => String(s.value) === String(raw));
  const bg      = match?.color    ?? "#1c1c1e";
  const textClr = match?.textColor ?? "#71717a";
  const text    = match?.label    ?? (raw == null ? "—" : String(raw));

  return (
    <div
      className="h-full flex items-center justify-center rounded transition-colors duration-300"
      style={{ backgroundColor: bg }}
    >
      <span className="text-lg font-bold tracking-widest uppercase" style={{ color: textClr }}>
        {text}
      </span>
    </div>
  );
}

// ── Faceplate widget ──────────────────────────────────────────────────────

function FaceplateWidget({ w }: { w: Widget }) {
  const project = useProject((s) => s.project);
  const fpId = w.config?.faceplateId as string | undefined;
  const params = (w.config?.params ?? {}) as Record<string, string>;

  const fp = project.faceplates?.find((f) => f.id === fpId);

  if (!fp) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-purple-400/60 border border-purple-800/40 rounded-lg">
        <span className="text-xs font-mono">faceplate</span>
        <span className="text-[10px] text-zinc-600">{fpId ?? "no id"}</span>
      </div>
    );
  }

  function rewriteBinding(binding: string | undefined): string | undefined {
    if (!binding) return binding;
    return binding.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
  }

  return (
    <div className="h-full relative border border-purple-700/50 rounded-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 px-2 py-0.5 bg-purple-900/40 text-[9px] text-purple-300 font-medium tracking-wider truncate">
        FP: {fp.name}
      </div>
      <div className="absolute inset-0 pt-5">
        {fp.widgets.map((fw) => {
          const resolved: Widget = {
            ...fw,
            id: fw.localId,
            binding: rewriteBinding(fw.binding),
          };
          const Renderer = renderers[fw.type];
          if (!Renderer) return null;
          const left   = `${((fw.x / (w.w || 1)) * 100).toFixed(1)}%`;
          const top    = `${((fw.y / (w.h || 1)) * 100).toFixed(1)}%`;
          const width  = `${((fw.w / (w.w || 1)) * 100).toFixed(1)}%`;
          const height = `${((fw.h / (w.h || 1)) * 100).toFixed(1)}%`;
          return (
            <div key={fw.localId} className="absolute" style={{ left, top, width, height }}>
              <Renderer w={resolved} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Table widget ───────────────────────────────────────────────────────────

type TableRow = { label: string; binding: string; unit?: string };

function TableWidget({ w }: { w: Widget }) {
  const rows: TableRow[] = (w.config?.rows as TableRow[]) ?? [];
  const bindings = useMemo(() => rows.map((r) => r.binding).filter(Boolean), [rows]);
  const tags = useTags(bindings);
  const showQuality = w.config?.showQuality as boolean | undefined;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="text-left text-zinc-500 font-medium py-0.5 pr-2 sticky top-0 bg-zinc-900">Tag</th>
            <th className="text-right text-zinc-500 font-medium py-0.5 pl-2 sticky top-0 bg-zinc-900">Value</th>
            {showQuality && <th className="text-right text-zinc-500 font-medium py-0.5 pl-2 sticky top-0 bg-zinc-900">Q</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={3} className="text-zinc-600 italic py-2 text-center text-[10px]">No rows configured</td></tr>
          )}
          {rows.map((row, i) => {
            const t = tags[row.binding];
            return (
              <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                <td className="py-1 pr-2 text-zinc-400 truncate max-w-[120px]" title={row.binding}>
                  {row.label || row.binding}
                </td>
                <td className="py-1 pl-2 text-right font-mono text-zinc-100 tabular-nums">
                  {fmt(t?.value)}
                  {row.unit && <span className="text-zinc-500 ml-1 text-[9px]">{row.unit}</span>}
                </td>
                {showQuality && (
                  <td className={`py-1 pl-2 text-right text-[9px] ${qualityColor[t?.quality ?? ""] ?? "text-zinc-600"}`}>
                    {t?.quality ?? "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── registrations ─────────────────────────────────────────────────────────
// Palette metadata. PropertiesPanel is registered separately in Properties.tsx.

registerWidget({ type: "gauge",          label: "Gauge",       defaultW: 4, defaultH: 3 });
registerWidget({ type: "numericDisplay", label: "Numeric",     defaultW: 3, defaultH: 2 });
registerWidget({ type: "textDisplay",    label: "Text",        defaultW: 4, defaultH: 2 });
registerWidget({ type: "led",            label: "LED",         defaultW: 2, defaultH: 2 });
registerWidget({ type: "tank",           label: "Tank",        defaultW: 2, defaultH: 4 });
registerWidget({ type: "button",         label: "Button",      defaultW: 3, defaultH: 2 });
registerWidget({ type: "setpoint",       label: "Setpoint",    defaultW: 4, defaultH: 2 });
registerWidget({ type: "multiState",     label: "Multi-State", defaultW: 3, defaultH: 2 });
registerWidget({ type: "trend",          label: "Trend",       defaultW: 6, defaultH: 4 });
registerWidget({ type: "numericInput",   label: "Numeric In",  defaultW: 3, defaultH: 2 });
registerWidget({ type: "textInput",      label: "Text In",     defaultW: 3, defaultH: 2 });
registerWidget({ type: "historyLog",     label: "History",     defaultW: 6, defaultH: 4 });
registerWidget({ type: "alarmBanner",    label: "Alarms",      defaultW: 6, defaultH: 3 });
registerWidget({ type: "image",          label: "Image",       defaultW: 4, defaultH: 3 });
registerWidget({ type: "faceplate",      label: "Faceplate",   defaultW: 4, defaultH: 4 });
registerWidget({ type: "table",          label: "Table",       defaultW: 4, defaultH: 4 });

// ── Image widget ───────────────────────────────────────────────────────────

function ImageWidget({ w }: { w: Widget }) {
  const src = (w.config?.src as string | undefined) ?? "";
  const fit = (w.config?.objectFit as string | undefined) ?? "contain";

  // Resolve lib: references against the project image library
  const libSrc = useProject(s => {
    if (!src.startsWith("lib:")) return null;
    const id = src.slice(4);
    return s.project.images?.find(img => img.id === id)?.dataUrl ?? null;
  });

  const resolved = src.startsWith("lib:") ? libSrc : src || null;

  if (!resolved) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-zinc-600">
        <span className="text-2xl opacity-40">🖼</span>
        <span className="text-[10px]">No image</span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={w.config?.label as string ?? ""}
      className="w-full h-full"
      style={{ objectFit: fit as React.CSSProperties["objectFit"] }}
      draggable={false}
    />
  );
}

// ── Symbol widget ──────────────────────────────────────────────────────────

import { SYMBOLS } from "../data/symbols";
import { SymbolSVG } from "../panels/SymbolLibrary";

function SymbolWidget({ w }: { w: Widget }) {
  const stroke = (w.config?.stroke as string | undefined) ?? "#d4d4d8";
  const sym = SYMBOLS.find(s => s.id === w.config?.symbolId);
  if (!sym) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">?sym</div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-1 gap-0.5">
      <div className="flex-1 min-h-0 flex items-center justify-center w-full">
        <SymbolSVG svg={sym.svg} stroke={stroke} size={0} />
      </div>
      {(w.config?.label as string | undefined) && (
        <span className="text-[9px] text-zinc-400 truncate max-w-full shrink-0">
          {w.config!.label as string}
        </span>
      )}
    </div>
  );
}

// ── alarm banner widget ────────────────────────────────────────────────────

import { useClientAlarms } from "../store/alarmEngine";

function AlarmBannerWidget({ w }: { w: Widget }) {
  const clientAlarms = useClientAlarms();
  const maxRows = (w.config?.maxRows as number) ?? 5;

  const sevColor: Record<string, string> = {
    critical: "text-red-400 border-red-900/60",
    warning:  "text-amber-400 border-amber-900/60",
    info:     "text-blue-400 border-blue-900/60",
  };

  const active = clientAlarms.slice(0, maxRows);

  return (
    <div className="h-full flex flex-col gap-0.5 overflow-hidden">
      {active.length === 0 ? (
        <div className="flex items-center justify-center h-full text-[11px] text-emerald-500/70 gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          No active alarms
        </div>
      ) : (
        active.map((a) => (
          <div key={a.ruleId} className={`flex items-center gap-2 text-[10px] border-b px-1 py-0.5 ${sevColor[a.severity] ?? "text-zinc-400 border-zinc-800"}`}>
            <span className="uppercase font-bold shrink-0 w-14 truncate">{a.severity}</span>
            <span className="flex-1 truncate">{a.message}</span>
            <span className="text-zinc-600 shrink-0">{new Date(a.since).toLocaleTimeString()}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── renderer map ───────────────────────────────────────────────────────────

const renderers: Record<string, React.ComponentType<{ w: Widget }>> = {
  gauge:          GaugeWidget,
  numericDisplay: NumericDisplayWidget,
  textDisplay:    TextDisplayWidget,
  led:            LEDWidget,
  tank:           TankWidget,
  button:         ButtonWidget,
  setpoint:       SetpointWidget,
  trend:          TrendWidget,
  numericInput:   NumericInputWidget,
  textInput:      TextInputWidget,
  historyLog:     HistoryLogWidget,
  multiState:     MultiStateWidget,
  image:          ImageWidget,
  symbol:         SymbolWidget,
  alarmBanner:    AlarmBannerWidget,
  faceplate:      FaceplateWidget,
  table:          TableWidget,
};

function VisibilityGate({ w, children }: { w: Widget; children: React.ReactNode }) {
  const t = useTag(w.visibleBinding);
  if (w.visibleBinding && !t.value) return null;
  return <>{children}</>;
}

// ── Dynamics applicator ────────────────────────────────────────────────────

async function execDynAction(d: Dynamic, tagVals: Record<string, { value: unknown }>, setActivePage: (id: string) => void) {
  if (d.actionType === "navigate" && d.pageId) {
    setActivePage(d.pageId);
    return;
  }
  if (d.actionType === "openUrl" && d.url) {
    window.open(d.url, "_blank", "noopener");
    return;
  }
  const binding = d.writeTo;
  if (!binding) return;
  const sep = binding.indexOf(":");
  if (sep < 0) return;
  let value: unknown;
  if (d.actionType === "toggleValue") {
    value = tagVals[binding]?.value ? 0 : 1;
  } else if (d.actionType === "incrementValue") {
    const cur = typeof tagVals[binding]?.value === "number" ? tagVals[binding].value as number : 0;
    value = cur + (d.step ?? 1);
  } else {
    value = d.writeValue;
  }
  await fetch(`${apiBase}/api/v1/tag/${encodeURIComponent(binding.slice(sep + 1))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasource: binding.slice(0, sep), value }),
  }).catch(() => {});
}

function DynamicsApplicator({ w, children }: { w: Widget; children: React.ReactNode }) {
  const dynamics = w.dynamics ?? [];
  const { setActivePage } = useProject();

  const bindings = useMemo(() =>
    [...new Set(dynamics.flatMap((d) => [d.binding, d.writeTo].filter(Boolean) as string[]))],
    [dynamics]
  );
  const tagVals = useTags(bindings);

  // Blink state
  const [blinkVisible, setBlinkVisible] = useState(true);
  const blinkDyn = dynamics.find((d) => d.kind === "blink" && d.binding && !!tagVals[d.binding]?.value);
  useEffect(() => {
    if (!blinkDyn) { setBlinkVisible(true); return; }
    const half = (blinkDyn.blinkPeriodMs ?? 800) / 2;
    const iv = setInterval(() => setBlinkVisible((v) => !v), half);
    return () => clearInterval(iv);
  }, [blinkDyn?.id, blinkDyn?.blinkPeriodMs, !!blinkDyn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive property dynamic values
  let hidden = false;
  let rotationDeg = 0;
  let disabled = false;
  let ringColor: string | undefined;
  const scriptOverrides: Record<string, unknown> = {};

  for (const d of dynamics) {
    const rawVal = d.binding ? tagVals[d.binding]?.value : undefined;
    const truthy = !!rawVal;

    if (d.kind === "visibility" && d.binding && !truthy) { hidden = true; break; }
    if (d.kind === "disable" && d.binding && truthy) disabled = true;
    if (d.kind === "colorFill" && d.binding) {
      ringColor = truthy ? (d.trueColor ?? "#22c55e") : (d.falseColor ?? "#3f3f46");
    }
    if (d.kind === "script" && d.binding && d.targetProp) {
      const result = evalExpression(d.expression ?? "value", rawVal);
      const truthy2 = !!result;
      if (d.targetProp === "visible") {
        if (!truthy2) hidden = true;
      } else {
        const applied = truthy2 ? (d.trueValue ?? "") : (d.falseValue ?? "");
        if (applied !== "") scriptOverrides[d.targetProp] = applied;
      }
    }
    if (d.kind === "rotation" && d.binding) {
      const num = typeof rawVal === "number" ? rawVal : 0;
      const t = Math.max(0, Math.min(1, (num - (d.minValue ?? 0)) / ((d.maxValue ?? 100) - (d.minValue ?? 0))));
      rotationDeg = (d.minAngle ?? -90) + t * ((d.maxAngle ?? 90) - (d.minAngle ?? -90));
    }
  }

  // Callbacks must be declared unconditionally before any early return (Rules of Hooks)
  const hasClick    = dynamics.some((d) => d.kind === "onClick");
  const hasPressed  = dynamics.some((d) => d.kind === "onPressed");
  const hasReleased = dynamics.some((d) => d.kind === "onReleased");

  const handleClick    = useCallback(() => dynamics.filter((d) => d.kind === "onClick").forEach((d) => execDynAction(d, tagVals, setActivePage)), [dynamics, tagVals, setActivePage]); // eslint-disable-line react-hooks/exhaustive-deps
  const handlePressed  = useCallback(() => dynamics.filter((d) => d.kind === "onPressed").forEach((d) => execDynAction(d, tagVals, setActivePage)), [dynamics, tagVals, setActivePage]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleReleased = useCallback(() => dynamics.filter((d) => d.kind === "onReleased").forEach((d) => execDynAction(d, tagVals, setActivePage)), [dynamics, tagVals, setActivePage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null;

  return (
    <ScriptOverrideContext.Provider value={scriptOverrides}>
      <div
        className="relative w-full h-full"
        style={{
          transform: rotationDeg ? `rotate(${rotationDeg.toFixed(1)}deg)` : undefined,
          opacity: blinkDyn && !blinkVisible ? 0 : 1,
          pointerEvents: disabled ? "none" : undefined,
          cursor: (hasClick || hasPressed) ? "pointer" : undefined,
          outline: ringColor ? `2px solid ${ringColor}` : undefined,
          outlineOffset: "-2px",
          borderRadius: "0.5rem",
          transition: "opacity 0.05s, outline-color 0.2s",
        }}
        onClick={hasClick ? handleClick : undefined}
        onPointerDown={hasPressed ? handlePressed : undefined}
        onPointerUp={hasReleased ? handleReleased : undefined}
      >
        {disabled && (
          <div className="absolute inset-0 z-10 bg-zinc-950/50 rounded-lg pointer-events-none" />
        )}
        {children}
      </div>
    </ScriptOverrideContext.Provider>
  );
}

export function WidgetRenderer({ w }: { w: Widget }) {
  const R = renderers[w.type] ?? (() => (
    <div className="flex items-center justify-center h-full text-zinc-500 text-xs">{w.type}</div>
  ));
  const hasDynamics = (w.dynamics?.length ?? 0) > 0;
  const inner = (
    <Frame w={w}>
      <R w={w} />
    </Frame>
  );
  return (
    <VisibilityGate w={w}>
      {hasDynamics ? <DynamicsApplicator w={w}>{inner}</DynamicsApplicator> : inner}
    </VisibilityGate>
  );
}
