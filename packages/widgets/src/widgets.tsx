// Widget renderers shared by the IDE canvas, the IDE preview and the
// operator screen. Everything outside the widget (tag values, writes,
// navigation, the runtime API, alarms, images, faceplates) comes from the
// WidgetHost the app provides (host.tsx).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Dynamic, Widget } from "@speths-screens/shared-types";
import { useHost, useTag, useTags } from "./host";
import { imageFit } from "./imageFit";
import { SYMBOLS } from "./symbols";
import { SymbolSVG } from "./SymbolSVG";

// ── helpers ────────────────────────────────────────────────────────────────

export const fmt = (v: unknown): string => {
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
// Uses new Function on project-written expressions: on the dead-ends list
// and scheduled for removal in Phase 3 (one expression language, no eval).

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

export function resolveColor(value: unknown, thresholds: ColorThreshold[]): string | null {
  if (!thresholds.length) return null;
  if (typeof value !== "number") return null;
  // Explicit range entries [value, toValue) take precedence
  for (const t of thresholds) {
    if (t.toValue !== undefined && value >= t.value && value < t.toValue) return t.color;
  }
  // Open-ended ≥ entries: highest matching threshold wins (backwards compatible)
  const sorted = [...thresholds]
    .filter((t) => t.toValue === undefined)
    .sort((a, b) => b.value - a.value);
  for (const t of sorted) {
    if (value >= t.value) return t.color;
  }
  return null;
}

// ── Frame ──────────────────────────────────────────────────────────────────

function Frame({ w, children }: { w: Widget; children: React.ReactNode }) {
  const overrides = useContext(ScriptOverrideContext);
  const colorThresholds = (w.config?.colorThresholds as ColorThreshold[]) ?? [];
  const colorBinding = (w.config?.colorBinding as string) || w.binding;
  const colorTag = useTag(colorThresholds.length ? colorBinding : undefined);
  const dynColor = resolveColor(colorTag.value, colorThresholds);

  const bgColor = (overrides.bgColor as string | undefined) ?? (w.config?.bgColor as string | undefined);
  const borderColor = (overrides.borderColor as string | undefined) ?? (w.config?.borderColor as string | undefined);
  const textColor = (overrides.textColor as string | undefined) ?? (w.config?.textColor as string | undefined);
  const noPadding = w.config?.noPadding as boolean | undefined;
  const label = w.config?.label as string | undefined;

  const isTransparent = bgColor === "none" || bgColor === "transparent";

  const style: React.CSSProperties = {
    background: isTransparent ? "transparent" : bgColor ?? "var(--card)",
    borderColor: dynColor ?? (borderColor === "none" ? "transparent" : borderColor ?? "var(--border)"),
    border: dynColor ? `2px solid ${dynColor}` : undefined,
    boxShadow: dynColor ? `0 0 8px ${dynColor}44` : undefined,
    color: textColor ?? "var(--card-foreground)",
  };
  if (!dynColor && !bgColor) {
    style.border = "1px solid var(--border)";
  }

  return (
    <div
      className={`h-full w-full rounded-lg flex flex-col gap-1 select-none transition-colors overflow-hidden ${noPadding ? "" : "p-3"}`}
      style={style}
    >
      {label && (
        <div
          className="text-[10px] uppercase tracking-wider truncate shrink-0"
          style={{ color: dynColor ?? (textColor ?? "var(--card-foreground)"), opacity: 0.6 }}
        >
          {label}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col" style={fontStyle(w.config)}>{children}</div>
    </div>
  );
}

// ── Read widgets ───────────────────────────────────────────────────────────

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
  // A binding without ":" is a literal constant (e.g. "Pump Status").
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

// ── Tank (vertical level) ─────────────────────────────────────────────────

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
        {[75, 50, 25].map((p) => (
          <div key={p} className="absolute left-0 right-0 border-t border-zinc-600/50"
            style={{ bottom: `${p}%` }} />
        ))}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-md transition-all duration-500"
          style={{ height: `${pct}%`, background: fillColor, opacity: 0.85 }}
        />
      </div>
      {/* Value + quality */}
      <div className="flex flex-col justify-end pb-1">
        <div className="text-xl font-semibold tabular-nums leading-none">{fmt(t.value)}</div>
        {(w.config?.unit as string | undefined) && <div className="text-[10px] text-zinc-500">{w.config!.unit as string}</div>}
        {(w.config?.showQuality ?? true) && <div className={`text-[9px] mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>}
      </div>
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

// ── Write widgets ──────────────────────────────────────────────────────────

function ButtonWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const host = useHost();
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
              onClick={() => targetPage && host.navigate(targetPage)}>
        {content}
      </button>
    );
  }

  if (momentary) {
    const send = (value: unknown) => w.binding && host.write({ binding: w.binding, value, widgetId: w.id });
    return (
      <button
        className={btnClass(w.config)}
        onPointerDown={() => send(onValue)}
        onPointerUp={() => send(offValue)}
        onPointerLeave={() => send(offValue)}
      >
        {content}
      </button>
    );
  }

  // Toggle mode — state-aware active styling
  const on = !!t.value;
  const nextValue = on ? offValue : onValue;
  const nextLabel = on ? `OFF (${String(offValue)})` : `ON (${String(onValue)})`;
  const toggleColor: BtnColor = on
    ? ((w.config?.toggleOnColor  as BtnColor) ?? "green")
    : ((w.config?.toggleOffColor as BtnColor) ?? "zinc");
  return (
    <button
      className={btnClass({ ...w.config, btnColor: toggleColor }, on)}
      onClick={() => w.binding && host.requestWrite({ binding: w.binding, value: nextValue, label: nextLabel, widgetId: w.id })}
    >
      {content}
    </button>
  );
}

function NumericInputWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const host = useHost();
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
        {(w.config?.showQuality ?? true) ? t.quality : "tap to enter value"}
      </div>
      {open && (
        <KeypadModal
          initial={cur}
          label={w.config?.label as string | undefined}
          unit={w.config?.unit as string | undefined}
          onConfirm={(n) => { if (w.binding) host.requestWrite({ binding: w.binding, value: n, widgetId: w.id }); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function TextInputWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const host = useHost();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => { setDraft(fmt(t.value)); setEditing(true); };
  const commit = () => {
    if (w.binding) host.requestWrite({ binding: w.binding, value: draft, widgetId: w.id });
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

// ── Setpoint slider ────────────────────────────────────────────────────────

function SetpointWidget({ w }: { w: Widget }) {
  const t = useTag(w.binding);
  const host = useHost();
  const min = (w.config?.min as number) ?? 0;
  const max = (w.config?.max as number) ?? 100;
  const step = (w.config?.step as number) ?? 1;

  // Local draft so the slider feels snappy while the write propagates.
  const [draft, setDraft] = useState<number | null>(null);
  const displayVal = draft ?? (typeof t.value === "number" ? t.value : min);

  const commit = (n: number) => {
    setDraft(null);
    if (w.binding) host.requestWrite({ binding: w.binding, value: n, widgetId: w.id });
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

// ── Trend (multi-series) ───────────────────────────────────────────────────

type Sample      = { ts: number; v: number };
type TrendSeries = { binding: string; color: string; label?: string; fill?: boolean; yMin?: number; yMax?: number };
type RefLine     = { value: number; color: string; label?: string };
const SERIES_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

/** Tracks one time-series: fetches history + appends live updates. */
function useSeries(binding: string | undefined, duration: number): Sample[] {
  const t = useTag(binding);
  const { apiFetch } = useHost();
  const [pts, setPts] = useState<Sample[]>([]);
  const ptsRef = useRef<Sample[]>([]);

  // Fetch history on mount / binding change.
  useEffect(() => {
    if (!binding) { setPts([]); ptsRef.current = []; return; }
    const from = (Date.now() - duration) * 1e6;
    apiFetch(`/api/v1/history?path=${encodeURIComponent(binding)}&from=${from}&limit=500`)
      .then((r) => (r.ok ? r.json() : []))
      .then((samples: Array<{ ts: number; value: unknown }>) => {
        const loaded: Sample[] = (Array.isArray(samples) ? samples : [])
          .filter((s) => typeof s.value === "number")
          .map((s) => ({ ts: s.ts > 1e15 ? s.ts / 1e6 : s.ts, v: s.value as number }));
        ptsRef.current = loaded;
        setPts([...loaded]);
      })
      .catch(() => {});
  }, [binding, duration, apiFetch]);

  // Append live values.
  useEffect(() => {
    if (typeof t.value !== "number" || t.quality === "Unknown") return;
    const now = t.ts > 1e15 ? t.ts / 1e6 : t.ts > 0 ? t.ts : Date.now();
    const prev = ptsRef.current;
    if (prev.length > 0 && prev[prev.length - 1]!.ts >= now) return;
    const next = [...prev.filter((p) => p.ts >= now - duration), { ts: now, v: t.value as number }];
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
  const [paused, setPaused]       = useState(false);
  const [pausedAt, setPausedAt]   = useState(0);
  const [panOffsetMs, setPanOffsetMs] = useState(0);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const svgRef      = useRef<SVGSVGElement>(null);
  const panStartX   = useRef<number | null>(null);
  const panStartOff = useRef(0);

  const duration = windowSec * 1000;

  // Build series list: config.tags[] for multi-series, or fall back to w.binding.
  const cfgTags = w.config?.tags as TrendSeries[] | undefined;
  const series: TrendSeries[] = cfgTags?.length ? cfgTags
    : w.binding ? [{ binding: w.binding, color: SERIES_COLORS[0]! }] : [];

  // Fixed-count hooks — up to 6 series.
  const s0 = useSeries(series[0]?.binding, duration);
  const s1 = useSeries(series[1]?.binding, duration);
  const s2 = useSeries(series[2]?.binding, duration);
  const s3 = useSeries(series[3]?.binding, duration);
  const s4 = useSeries(series[4]?.binding, duration);
  const s5 = useSeries(series[5]?.binding, duration);
  const allPts = [s0, s1, s2, s3, s4, s5].slice(0, series.length);
  const flat = allPts.flat();

  const liveMax = flat.length ? Math.max(...flat.map((p) => p.ts)) : Date.now();
  const tMax = (paused ? pausedAt : liveMax) - panOffsetMs;
  const tMin = tMax - duration;

  const refLines = (w.config?.refLines as RefLine[]) ?? [];
  const xFormat = (w.config?.xFormat as string) ?? "time";

  // Per-series Y scales — each series can have its own yMin/yMax
  const yScales = allPts.map((pts, i) => {
    const s = series[i]!;
    const cfgMin = w.config?.min as number | undefined;
    const cfgMax = w.config?.max as number | undefined;
    const lo = s.yMin ?? cfgMin ?? (pts.length ? Math.min(...pts.map((p) => p.v)) : 0);
    const hi = s.yMax ?? cfgMax ?? (pts.length ? Math.max(...pts.map((p) => p.v)) : 100);
    return { lo, hi, range: (hi - lo) || 1 };
  });

  // SVG coordinate helpers — per-series Y
  const toX   = (ts: number) => ((ts - tMin) / duration * 100);
  const toYi  = (v: number, i: number) => { const { lo, range } = yScales[i] ?? { lo: 0, range: 1 }; return 100 - (v - lo) / range * 100; };

  const toPolyline = (pts: Sample[], i: number) => pts.length < 2 ? "" :
    pts.filter((p) => p.ts >= tMin - duration * 0.05 && p.ts <= tMax + duration * 0.05)
      .map((p) => `${toX(p.ts).toFixed(2)},${toYi(p.v, i).toFixed(2)}`).join(" ");

  const toFillPoly = (pts: Sample[], i: number) => {
    const vis = pts.filter((p) => p.ts >= tMin - duration * 0.05 && p.ts <= tMax + duration * 0.05);
    if (vis.length < 2) return "";
    const line = vis.map((p) => `${toX(p.ts).toFixed(2)},${toYi(p.v, i).toFixed(2)}`).join(" ");
    return `${toX(vis[0]!.ts).toFixed(2)},100 ${line} ${toX(vis[vis.length-1]!.ts).toFixed(2)},100`;
  };

  // Crosshair
  const hoverTime = hoverFrac != null ? tMin + hoverFrac * duration : null;
  const nearestPt = (pts: Sample[]) => {
    if (hoverTime == null || !pts.length) return null;
    return pts.reduce((b, p) => Math.abs(p.ts - hoverTime!) < Math.abs(b.ts - hoverTime!) ? p : b);
  };

  // X-axis tick formatter
  const fmtTick = (ms: number): string => {
    const d = new Date(ms);
    if (xFormat === "relative") {
      const diffSec = Math.round((ms - Date.now()) / 1000);
      if (diffSec === 0) return "now";
      const abs = Math.abs(diffSec);
      const sign = diffSec < 0 ? "−" : "+";
      if (abs < 60)   return `${sign}${abs}s`;
      if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
      return `${sign}${Math.round(abs / 3600)}h`;
    }
    if (xFormat === "time-short") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (xFormat === "datetime")   return d.toLocaleDateString([], { month: "numeric", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const X_TICKS = 5;
  const xTicks = Array.from({ length: X_TICKS }, (_, k) => {
    const frac = k / (X_TICKS - 1);
    return { frac, ms: tMin + frac * duration };
  });

  // Scroll-wheel zoom — must be non-passive
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setWindowSec((s) => Math.max(10, Math.min(7200, Math.round(s * (e.deltaY > 0 ? 1.3 : 0.77)))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Mouse handlers
  const getSvgFrac = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    panStartX.current   = e.clientX;
    panStartOff.current = panOffsetMs;
    setIsPanning(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const frac = getSvgFrac(e.clientX);
    if (frac == null) return;
    setHoverFrac(frac);
    if (panStartX.current != null) {
      const dx = (e.clientX - panStartX.current) / (svgRef.current?.getBoundingClientRect().width ?? 1);
      setPanOffsetMs(Math.max(0, panStartOff.current + dx * duration));
    }
  };

  const onMouseUp = () => { panStartX.current = null; setIsPanning(false); };

  const onMouseLeave = () => { setHoverFrac(null); onMouseUp(); };

  const togglePause = () => {
    if (paused) { setPaused(false); setPanOffsetMs(0); }
    else        { setPausedAt(liveMax); setPaused(true); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex gap-1 items-center shrink-0 mb-0.5 flex-wrap">
        {TREND_WINDOWS.map((tw) => (
          <button key={tw.sec}
            onClick={() => { setWindowSec(tw.sec); setPanOffsetMs(0); }}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${windowSec === tw.sec && panOffsetMs === 0 && !paused ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}>
            {tw.label}
          </button>
        ))}
        <button onClick={togglePause}
          className={`text-[9px] px-1.5 py-0.5 rounded ml-0.5 ${paused ? "bg-amber-700/80 text-amber-200" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}>
          {paused ? "▶ Live" : "⏸"}
        </button>
        {panOffsetMs > 1000 && !paused && (
          <button onClick={() => setPanOffsetMs(0)} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:bg-zinc-700">
            ↩ now
          </button>
        )}
      </div>

      {/* Chart + Y-axis */}
      <div className="flex flex-1 min-h-0 gap-1 min-w-0">
        {/* Per-series Y-axis columns */}
        {yScales.map((sc, i) => {
          const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
          return (
            <div key={i} className="flex flex-col justify-between text-[7px] font-mono shrink-0 w-7 text-right py-0.5 leading-none" style={{ color }}>
              <span>{sc.hi.toFixed(sc.hi % 1 === 0 ? 0 : 1)}</span>
              <span>{((sc.lo + sc.hi) / 2).toFixed((sc.lo + sc.hi) / 2 % 1 === 0 ? 0 : 1)}</span>
              <span>{sc.lo.toFixed(sc.lo % 1 === 0 ? 0 : 1)}</span>
            </div>
          );
        })}

        {/* SVG wrapper */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          <svg
            ref={svgRef}
            className="w-full flex-1 overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ cursor: isPanning ? "grabbing" : "crosshair", display: "block" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            {/* Grid */}
            {[0,25,50,75,100].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#27272a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}

            {/* Fills */}
            {allPts.map((pts, i) => {
              if (!series[i]?.fill) return null;
              const color = series[i]!.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
              const poly  = toFillPoly(pts, i);
              return poly ? <polygon key={`f${i}`} points={poly} fill={color} fillOpacity="0.15" /> : null;
            })}

            {/* Lines + live dot */}
            {allPts.map((pts, i) => {
              const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
              const vis   = pts.filter((p) => p.ts >= tMin && p.ts <= tMax);
              const last  = vis.at(-1);
              return (
                <g key={i}>
                  <polyline points={toPolyline(pts, i)} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  {last && <circle cx={toX(last.ts)} cy={toYi(last.v, i)} r="2" fill={color} vectorEffect="non-scaling-stroke" />}
                </g>
              );
            })}

            {/* Reference lines — drawn against series 0 scale */}
            {refLines.map((rl, i) => {
              const y = toYi(rl.value, 0);
              if (y < -5 || y > 105) return null;
              return (
                <g key={`r${i}`}>
                  <line x1="0" y1={y} x2="100" y2={y} stroke={rl.color} strokeWidth="1" strokeDasharray="3,2" vectorEffect="non-scaling-stroke" />
                  {rl.label && <text x="1" y={Math.max(4, y - 1)} fontSize="4" fill={rl.color} style={{ userSelect: "none" }}>{rl.label}</text>}
                </g>
              );
            })}

            {/* Crosshair */}
            {hoverFrac != null && (
              <>
                <line x1={hoverFrac * 100} y1="0" x2={hoverFrac * 100} y2="100"
                  stroke="#ffffff38" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                {allPts.map((pts, i) => {
                  const near = nearestPt(pts);
                  if (!near) return null;
                  const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
                  return <circle key={`c${i}`} cx={toX(near.ts)} cy={toYi(near.v, i)} r="2.5" fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
                })}
              </>
            )}
          </svg>

          {/* X-axis tick labels */}
          <div className="relative shrink-0 h-3">
            {xTicks.map(({ frac, ms }) => (
              <span
                key={frac}
                className="absolute text-[7px] font-mono text-zinc-500 whitespace-nowrap"
                style={{
                  left: `${frac * 100}%`,
                  transform: frac === 0 ? "none" : frac === 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {fmtTick(ms)}
              </span>
            ))}
          </div>

          {/* Tooltip */}
          {hoverFrac != null && hoverTime != null && (
            <div
              className="absolute top-0 pointer-events-none z-10 bg-zinc-950/95 border border-zinc-700 rounded px-2 py-1.5 text-[9px] font-mono space-y-0.5 shadow-xl"
              style={{
                left: hoverFrac > 0.65 ? undefined : `calc(${hoverFrac * 100}% + 6px)`,
                right: hoverFrac > 0.65 ? `calc(${(1 - hoverFrac) * 100}% + 6px)` : undefined,
                maxWidth: "160px",
              }}
            >
              <div className="text-zinc-500 mb-0.5">{fmtTime(hoverTime)}</div>
              {allPts.map((pts, i) => {
                const near  = nearestPt(pts);
                const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
                const lbl   = series[i]?.label || `s${i}`;
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-2 h-px inline-block" style={{ backgroundColor: color }} />
                    <span style={{ color }} className="font-semibold">{lbl}:</span>
                    <span className="text-zinc-300">{near ? fmt(near.v) : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[9px] font-mono mt-0.5 shrink-0 flex-wrap">
        {allPts.map((pts, i) => {
          const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
          const last  = pts.at(-1);
          return (
            <span key={i} className="flex items-center gap-1">
              <span className="w-2 h-px inline-block rounded" style={{ backgroundColor: color }} />
              <span style={{ color }} className="font-semibold">{series[i]?.label ?? `s${i}`}</span>
              <span className="text-zinc-500">{last ? fmt(last.v) : "—"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── History log ────────────────────────────────────────────────────────────

function HistoryLogWidget({ w }: { w: Widget }) {
  const { apiFetch } = useHost();
  const [rows, setRows] = useState<Array<{ ts: number; value: unknown }>>([]);

  const pageSize = (w.config?.pageSize as number) ?? 100;
  useEffect(() => {
    if (!w.binding) return;
    const from = (Date.now() - 3600_000) * 1e6;
    apiFetch(`/api/v1/history?path=${encodeURIComponent(w.binding)}&from=${from}&limit=${pageSize}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [w.binding, pageSize, apiFetch]);

  // A plain link can't send the token, so fetch the file and save it.
  const downloadCSV = async () => {
    if (!w.binding) return;
    const from = (Date.now() - 3600_000) * 1e6;
    const r = await apiFetch(`/api/v1/history?path=${encodeURIComponent(w.binding)}&from=${from}&limit=10000&format=csv`).catch(() => null);
    if (!r?.ok) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `${w.binding.replace(/[:/]/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end mb-0.5 shrink-0">
        <button onClick={downloadCSV} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
          ↓ CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto text-[10px] font-mono space-y-0.5">
        {rows.length === 0 && <div className="text-zinc-600 italic">No history</div>}
        {[...rows].reverse().map((r, i) => (
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

// ── MultiState ─────────────────────────────────────────────────────────────

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
      className="flex-1 h-full flex items-center justify-center rounded transition-colors duration-300"
      style={{ backgroundColor: bg }}
    >
      <span className="text-lg font-bold tracking-widest uppercase text-center px-2 leading-tight" style={{ color: textClr }}>
        {text}
      </span>
    </div>
  );
}

// ── Faceplate ──────────────────────────────────────────────────────────────

/** Replaces {param} placeholders in a binding with the instance's values. */
export function rewriteBinding(binding: string | undefined, params: Record<string, string>): string | undefined {
  if (!binding) return binding;
  return binding.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
}

function FaceplateWidget({ w }: { w: Widget }) {
  const fpId = w.config?.faceplateId as string | undefined;
  const params = (w.config?.params ?? {}) as Record<string, string>;
  const fp = useHost().useFaceplate(fpId);

  if (!fp) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-purple-400/60 border border-purple-800/40 rounded-lg">
        <span className="text-xs font-mono">faceplate</span>
        <span className="text-[10px] text-zinc-600">{fpId ?? "no id"}</span>
      </div>
    );
  }

  return (
    <div className="h-full relative border border-purple-700/50 rounded-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 px-2 py-0.5 bg-purple-900/40 text-[9px] text-purple-300 font-medium tracking-wider truncate">
        FP: {fp.name}
      </div>
      <div className="absolute inset-0 pt-5">
        {fp.widgets.map((fw) => {
          const resolved = { ...fw, id: fw.localId, binding: rewriteBinding(fw.binding, params) } as Widget;
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

// ── Table ──────────────────────────────────────────────────────────────────

type TableRow = { label: string; binding: string; unit?: string };

const NO_ROWS: TableRow[] = [];

function TableWidget({ w }: { w: Widget }) {
  const rows: TableRow[] = (w.config?.rows as TableRow[]) ?? NO_ROWS;
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

// ── Image ──────────────────────────────────────────────────────────────────

function ImageWidget({ w }: { w: Widget }) {
  const src = (w.config?.src as string | undefined) ?? "";
  const fit = imageFit(w.config);
  // "lib:<id>" refers to the project image library.
  const libId = src.startsWith("lib:") ? src.slice(4) : "";
  const libSrc = useHost().useImage(libId);
  const resolved = libId ? libSrc : src || undefined;

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
      alt={(w.config?.label as string) ?? ""}
      className="w-full h-full"
      style={{ objectFit: fit }}
      draggable={false}
    />
  );
}

// ── Symbol ─────────────────────────────────────────────────────────────────

function SymbolWidget({ w }: { w: Widget }) {
  const stroke = (w.config?.stroke as string | undefined) ?? "#d4d4d8";
  const sym = SYMBOLS.find((s) => s.id === w.config?.symbolId);
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

// ── Alarm banner ───────────────────────────────────────────────────────────

const sevColor: Record<string, string> = {
  critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6",
};
const sevBg: Record<string, string> = {
  critical: "bg-red-950/60 border-red-800", warning: "bg-amber-950/60 border-amber-800", info: "bg-blue-950/60 border-blue-800",
};
const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function AlarmBannerWidget({ w }: { w: Widget }) {
  const { alarms, ack } = useHost().useAlarms();
  const maxRows = (w.config?.maxRows as number) ?? 5;
  const showAcked = !!(w.config?.showAcked as boolean);
  const visible = alarms
    .filter((a) => a.active || showAcked)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .slice(0, maxRows);

  if (visible.length === 0) {
    return <div className="flex items-center justify-center h-full text-emerald-600 text-xs font-medium">✓ No active alarms</div>;
  }

  return (
    <div className="flex flex-col gap-1 h-full overflow-hidden">
      {visible.map((a) => (
        <div key={a.id} className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${sevBg[a.severity] ?? "border-zinc-700"}`}>
          <span className="font-bold shrink-0 text-[10px] uppercase w-14" style={{ color: sevColor[a.severity] }}>{a.severity}</span>
          <span className="flex-1 truncate">{[a.ruleName, a.message].filter(Boolean).join(" — ")}</span>
          {typeof a.value === "number" && <span className="font-mono text-[10px] text-zinc-400 shrink-0">{a.value.toFixed(1)}</span>}
          {a.since !== undefined && <span className="text-[10px] text-zinc-600 shrink-0">{new Date(a.since).toLocaleTimeString()}</span>}
          {ack && a.active && !a.acked && (
            <button onClick={() => ack(a.id)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 shrink-0">ACK</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Renderer map ───────────────────────────────────────────────────────────

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

/** The widget types this library draws. */
export const RENDERED_TYPES: readonly string[] = Object.keys(renderers);

function VisibilityGate({ w, children }: { w: Widget; children: React.ReactNode }) {
  const t = useTag(w.visibleBinding);
  if (w.visibleBinding && !t.value) return null;
  return <>{children}</>;
}

// ── Dynamics applicator ────────────────────────────────────────────────────

/** The value a toggle action writes: the opposite of the current one, as a
 *  bool for a bool tag and as 0/1 otherwise. */
export function toggled(cur: unknown): unknown {
  return typeof cur === "boolean" ? !cur : cur ? 0 : 1;
}

const NO_DYNAMICS: Dynamic[] = [];

function DynamicsApplicator({ w, children }: { w: Widget; children: React.ReactNode }) {
  const dynamics = w.dynamics ?? NO_DYNAMICS;
  const host = useHost();

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
    if (d.kind === "disable"    && d.binding && truthy)  disabled = true;
    if (d.kind === "colorFill"  && d.binding) {
      ringColor = truthy ? (d.trueColor ?? "#22c55e") : (d.falseColor ?? "#3f3f46");
    }
    if (d.kind === "rotation" && d.binding) {
      const num = typeof rawVal === "number" ? rawVal : 0;
      const vMin = d.minValue ?? 0, vMax = d.maxValue ?? 100;
      const aMin = d.minAngle ?? -90, aMax = d.maxAngle ?? 90;
      const frac = Math.max(0, Math.min(1, (num - vMin) / (vMax - vMin)));
      rotationDeg = aMin + frac * (aMax - aMin);
    }
    if (d.kind === "script" && d.binding && d.targetProp) {
      const result = evalExpression(d.expression ?? "value", rawVal);
      if (d.targetProp === "visible") { if (!result) hidden = true; }
      else {
        const applied = result ? (d.trueValue ?? "") : (d.falseValue ?? "");
        if (applied !== "") scriptOverrides[d.targetProp] = applied;
      }
    }
  }

  // Callbacks must be declared unconditionally before any early return (Rules of Hooks)
  const hasClick    = dynamics.some((d) => d.kind === "onClick");
  const hasPressed  = dynamics.some((d) => d.kind === "onPressed");
  const hasReleased = dynamics.some((d) => d.kind === "onReleased");

  const execAction = useCallback((kind: string) => {
    for (const d of dynamics.filter((d) => d.kind === kind)) {
      if (d.actionType === "navigate" && d.pageId) host.navigate(d.pageId);
      else if (d.actionType === "openUrl" && d.url) window.open(d.url, "_blank", "noopener");
      else if ((d.actionType === "writeValue" || d.actionType === "toggleValue" || d.actionType === "incrementValue") && d.writeTo) {
        const cur = tagVals[d.writeTo]?.value;
        const value = d.actionType === "toggleValue" ? toggled(cur)
          : d.actionType === "incrementValue" ? (typeof cur === "number" ? cur : 0) + (d.step ?? 1)
          : d.writeValue;
        host.requestWrite({ binding: d.writeTo, value, widgetId: w.id });
      }
    }
  }, [dynamics, tagVals, host, w.id]);

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
        onClick={hasClick ? () => execAction("onClick") : undefined}
        onPointerDown={hasPressed ? () => execAction("onPressed") : undefined}
        onPointerUp={hasReleased ? () => execAction("onReleased") : undefined}
      >
        {disabled && <div className="absolute inset-0 z-10 bg-zinc-950/50 rounded-lg pointer-events-none" />}
        {children}
      </div>
    </ScriptOverrideContext.Provider>
  );
}

export function WidgetRenderer({ w }: { w: Widget }) {
  const R = renderers[w.type] ?? (() => (
    <div className="flex items-center justify-center h-full text-zinc-500 text-xs">{w.type}</div>
  ));
  return (
    <VisibilityGate w={w}>
      <DynamicsApplicator w={w}>
        <Frame w={w}><R w={w} /></Frame>
      </DynamicsApplicator>
    </VisibilityGate>
  );
}
