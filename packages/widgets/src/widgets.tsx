// Widget renderers shared by the IDE canvas, the IDE preview and the
// operator screen. Everything outside the widget (tag values, writes,
// navigation, the runtime API, alarms, images, custom widgets) comes from the
// WidgetHost the app provides (host.tsx). Widgets use format v2: settings in
// props (typed per widget type), tags in bindings, actions in events.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Action, ButtonColor, CustomWidgetPart, FrameProps, StateEntry, Threshold, TypedWidget,
  Widget, WidgetBindings, WidgetEvents, WidgetType,
} from "@speths-screens/shared-types";
import { useHost, useTag, useTags, type TagState, type WriteRequest } from "./host";
import { translateWidget } from "./translate";
import { rewriteExpr, useDrives } from "./drive";
import { SYMBOLS } from "./symbols";
import { tokenColor } from "./tokens";
import { SymbolSVG } from "./SymbolSVG";
import { partStyle, stackFor, stackStyle } from "./layout";
import { RecipesWidget } from "./recipes";
import { TrendWidget } from "./trend";
import { AlarmIndicatorWidget, ClockWidget, DriverStatusWidget, PageListWidget, PageTitleWidget, UserMenuWidget } from "./shell";
import { DEFAULT_STATES } from "./manifests";

/** A renderer's props: its widget, typed for its type. */
type WP<T extends WidgetType> = { w: TypedWidget<T> };

// ── helpers ────────────────────────────────────────────────────────────────

export const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? `${v}` : v.toFixed(2);
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  return String(v);
};

/** Whether a widget shows its tag's quality: only when it is not Good, unless the widget's showQuality
 *  setting says always (true) or never (false). A healthy value needs no label. */
const qualityShown = (setting: boolean | undefined, quality: string): boolean => setting === true || (setting !== false && quality !== "Good");

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
        {label && <div className="text-xs text-zinc-500 truncate">{label}</div>}
        <div className="text-2xl tabular-nums text-right bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 min-h-[2.5rem]">
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

// ── Typography helper ──────────────────────────────────────────────────────

const FONT_SIZE_MAP: Record<string, string> = {
  xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem",
  xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem", "5xl": "3rem", "6xl": "3.75rem",
  fit: "clamp(0.75rem, min(55cqh, 22cqw), 40rem)",
};
const FONT_FAMILY_MAP: Record<string, string> = {
  mono: "ui-monospace, monospace",
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
};

function fontStyle(p: FrameProps): React.CSSProperties {
  return {
    fontFamily: FONT_FAMILY_MAP[p.fontFamily ?? ""] ?? undefined,
    fontSize:   p.fontPx ? `${p.fontPx}px` : FONT_SIZE_MAP[p.fontSize ?? ""] ?? undefined,
    fontWeight: p.fontBold    ? "bold"   : undefined,
    fontStyle:  p.fontItalic  ? "italic" : undefined,
    textDecoration: p.fontUnderline ? "underline" : undefined,
    textAlign:  p.textAlign ?? undefined,
    color:      p.textColor || undefined,
  };
}

/** A widget's main text: the frame's size setting when there is one, else the widget's own class. */
function mainText(p: FrameProps, cls: string): { className: string; style?: React.CSSProperties } {
  const sized = !!p.fontPx || !!FONT_SIZE_MAP[p.fontSize ?? ""];
  return { className: sized ? "" : cls };
}
/** The unit beside a value: hidden by showUnit false, and in proportion to a value the frame sized. */
function unitOf(p: FrameProps & { unit?: string }, cls = "text-base text-zinc-500 ml-1") {
  if (!p.unit || p.showUnit === false) return null;
  const sized = !!p.fontPx || !!FONT_SIZE_MAP[p.fontSize ?? ""];
  return <span className={sized ? "opacity-60 ml-1" : cls} style={sized ? { fontSize: "0.45em" } : undefined}>{p.unit}</span>;
}
const VALIGN: Record<string, string> = { top: "flex-start", center: "center", bottom: "flex-end" };

// ── Color threshold helper ─────────────────────────────────────────────────

export function resolveColor(value: unknown, thresholds: Threshold[]): string | null {
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

const NO_THRESHOLDS: Threshold[] = [];

/** The header and navigation widgets sit on the page without a card of their own, unless given a color. */
const SHELL_TYPES = new Set<string>(["pageList", "clock", "driverStatus", "userMenu", "alarmIndicator", "pageTitle"]);

function Frame({ w, children }: { w: Widget; children: React.ReactNode }) {
  // Driven properties are already in w.props (DriveApplicator).
  const p: FrameProps = w.props ?? {};
  const colorThresholds = p.colorThresholds ?? NO_THRESHOLDS;
  const colorTag = useTag(colorThresholds.length ? (w.bindings?.color || w.bindings?.value) : undefined);
  const dynColor = resolveColor(colorTag.value, colorThresholds);

  const { bgColor, borderColor, textColor } = p;

  const isTransparent = bgColor === "none" || bgColor === "transparent";

  const style: React.CSSProperties = {
    background: isTransparent ? "transparent" : bgColor ?? "var(--card)",
    borderColor: dynColor ?? (borderColor === "none" ? "transparent" : borderColor ?? "var(--border)"),
    border: dynColor ? `2px solid ${dynColor}` : undefined,
    boxShadow: dynColor ? `0 0 8px ${dynColor}44` : "var(--shadow, none)",
    borderRadius: p.radius !== undefined ? p.radius : "var(--radius, 0.5rem)",
    padding: p.padding !== undefined ? p.padding : p.noPadding ? 0 : "var(--pad, 0.75rem)",
    color: textColor ?? "var(--card-foreground)",
    fontFamily: "var(--font-sans, inherit)",
  };
  if (!dynColor && !bgColor) {
    style.border = "var(--line-width, 1px) solid var(--border)";
  }
  if (p.borderWidth !== undefined) {
    style.borderWidth = p.borderWidth;
    style.borderStyle = p.borderWidth ? "solid" : "none";
    if (!dynColor && !borderColor) style.borderColor = "var(--border)";
  }
  if (p.shadow === false) style.boxShadow = "none";
  // A pipe, and a symbol with no background or border of its own, is a drawing on the page, not a card:
  // no frame, and no frame label (a symbol draws its own).
  // A widget given no background and no border draws on whatever is behind it (the parts of a header):
  // no shadow or corners either, but it keeps its label.
  const noBorder = borderColor === "none" || borderColor === "transparent";
  const cardless = isTransparent && noBorder;
  const bare = w.type === "pipe" || w.type === "shape" || ((w.type === "symbol" || SHELL_TYPES.has(w.type)) && !bgColor && !borderColor);
  if (bare || cardless) {
    style.background = "transparent";
    style.border = "none";
    style.boxShadow = "none";
    style.borderRadius = 0;
    style.padding = 0;
  }

  return (
    <div
      className="h-full w-full flex flex-col gap-1 select-none transition-colors overflow-hidden"
      style={style}
    >
      {p.label && !bare && p.showLabel !== false && w.type !== "button" && ( // a button says its own label
        <div
          className="text-xs uppercase tracking-wider truncate shrink-0"
          style={{ color: dynColor ?? (textColor ?? "var(--card-foreground)"), opacity: 0.6 }}
        >
          {p.label}
        </div>
      )}
      {/* "fit" sizes the text in container units, which count from the nearest container: this box, not the page. */}
      <div className="flex-1 min-h-0 flex flex-col" style={p.fontSize === "fit" && !p.fontPx ? { containerType: "size" } : undefined}>
        <div className="flex-1 min-h-0 flex flex-col" style={fontStyle(p)}>{children}</div>
      </div>
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

/** The fill colour rules: colorThresholds, else the older thresholds. */
function fillThresholds(p: { colorThresholds?: Threshold[]; thresholds?: Threshold[] }): Threshold[] {
  return p.colorThresholds?.length ? p.colorThresholds : p.thresholds ?? NO_THRESHOLDS;
}

function GaugeWidget({ w }: WP<"gauge">) {
  const p = w.props ?? {};
  const t = useTag(w.bindings?.value);
  const min = p.min ?? 0;
  const max = p.max ?? 100;
  const v = typeof t.value === "number" ? t.value : min;
  const pct = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const fillSweep = pct * GAUGE_SWEEP;
  const arcColor = resolveColor(v, fillThresholds(p)) ?? "#22c55e";

  // needleAngle: degrees clockwise from 12 o'clock. Needle drawn at 12 o'clock,
  // rotated via CSS transform for smooth animation.
  const needleAngle = GAUGE_START + fillSweep;
  const minPt = gaugePolar(GAUGE_START, GAUGE_R + 6);
  const maxPt = gaugePolar(GAUGE_START + GAUGE_SWEEP, GAUGE_R + 6);

  return (
    <div className="flex flex-col h-full justify-center gap-0.5">
      {/* The value is HTML text over the gauge's opening, sized from the card, so it stays readable in a small one. */}
      <div className="relative w-full min-h-0 flex-1" style={{ containerType: "size" }}>
      <svg viewBox="0 0 100 75" className="absolute inset-0 w-full h-full">
        {/* Track */}
        <path d={gaugeArcPath(GAUGE_START, GAUGE_SWEEP)} fill="none" style={{ stroke: "var(--secondary)" }} strokeWidth="7" strokeLinecap="round" />
        {/* Fill */}
        {fillSweep > 0.5 && (
          <path d={gaugeArcPath(GAUGE_START, fillSweep)} fill="none" stroke={arcColor} strokeWidth="7" strokeLinecap="round" />
        )}
        {/* Tick marks at 0%, 25%, 50%, 75%, 100% */}
        {[0, 0.25, 0.5, 0.75, 1].map((q) => {
          const a = GAUGE_START + q * GAUGE_SWEEP;
          const outer = gaugePolar(a, GAUGE_R + 2);
          const inner = gaugePolar(a, GAUGE_R - 9);
          return (
            <line key={q} x1={outer.x.toFixed(2)} y1={outer.y.toFixed(2)}
              x2={inner.x.toFixed(2)} y2={inner.y.toFixed(2)}
              style={{ stroke: "var(--muted-foreground)" }} strokeWidth={q === 0 || q === 1 ? 1.5 : 0.8} />
          );
        })}
        {/* Min/max labels */}
        <text x={minPt.x.toFixed(1)} y={minPt.y.toFixed(1)} textAnchor="end"
          fontSize="6" style={{ fill: "var(--muted-foreground)" }}>{min}</text>
        <text x={maxPt.x.toFixed(1)} y={maxPt.y.toFixed(1)} textAnchor="start"
          fontSize="6" style={{ fill: "var(--muted-foreground)" }}>{max}</text>
        {/* Needle — rotated via CSS for smooth animation */}
        <g style={{
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: `${GAUGE_CX}px ${GAUGE_CY}px`,
          transition: "transform 0.3s ease-out",
        }}>
          <line x1={GAUGE_CX} y1={GAUGE_CY + 6} x2={GAUGE_CX} y2={GAUGE_CY - (GAUGE_R - 4)}
            style={{ stroke: "var(--foreground)" }} strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r="3.5" style={{ fill: "var(--muted-foreground)" }} />
        <circle cx={GAUGE_CX} cy={GAUGE_CY} r="1.5" style={{ fill: "var(--card)" }} />
      </svg>
      <div className="absolute left-0 right-0 text-center font-semibold tabular-nums leading-none whitespace-nowrap"
        style={{ bottom: "4%", color: "var(--foreground)", fontSize: "clamp(0.875rem, 11cqmin, 2rem)" }}>
        {typeof t.value === "number" ? t.value.toFixed(1) : "—"}
        {p.unit ? ` ${p.unit}` : ""}
      </div>
      </div>
      {qualityShown(p.showQuality, t.quality) && (
        <div className={`text-xs text-center ${qualityColor[t.quality] ?? "text-zinc-600"}`}>{t.quality}</div>
      )}
    </div>
  );
}

function NumericDisplayWidget({ w }: WP<"numericDisplay">) {
  const p = w.props ?? {};
  const t = useTag(w.bindings?.value);
  return (
    <div className="flex flex-col h-full" style={{ justifyContent: VALIGN[p.valign ?? ""] ?? "center" }}>
      <div className={`${mainText(p, "text-3xl").className} font-semibold tabular-nums leading-none`}>
        {fmt(t.value)}
        {unitOf(p)}
      </div>
      {qualityShown(p.showQuality, t.quality) && (
        <div className={`text-xs mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>
      )}
    </div>
  );
}

function TextDisplayWidget({ w }: WP<"textDisplay">) {
  const p = w.props ?? {};
  const t = useTag(p.staticText === undefined ? w.bindings?.value : undefined);
  const align = p.textAlign ?? "left";
  const justifyCls = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  return (
    <div className={`break-words h-full flex ${justifyCls} ${mainText(p, "text-lg").className}`} style={{ alignItems: VALIGN[p.valign ?? ""] ?? "center" }}>
      {p.staticText ?? fmt(t.value)}
    </div>
  );
}

function LEDWidget({ w }: WP<"led">) {
  const p = w.props ?? {};
  const t = useTag(w.bindings?.value);
  const on = !!t.value;
  const trueColor = p.trueColor ?? "#22c55e";
  const falseColor = p.falseColor ?? "#3f3f46";
  return (
    <div className="flex items-center gap-2 h-full">
      <div
        className="w-6 h-6 rounded-full shadow-[inset_0_0_8px_rgba(0,0,0,0.4)]"
        style={{ background: on ? trueColor : falseColor, boxShadow: on ? `0 0 10px ${trueColor}88` : undefined }}
      />
      <div className="text-sm font-medium">{on ? (p.trueLabel ?? "ON") : (p.falseLabel ?? "OFF")}</div>
    </div>
  );
}

// ── Tank (vertical level) ─────────────────────────────────────────────────

function TankWidget({ w }: WP<"tank">) {
  const p = w.props ?? {};
  const t = useTag(w.bindings?.value);
  const min = p.min ?? 0;
  const max = p.max ?? 100;
  const v = typeof t.value === "number" ? t.value : 0;
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const fillColor = resolveColor(v, fillThresholds(p)) ?? "#3b82f6";

  return (
    <div className="flex gap-3 h-full items-end">
      {/* Vertical bar */}
      <div className="flex flex-col w-10 h-full bg-zinc-800 rounded-md overflow-hidden relative border border-zinc-700">
        {[75, 50, 25].map((q) => (
          <div key={q} className="absolute left-0 right-0 border-t border-zinc-600/50"
            style={{ bottom: `${q}%` }} />
        ))}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-md transition-all duration-500"
          style={{ height: `${pct}%`, background: fillColor, opacity: 0.85 }}
        />
      </div>
      {/* Value + quality */}
      <div className="flex flex-col justify-end pb-1">
        <div className={`${mainText(p, "text-xl").className} font-semibold tabular-nums leading-none`}>{fmt(t.value)}</div>
        {p.unit && p.showUnit !== false && <div className="text-xs text-zinc-500">{p.unit}</div>}
        {qualityShown(p.showQuality, t.quality) && <div className={`text-xs mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>}
      </div>
    </div>
  );
}

// ── Button style system ────────────────────────────────────────────────────

type BtnVariant = "filled" | "outlined" | "ghost" | "flat" | "industrial";
type BtnRounded = "none" | "sm" | "md" | "lg" | "full";

const BTN_ROUNDED: Record<BtnRounded, string> = {
  none: "rounded-none", sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", full: "rounded-full",
};

const BTN_COLORS: Record<ButtonColor, Record<BtnVariant, string>> = {
  blue:   { filled: "bg-blue-600 hover:bg-blue-500 text-white",                 outlined: "border-2 border-blue-500 text-blue-300 hover:bg-blue-900/30",   ghost: "text-blue-300 hover:bg-blue-900/40",      flat: "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50",   industrial: "bg-gradient-to-b from-blue-500 to-blue-700 border border-blue-900 text-white shadow-inner" },
  green:  { filled: "bg-emerald-600 hover:bg-emerald-500 text-white",           outlined: "border-2 border-emerald-500 text-emerald-300 hover:bg-emerald-900/30", ghost: "text-emerald-300 hover:bg-emerald-900/40", flat: "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50", industrial: "bg-gradient-to-b from-emerald-500 to-emerald-700 border border-emerald-900 text-white shadow-inner" },
  red:    { filled: "bg-red-600 hover:bg-red-500 text-white",                   outlined: "border-2 border-red-500 text-red-300 hover:bg-red-900/30",       ghost: "text-red-300 hover:bg-red-900/40",        flat: "bg-red-900/40 text-red-300 hover:bg-red-800/50",       industrial: "bg-gradient-to-b from-red-500 to-red-700 border border-red-900 text-white shadow-inner" },
  amber:  { filled: "bg-amber-500 hover:bg-amber-400 text-zinc-900 font-bold",  outlined: "border-2 border-amber-500 text-amber-300 hover:bg-amber-900/30",  ghost: "text-amber-300 hover:bg-amber-900/40",    flat: "bg-amber-900/40 text-amber-300 hover:bg-amber-800/50",  industrial: "bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-900 text-zinc-900 shadow-inner" },
  zinc:   { filled: "bg-zinc-700 hover:bg-zinc-600 text-zinc-100",              outlined: "border-2 border-zinc-500 text-zinc-300 hover:bg-zinc-800",        ghost: "text-zinc-300 hover:bg-zinc-800",          flat: "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60",    industrial: "bg-gradient-to-b from-zinc-500 to-zinc-700 border border-zinc-900 text-white shadow-inner" },
  purple: { filled: "bg-purple-600 hover:bg-purple-500 text-white",             outlined: "border-2 border-purple-500 text-purple-300 hover:bg-purple-900/30", ghost: "text-purple-300 hover:bg-purple-900/40",  flat: "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50", industrial: "bg-gradient-to-b from-purple-500 to-purple-700 border border-purple-900 text-white shadow-inner" },
  orange: { filled: "bg-orange-500 hover:bg-orange-400 text-white",             outlined: "border-2 border-orange-500 text-orange-300 hover:bg-orange-900/30", ghost: "text-orange-300 hover:bg-orange-900/40",  flat: "bg-orange-900/40 text-orange-300 hover:bg-orange-800/50", industrial: "bg-gradient-to-b from-orange-400 to-orange-600 border border-orange-900 text-white shadow-inner" },
  white:  { filled: "bg-white hover:bg-zinc-100 text-zinc-900",                 outlined: "border-2 border-zinc-300 text-zinc-100 hover:bg-zinc-800",         ghost: "text-zinc-200 hover:bg-zinc-800",          flat: "bg-white/10 text-zinc-200 hover:bg-white/20",          industrial: "bg-gradient-to-b from-zinc-200 to-zinc-400 border border-zinc-600 text-zinc-900 shadow-inner" },
};

function btnClass(variant: BtnVariant | undefined, color: ButtonColor, rounded: BtnRounded | undefined, activeOn = false): string {
  const colorCls = BTN_COLORS[color]?.[variant ?? "filled"] ?? BTN_COLORS.blue.filled;
  const roundedCls = BTN_ROUNDED[rounded ?? "md"] ?? "rounded-md";
  const activeCls = activeOn ? "ring-2 ring-current ring-offset-1 ring-offset-zinc-950" : "";
  return `w-full h-full ${roundedCls} ${colorCls} text-sm font-medium transition-all active:scale-95 ${activeCls}`;
}

// ── Write widgets ──────────────────────────────────────────────────────────

/** A button only draws: what it does is its events (see Interaction). A
 *  button with a toggle action shows its tag's state. */
function ButtonWidget({ w }: WP<"button">) {
  const p = w.props ?? {};
  const t = useTag(w.bindings?.value);
  const clicks = w.events?.onClick ?? [];
  const toggles = clicks.some((a) => a.type === "toggle");
  const navigates = clicks.some((a) => a.type === "navigate");
  const on = toggles && !!t.value;
  const color: ButtonColor = toggles
    ? (on ? p.toggleOnColor as ButtonColor | undefined ?? "green" : p.toggleOffColor as ButtonColor | undefined ?? "zinc")
    : p.btnColor ?? (navigates ? "purple" : "blue");
  return (
    <button className={btnClass(p.btnVariant, color, p.btnRounded, on)}>
      <span className="flex items-center justify-center gap-1.5">
        {p.icon && <span className="text-base leading-none">{p.icon}</span>}
        {p.label ?? "Press"}
      </span>
    </button>
  );
}

function NumericInputWidget({ w }: WP<"numericInput">) {
  const p = w.props ?? {};
  const tag = w.bindings?.value;
  const t = useTag(tag);
  const host = useHost();
  const [open, setOpen] = useState(false);
  const cur = typeof t.value === "number" ? t.value : 0;

  return (
    <div className="flex flex-col h-full" style={{ justifyContent: VALIGN[p.valign ?? ""] ?? "center" }}>
      <div
        onClick={() => setOpen(true)}
        className={`${mainText(p, "text-3xl").className} font-semibold tabular-nums leading-none cursor-pointer hover:bg-zinc-800 rounded px-1 transition-colors select-none`}
      >
        {fmt(t.value)}
        {unitOf(p)}
      </div>
      {qualityShown(p.showQuality, t.quality) && (
        <div className={`text-xs mt-1 ${qualityColor[t.quality] ?? "text-zinc-500"}`}>{t.quality}</div>
      )}
      {open && (
        <KeypadModal
          initial={cur}
          label={p.label}
          unit={p.unit}
          onConfirm={(n) => { if (tag) host.requestWrite({ binding: tag, value: n, widgetId: w.id }); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function TextInputWidget({ w }: WP<"textInput">) {
  const tag = w.bindings?.value;
  const t = useTag(tag);
  const host = useHost();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => { setDraft(fmt(t.value)); setEditing(true); };
  const commit = () => {
    if (tag) host.requestWrite({ binding: tag, value: draft, widgetId: w.id });
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
          className="text-sm bg-zinc-800 border border-blue-500 rounded px-2 py-1 w-full outline-none tabular-nums"
        />
      ) : (
        <div onClick={startEdit} className="text-sm cursor-text hover:bg-zinc-800 rounded px-1 transition-colors tabular-nums">
          {fmt(t.value)}
        </div>
      )}
    </div>
  );
}

// ── Setpoint slider ────────────────────────────────────────────────────────

function SetpointWidget({ w }: WP<"setpoint">) {
  const p = w.props ?? {};
  const tag = w.bindings?.value;
  const t = useTag(tag);
  const host = useHost();
  const min = p.min ?? 0;
  const max = p.max ?? 100;
  const step = p.step ?? 1;

  // Local draft so the slider feels snappy while the write propagates.
  const [draft, setDraft] = useState<number | null>(null);
  const displayVal = draft ?? (typeof t.value === "number" ? t.value : min);

  const commit = (n: number) => {
    setDraft(null);
    if (tag) host.requestWrite({ binding: tag, value: n, widgetId: w.id });
  };

  return (
    <div className="flex flex-col h-full justify-center gap-2">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{displayVal.toFixed(step < 1 ? 1 : 0)}</span>
        {p.unit && <span className="text-xs text-zinc-500">{p.unit}</span>}
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
      <div className="flex justify-between text-xs text-zinc-600">
        <span>{min}</span>
        {qualityShown(p.showQuality, t.quality) && (
          <span className={qualityColor[t.quality] ?? "text-zinc-600"}>{t.quality}</span>
        )}
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── Trend (multi-series) ───────────────────────────────────────────────────

// ── History log ────────────────────────────────────────────────────────────

function HistoryLogWidget({ w }: WP<"historyLog">) {
  const { apiFetch } = useHost();
  const tag = w.bindings?.value;
  const [rows, setRows] = useState<Array<{ ts: number; value: unknown }>>([]);

  const pageSize = w.props?.pageSize ?? 100;
  useEffect(() => {
    if (!tag) return;
    const from = (Date.now() - 3600_000) * 1e6;
    apiFetch(`/api/v1/history?path=${encodeURIComponent(tag)}&from=${from}&limit=${pageSize}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [tag, pageSize, apiFetch]);

  // A plain link can't send the token, so fetch the file and save it.
  const downloadCSV = async () => {
    if (!tag) return;
    const from = (Date.now() - 3600_000) * 1e6;
    const r = await apiFetch(`/api/v1/history?path=${encodeURIComponent(tag)}&from=${from}&limit=10000&format=csv`).catch(() => null);
    if (!r?.ok) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `${tag.replace(/[:/]/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end mb-0.5 shrink-0">
        <button onClick={downloadCSV} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
          ↓ CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto text-xs tabular-nums space-y-0.5">
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

function MultiStateWidget({ w }: WP<"multiState">) {
  const t = useTag(w.bindings?.value);
  const states: StateEntry[] = w.props?.states ?? DEFAULT_STATES;
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

// ── Custom widget ──────────────────────────────────────────────────────────────

/** Replaces {param} placeholders in a binding with the instance's values. */
export function rewriteBinding(binding: string | undefined, params: Record<string, string>): string | undefined {
  if (!binding) return binding;
  return binding.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
}

/** A custom widget part with the instance's parameters filled into its
 *  tags (bindings, action tags and dynamics). */
function resolveInner(fw: CustomWidgetPart, params: Record<string, string>): Widget {
  const rb = (b: string | undefined) => rewriteBinding(b, params);
  const bindings: WidgetBindings | undefined = fw.bindings && {
    value: rb(fw.bindings.value), visible: rb(fw.bindings.visible), color: rb(fw.bindings.color),
  };
  const events: WidgetEvents | undefined = fw.events && Object.fromEntries(
    Object.entries(fw.events).map(([k, list]) => [k, (list as Action[]).map((a) => (a.tag ? { ...a, tag: rb(a.tag) } : a))]),
  );
  const dynamics = fw.dynamics && Object.fromEntries(
    Object.entries(fw.dynamics).map(([k, d]) => [k, { ...d, expr: rewriteExpr(d.expr, params) }]),
  );
  // A custom widget placed inside this one passes its own parameters on: their values may name this one's.
  const props = fw.type === "customWidget" && fw.props?.params
    ? { ...fw.props, params: Object.fromEntries(Object.entries(fw.props.params).map(([k, v]) => [k, rewriteBinding(v, params) ?? v])) }
    : fw.props;
  const { localId, ...rest } = fw;
  return { ...rest, id: localId, props, bindings, events, dynamics } as Widget;
}

/** How deep custom widgets sit inside each other; a loop in the project stops here. */
const NESTING_LIMIT = 6;
const NestingContext = createContext(0);

function CustomWidgetView({ w }: WP<"customWidget">) {
  const cwId = w.props?.customWidgetId;
  const params = w.props?.params ?? {};
  const host = useHost();
  const cw = host.useCustomWidget(cwId);
  const device = host.useDevice();
  const depth = useContext(NestingContext);

  if (!cw || depth >= NESTING_LIMIT) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-purple-400/60 border border-purple-800/40 rounded-lg">
        <span className="text-xs tabular-nums">custom widget</span>
        <span className="text-xs text-zinc-600">{cw ? "nested too deep" : (cwId ?? "no id")}</span>
      </div>
    );
  }

  const stack = stackFor(cw.layout, device);
  return (
    <NestingContext.Provider value={depth + 1}>
      <div className="h-full relative overflow-hidden" style={stack ? stackStyle(stack) : undefined}>
        {cw.widgets.map((fw) => {
          if (stack) {
            const style = partStyle(fw, stack, device);
            if (!style) return null;
            return (
              <div key={fw.localId} style={style}>
                <WidgetRenderer w={resolveInner(fw, params)} />
              </div>
            );
          }
          const left   = `${((fw.x / (w.w || 1)) * 100).toFixed(1)}%`;
          const top    = `${((fw.y / (w.h || 1)) * 100).toFixed(1)}%`;
          const width  = `${((fw.w / (w.w || 1)) * 100).toFixed(1)}%`;
          const height = `${((fw.h / (w.h || 1)) * 100).toFixed(1)}%`;
          return (
            <div key={fw.localId} className="absolute" style={{ left, top, width, height }}>
              <WidgetRenderer w={resolveInner(fw, params)} />
            </div>
          );
        })}
      </div>
    </NestingContext.Provider>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

function TableWidget({ w }: WP<"table">) {
  const rows = w.props?.rows;
  const bindings = useMemo(() => (rows ?? []).map((r) => r.binding).filter(Boolean), [rows]);
  const tags = useTags(bindings);
  const showQuality = w.props?.showQuality;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="text-left text-zinc-500 font-medium py-0.5 pr-2 sticky top-0 bg-zinc-900">Tag</th>
            <th className="text-right text-zinc-500 font-medium py-0.5 pl-2 sticky top-0 bg-zinc-900">Value</th>
            {showQuality && <th className="text-right text-zinc-500 font-medium py-0.5 pl-2 sticky top-0 bg-zinc-900">Q</th>}
          </tr>
        </thead>
        <tbody>
          {!rows?.length && (
            <tr><td colSpan={3} className="text-zinc-600 italic py-2 text-center text-xs">No rows configured</td></tr>
          )}
          {(rows ?? []).map((row, i) => {
            const t = tags[row.binding];
            return (
              <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                <td className="py-1 pr-2 text-zinc-400 truncate max-w-[120px]" title={row.binding}>
                  {row.label || row.binding}
                </td>
                <td className="py-1 pl-2 text-right text-zinc-100 tabular-nums">
                  {fmt(t?.value)}
                  {row.unit && <span className="text-zinc-500 ml-1 text-xs">{row.unit}</span>}
                </td>
                {showQuality && (
                  <td className={`py-1 pl-2 text-right text-xs ${qualityColor[t?.quality ?? ""] ?? "text-zinc-600"}`}>
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

function ImageWidget({ w }: WP<"image">) {
  const src = w.props?.src ?? "";
  // "lib:<id>" refers to the project image library.
  const libId = src.startsWith("lib:") ? src.slice(4) : "";
  const libSrc = useHost().useImage(libId);
  const resolved = libId ? libSrc : src || undefined;

  if (!resolved) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-zinc-600">
        <span className="text-2xl opacity-40">🖼</span>
        <span className="text-xs">No image</span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={w.props?.label ?? ""}
      className="w-full h-full"
      style={{ objectFit: w.props?.fit ?? "contain" }}
      draggable={false}
    />
  );
}

// ── Symbol ─────────────────────────────────────────────────────────────────

/** The keyframes process graphics use. A person who asks the browser for less motion sees
 *  everything still: a running pump is still shown by its color, and a flowing pipe by its dashes. */
export const MOTION_CSS = `
@keyframes ss-spin { to { transform: rotate(360deg); } }
@keyframes ss-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes ss-flow { to { stroke-dashoffset: var(--ss-flow-step, -18); } }
@media (prefers-reduced-motion: reduce) {
  [data-ss-motion] { animation: none !important; }
}`;

function MotionStyles() {
  return <style>{MOTION_CSS}</style>;
}

function SymbolWidget({ w }: WP<"symbol">) {
  const stroke = w.props?.stroke ?? "var(--foreground)";
  const motion = w.props?.animate ? w.props?.motion ?? "still" : "still";
  const seconds = Math.max(0.2, w.props?.cycleSeconds ?? 2);
  const animation = motion === "spin" ? `ss-spin ${seconds}s linear infinite`
    : motion === "pulse" ? `ss-pulse ${seconds}s ease-in-out infinite` : undefined;
  const sym = SYMBOLS.find((s) => s.id === w.props?.symbolId);
  if (!sym) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">?sym</div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-1 gap-0.5">
      <div className="flex-1 min-h-0 flex items-center justify-center w-full">
        {animation && <MotionStyles />}
        <div className="w-full h-full" data-ss-motion={animation ? motion : undefined}
          style={{ animation, transformOrigin: "center", transformBox: "fill-box" }}>
          <SymbolSVG svg={sym.svg} stroke={stroke} size={0} />
        </div>
      </div>
      {w.props?.label && (
        <span className="text-xs text-zinc-400 truncate max-w-full shrink-0">{w.props.label}</span>
      )}
    </div>
  );
}

// ── Pipe ─────────────────────────────────────────────────────

/** "0,50 60,50 60,100" as points; a pair that is not two numbers is left out. */
export function parsePipePoints(src: string | undefined): [number, number][] {
  const out: [number, number][] = [];
  for (const pair of (src ?? "").trim().split(/\s+/)) {
    const [x, y] = pair.split(",").map(Number);
    if (pair && Number.isFinite(x) && Number.isFinite(y)) out.push([Math.min(100, Math.max(0, x!)), Math.min(100, Math.max(0, y!))]);
  }
  return out;
}

function PipeWidget({ w }: WP<"pipe">) {
  const p = w.props ?? {};
  const pts = parsePipePoints(p.points);
  const line = (pts.length >= 2 ? pts : ([[0, 50], [100, 50]] as [number, number][])).map(([x, y]) => `${x},${y}`).join(" ");
  const weight = Math.max(1, p.weight ?? 8);
  const color = p.color ?? "var(--process-off)";
  const flowing = !!p.flow;
  const step = p.reverse ? 18 : -18;
  const seconds = Math.max(0.2, p.cycleSeconds ?? 1);
  // Colors go in style: an SVG attribute cannot hold var(--token).
  const common = { fill: "none", strokeLinecap: "butt", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;
  const paint = (stroke: string, width: number): React.CSSProperties => ({ stroke, strokeWidth: width });
  return (
    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={p.label ?? "Pipe"}
      style={{ overflow: "visible" }}>
      {flowing && <MotionStyles />}
      <polyline points={line} {...common} style={paint("var(--border)", weight + 2)} />
      <polyline points={line} {...common} data-pipe-body style={paint(color, weight)} />
      {flowing && (
        <polyline points={line} {...common} strokeDasharray="8 10" data-ss-motion="flow"
          style={{ ...paint(p.flowColor ?? "var(--card)", Math.max(1, weight / 3)), animation: `ss-flow ${seconds}s linear infinite`, ["--ss-flow-step" as string]: String(step) }} />
      )}
    </svg>
  );
}

// ── Shape ────────────────────────────────────────────────────

/** A color setting as CSS: a token such as token:alarm-critical, or the color as written. */
const paintOf = (v: string | undefined, missing: string) => (v ? tokenColor(v) ?? v : missing);

/** A line's ends as percentages across and down its box. */
export function shapeLineEnds(direction: string | undefined): { x1: number; y1: number; x2: number; y2: number } {
  switch (direction) {
    case "vertical": return { x1: 50, y1: 0, x2: 50, y2: 100 };
    case "down": return { x1: 0, y1: 0, x2: 100, y2: 100 };
    case "up": return { x1: 0, y1: 100, x2: 100, y2: 0 };
    default: return { x1: 0, y1: 50, x2: 100, y2: 50 };
  }
}

/** A rectangle, an ellipse or a line: a drawing on the page, with no card of its own. */
function ShapeWidget({ w }: WP<"shape">) {
  const p = w.props ?? {};
  const kind = p.kind ?? "rectangle";
  const stroke = paintOf(p.stroke, "var(--foreground)");
  const weight = Math.max(0, p.weight ?? 2);
  if (kind === "line") {
    const e = shapeLineEnds(p.direction);
    const width = Math.max(1, weight);
    // No viewBox: the ends are percentages of the box and the width is in pixels, so neither the
    // line nor its arrow heads stretch with the widget. The head's color is set here because the
    // panel's browser has no context-stroke.
    const head = `shape-head-${w.id}`;
    return (
      <svg className="w-full h-full" role="img" aria-label={p.label ?? "Line"} data-shape="line" style={{ overflow: "visible", display: "block" }}>
        {(p.arrowStart || p.arrowEnd) && (
          <defs>
            <marker id={head} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: stroke }} />
            </marker>
          </defs>
        )}
        <line x1={`${e.x1}%`} y1={`${e.y1}%`} x2={`${e.x2}%`} y2={`${e.y2}%`}
          strokeDasharray={p.dashed ? `${width * 3} ${width * 2}` : undefined}
          markerStart={p.arrowStart ? `url(#${head})` : undefined} markerEnd={p.arrowEnd ? `url(#${head})` : undefined}
          style={{ stroke, strokeWidth: width }} />
      </svg>
    );
  }
  return (
    <div role="img" aria-label={p.label ?? (kind === "ellipse" ? "Ellipse" : "Rectangle")} data-shape={kind} className="w-full h-full"
      style={{
        boxSizing: "border-box",
        background: paintOf(p.fill, "transparent"),
        border: weight ? `${weight}px ${p.dashed ? "dashed" : "solid"} ${stroke}` : "none",
        borderRadius: kind === "ellipse" ? "50%" : Math.max(0, p.cornerRadius ?? 0),
      }} />
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

function AlarmBannerWidget({ w }: WP<"alarmBanner">) {
  const { alarms, ack } = useHost().useAlarms();
  const maxRows = w.props?.maxRows ?? 5;
  const showAcked = !!w.props?.showAcked;
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
          <span className="font-bold shrink-0 text-xs uppercase w-14" style={{ color: sevColor[a.severity] }}>{a.severity}</span>
          <span className="flex-1 truncate">{[a.ruleName, a.message].filter(Boolean).join(" — ")}</span>
          {typeof a.value === "number" && <span className="tabular-nums text-xs text-zinc-400 shrink-0">{a.value.toFixed(1)}</span>}
          {a.since !== undefined && <span className="text-xs text-zinc-600 shrink-0">{new Date(a.since).toLocaleTimeString()}</span>}
          {ack && a.active && !a.acked && (
            <button onClick={() => ack(a.id)}
              className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 shrink-0">ACK</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Renderer map ───────────────────────────────────────────────────────────

const renderers: { [K in WidgetType]: React.ComponentType<WP<K>> } = {
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
  pipe:           PipeWidget,
  shape:          ShapeWidget,
  alarmIndicator: AlarmIndicatorWidget,
  pageTitle:      PageTitleWidget,
  customWidget:   CustomWidgetView,
  pageList:       PageListWidget,
  clock:          ClockWidget,
  driverStatus:   DriverStatusWidget,
  userMenu:       UserMenuWidget,
  recipes:        RecipesWidget,
  table:          TableWidget,
};

/** The widget types this library draws. */
export const RENDERED_TYPES: readonly string[] = Object.keys(renderers);

function VisibilityGate({ w, children }: { w: Widget; children: React.ReactNode }) {
  const t = useTag(w.bindings?.visible);
  if (w.bindings?.visible && !t.value) return null;
  return <>{children}</>;
}

// ── Actions ────────────────────────────────────────────────────────────────

/** The value a toggle without on/off values writes: the opposite of the
 *  current one, as a bool for a bool tag and as 0/1 otherwise. */
export function toggled(cur: unknown): unknown {
  return typeof cur === "boolean" ? !cur : cur ? 0 : 1;
}

/** The write an action makes, given the current tag values, or undefined
 *  for an action that writes nothing (navigate, openUrl, or no tag). */
export function actionWrite(a: Action, w: Widget, values: Record<string, TagState>): WriteRequest | undefined {
  const tag = a.tag || w.bindings?.value;
  if (!tag) return undefined;
  const cur = values[tag]?.value;
  switch (a.type) {
    case "write":
      return { binding: tag, value: a.value, widgetId: w.id };
    case "toggle": {
      if (a.on === undefined && a.off === undefined) return { binding: tag, value: toggled(cur), widgetId: w.id };
      const isOn = !!cur;
      const value = isOn ? (a.off ?? 0) : (a.on ?? 1);
      return { binding: tag, value, label: `${isOn ? "OFF" : "ON"} (${String(value)})`, widgetId: w.id };
    }
    case "increment":
      return { binding: tag, value: (typeof cur === "number" ? cur : 0) + (a.step ?? 1), widgetId: w.id };
    default:
      return undefined;
  }
}

/** Every tag a widget's actions read or write. */
function actionTags(w: Widget): string[] {
  const out: string[] = [];
  for (const list of [w.events?.onClick, w.events?.onPress, w.events?.onRelease]) {
    for (const a of list ?? []) {
      const tag = a.tag || w.bindings?.value;
      if (tag && (a.type === "write" || a.type === "toggle" || a.type === "increment")) out.push(tag);
    }
  }
  return out;
}

// ── Driven properties and events ───────────────────────────────────────────

/** Properties the applicator itself acts on; every other driven property
 *  goes into the widget's props, where the frame and the widget read it. */
const APPLICATOR_PROPS = new Set(["visible", "disabled", "opacity", "rotate", "blink"]);

/** Applies a widget's driven properties and runs its events: onPress and
 *  onRelease write at once (momentary), onClick goes through requestWrite.
 *  children gets the widget with its driven settings in props. */
function DriveApplicator({ w, children }: { w: Widget; children: (w: Widget) => React.ReactNode }) {
  const host = useHost();
  const pressed = useRef(false);
  const driven = useDrives(w);
  const tags = useMemo(() => [...new Set(actionTags(w))], [w]);
  const tagVals = useTags(tags);

  const p = (w.props ?? {}) as FrameProps;
  const blinking = driven.blink === true;
  const [blinkOn, setBlinkOn] = useState(true);
  const half = (p.blinkPeriodMs ?? 800) / 2;
  useEffect(() => {
    if (!blinking) { setBlinkOn(true); return; }
    const iv = setInterval(() => setBlinkOn((v) => !v), half);
    return () => clearInterval(iv);
  }, [blinking, half]);

  const key = JSON.stringify(driven);
  const shown = useMemo(() => {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(driven)) if (!APPLICATOR_PROPS.has(k)) props[k] = v;
    return Object.keys(props).length ? ({ ...w, props: { ...w.props, ...props } } as Widget) : w;
  }, [w, key]); // eslint-disable-line react-hooks/exhaustive-deps -- key stands for driven

  const events = w.events;
  const run = useCallback((actions: Action[] | undefined, momentary: boolean) => {
    for (const a of actions ?? []) {
      if (a.type === "navigate" && a.page) host.navigate(a.page);
      else if (a.type === "openUrl" && a.url) window.open(a.url, "_blank", "noopener");
      else {
        const req = actionWrite(a, w, tagVals);
        if (req) (momentary ? host.write : host.requestWrite)(req);
      }
    }
  }, [w, tagVals, host]);
  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    run(events?.onRelease, true);
  };
  const hasClick = !!events?.onClick?.length;
  const hasPress = !!(events?.onPress?.length || events?.onRelease?.length);

  if (driven.visible === false) return null;
  const disabled = driven.disabled === true;
  const rotate = typeof driven.rotate === "number" ? driven.rotate : 0;
  const opacity = typeof driven.opacity === "number" ? Math.max(0, Math.min(1, driven.opacity)) : 1;
  // Blinking flashes the blink color when there is one, else fades the widget.
  const flash = blinking && blinkOn && p.blinkColor ? p.blinkColor : undefined;
  const faded = blinking && !blinkOn && !p.blinkColor;

  return (
    <div
      className="relative w-full h-full"
      style={{
        transform: rotate ? `rotate(${rotate.toFixed(1)}deg)` : undefined,
        opacity: faded ? 0 : opacity,
        pointerEvents: disabled ? "none" : undefined,
        cursor: (hasClick || hasPress) ? "pointer" : undefined,
        outline: flash ? `2px solid ${flash}` : undefined,
        outlineOffset: "-2px",
        borderRadius: "var(--radius, 0.5rem)",
        transition: "opacity 0.05s, outline-color 0.2s",
      }}
      onClick={hasClick ? () => run(events?.onClick, false) : undefined}
      onPointerDown={hasPress ? () => { pressed.current = true; run(events?.onPress, true); } : undefined}
      onPointerUp={hasPress ? release : undefined}
      onPointerLeave={hasPress ? release : undefined}
    >
      {disabled && <div className="absolute inset-0 z-10 bg-zinc-950/50 rounded-lg pointer-events-none" />}
      {children(shown)}
    </div>
  );
}

/** Draws the widget with its text in the language being shown. */
function Translated({ w, children }: { w: Widget; children: (w: Widget) => React.ReactNode }) {
  const translate = useHost().useTranslate();
  const shown = useMemo(() => translateWidget(w, translate), [w, translate]);
  return <>{children(shown)}</>;
}

export function WidgetRenderer({ w }: { w: Widget }) {
  const R = (renderers[w.type] as React.ComponentType<{ w: Widget }> | undefined) ?? (() => (
    <div className="flex items-center justify-center h-full text-zinc-500 text-xs">{w.type}</div>
  ));
  return (
    <VisibilityGate w={w}>
      <DriveApplicator w={w}>
        {(shown) => <Translated w={shown}>{(t) => <Frame w={t}><R w={t} /></Frame>}</Translated>}
      </DriveApplicator>
    </VisibilityGate>
  );
}
