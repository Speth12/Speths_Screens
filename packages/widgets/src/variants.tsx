// The other ways a gauge, a tank, a number and a state light can be drawn (their `variant` setting).
// Each is a drawing only: the widget works out the value, the fraction and the color and hands them
// in, so a variant never reads a tag itself. Colors come from the theme's custom properties, and go
// in `style`, never in SVG attributes, which cannot hold var().
import { useEffect, useId, useRef, useState } from "react";
import type { PageIcon } from "@speths-screens/shared-types";
import { Icon } from "./icons";

const track = "var(--secondary)";
const muted = "var(--muted-foreground)";
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Black or white, whichever reads on a #rgb or #rrggbb color; white for anything else. */
export function readableOn(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "#ffffff";
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.6 ? "#111111" : "#ffffff";
}

/** The last values a widget has shown since it was drawn (at most `keep`), for a small history line
 *  and a rising or falling arrow. It is the screen's own memory, not the historian's. */
export function useRecent(value: unknown, keep = 60): number[] {
  const ref = useRef<number[]>([]);
  const [, bump] = useState(0);
  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    ref.current = [...ref.current, value].slice(-keep);
    bump((n) => n + 1);
  }, [value, keep]);
  return ref.current;
}

// ── Gauge ──────────────────────────────────────────────────────────────────

export type GaugeVariantName = "ring" | "half" | "dial" | "bar" | "vbar" | "segments";
export interface GaugeDrawing {
  variant: GaugeVariantName;
  /** How full, 0 to 1. */
  pct: number;
  /** The value as text, with its unit; none draws the gauge alone. */
  text?: string;
  min: number; max: number;
  color: string;
  showTicks?: boolean;
}

const valueText = (size: string): React.CSSProperties => ({ color: "var(--foreground)", fontSize: size });
const valueCls = "font-semibold tabular-nums leading-none whitespace-nowrap";

function Ends({ min, max }: { min: number; max: number }) {
  return <div className="flex justify-between text-xs tabular-nums" style={{ color: muted }}><span>{min}</span><span>{max}</span></div>;
}

export function GaugeVariant({ variant, pct, text, min, max, color, showTicks }: GaugeDrawing) {
  const f = clamp01(pct);
  const ticks = showTicks !== false;
  // With no value and no end values the bar is the whole element and fills its place.
  const alone = !text && !ticks;
  if (variant === "ring") {
    return (
      <div data-variant="ring" className="relative w-full h-full" style={{ containerType: "size" }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="41" fill="none" strokeWidth="9" style={{ stroke: track }} />
          <circle cx="50" cy="50" r="41" fill="none" strokeWidth="9" strokeLinecap="round" pathLength={100}
            strokeDasharray={`${(f * 100).toFixed(2)} 100`} style={{ stroke: color, transition: "stroke-dasharray 0.3s ease-out", opacity: f > 0.004 ? 1 : 0 }} />
        </svg>
        {text && <div className={`absolute inset-0 flex items-center justify-center ${valueCls}`} style={valueText("clamp(0.875rem, 17cqmin, 2.5rem)")}>{text}</div>}
      </div>
    );
  }
  if (variant === "half") {
    return (
      <div data-variant="half" className="relative w-full h-full" style={{ containerType: "size" }}>
        <svg viewBox="0 0 100 58" className="absolute inset-0 w-full h-full">
          <path d="M 9 52 A 41 41 0 0 1 91 52" fill="none" strokeWidth="9" strokeLinecap="round" style={{ stroke: track }} />
          <path d="M 9 52 A 41 41 0 0 1 91 52" fill="none" strokeWidth="9" strokeLinecap="round" pathLength={100}
            strokeDasharray={`${(f * 100).toFixed(2)} 100`} style={{ stroke: color, transition: "stroke-dasharray 0.3s ease-out", opacity: f > 0.004 ? 1 : 0 }} />
          {ticks && <text x="9" y="57.5" textAnchor="middle" fontSize="5" style={{ fill: muted }}>{min}</text>}
          {ticks && <text x="91" y="57.5" textAnchor="middle" fontSize="5" style={{ fill: muted }}>{max}</text>}
        </svg>
        {text && <div className={`absolute left-0 right-0 text-center ${valueCls}`} style={{ ...valueText("clamp(0.875rem, 15cqmin, 2.25rem)"), bottom: "12%" }}>{text}</div>}
      </div>
    );
  }
  if (variant === "dial") {
    const marks = Array.from({ length: 11 }, (_, i) => i / 10);
    return (
      <div data-variant="dial" className="relative w-full h-full" style={{ containerType: "size" }}>
        <svg viewBox="0 0 100 66" className="absolute inset-0 w-full h-full">
          <path d="M 8 52 A 42 42 0 0 1 92 52" fill="none" strokeWidth="1.5" style={{ stroke: muted }} />
          {ticks && marks.map((q) => {
            const a = Math.PI * (1 - q), major = Math.round(q * 10) % 5 === 0;
            const r1 = 42, r2 = major ? 34 : 38;
            return <line key={q} x1={50 + r1 * Math.cos(a)} y1={52 - r1 * Math.sin(a)} x2={50 + r2 * Math.cos(a)} y2={52 - r2 * Math.sin(a)} strokeWidth={major ? 1.6 : 0.8} style={{ stroke: muted }} />;
          })}
          {ticks && <text x="16" y="50" fontSize="5" style={{ fill: muted }}>{min}</text>}
          {ticks && <text x="84" y="50" fontSize="5" textAnchor="end" style={{ fill: muted }}>{max}</text>}
          <g style={{ transform: `rotate(${-90 + f * 180}deg)`, transformOrigin: "50px 52px", transition: "transform 0.3s ease-out" }}>
            <path d="M 48.6 52 L 50 14 L 51.4 52 Z" style={{ fill: color }} />
          </g>
          <circle cx="50" cy="52" r="4" style={{ fill: "var(--foreground)" }} />
        </svg>
        {text && <div className={`absolute left-0 right-0 bottom-0 text-center ${valueCls}`} style={valueText("clamp(0.75rem, 11cqmin, 1.75rem)")}>{text}</div>}
      </div>
    );
  }
  if (variant === "vbar") {
    return (
      <div data-variant="vbar" className="flex h-full items-stretch gap-3">
        <div className={`relative rounded-full overflow-hidden ${text || ticks ? "w-5 shrink-0" : "w-full"}`} style={{ background: track }}>
          <div className="absolute left-0 right-0 bottom-0 rounded-full" style={{ height: `${f * 100}%`, background: color, transition: "height 0.3s ease-out" }} />
        </div>
        {ticks && <div className="flex flex-col justify-between text-xs tabular-nums" style={{ color: muted }}><span>{max}</span><span>{min}</span></div>}
        {text && <div className={`flex items-center text-2xl ${valueCls}`} style={{ color: "var(--foreground)" }}>{text}</div>}
      </div>
    );
  }
  if (variant === "segments") {
    const count = 12, lit = Math.round(f * count);
    return (
      <div data-variant="segments" className="flex flex-col h-full justify-center gap-2">
        {text && <div className={`text-2xl ${valueCls}`} style={{ color: "var(--foreground)" }}>{text}</div>}
        <div className={`flex gap-[3px] ${alone ? "h-full" : "h-4"}`}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} data-lit={i < lit || undefined} className="flex-1 rounded-[2px]" style={{ background: i < lit ? color : track, transition: "background 0.2s" }} />
          ))}
        </div>
        {ticks && <Ends min={min} max={max} />}
      </div>
    );
  }
  return (
    <div data-variant="bar" className="flex flex-col h-full justify-center gap-2">
      {text && <div className={`text-2xl ${valueCls}`} style={{ color: "var(--foreground)" }}>{text}</div>}
      <div className={`relative rounded-full overflow-hidden ${alone ? "h-full" : "h-3"}`} style={{ background: track }}>
        <div className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${f * 100}%`, background: color, transition: "width 0.3s ease-out" }} />
      </div>
      {ticks && <Ends min={min} max={max} />}
    </div>
  );
}

// ── Tank ───────────────────────────────────────────────────────────────────

export type TankVariantName = "cylinder" | "silo" | "vessel" | "bottle" | "level";

// Each shape in its own box; the liquid is a rectangle cut to the shape.
const TANK_SHAPES: Record<Exclude<TankVariantName, "level">, { w: number; h: number; d: string }> = {
  cylinder: { w: 60, h: 100, d: "M 4 14 Q 30 0 56 14 V 86 Q 30 100 4 86 Z" },
  silo: { w: 60, h: 100, d: "M 5 4 H 55 V 60 L 37 97 H 23 L 5 60 Z" },
  bottle: { w: 60, h: 100, d: "M 22 3 H 38 V 20 Q 55 28 55 46 V 91 Q 55 97 49 97 H 11 Q 5 97 5 91 V 46 Q 5 28 22 20 Z" },
  vessel: { w: 100, h: 60, d: "M 28 4 H 72 A 26 26 0 0 1 72 56 H 28 A 26 26 0 0 1 28 4 Z" },
};

const WAVE_CSS = "@keyframes ss-wave { to { transform: translateX(40px); } } @media (prefers-reduced-motion: reduce) { [data-ss-motion] { animation: none !important; } }";

export interface TankDrawing {
  variant: TankVariantName;
  /** How full, 0 to 1. */
  pct: number;
  color: string;
  min: number; max: number;
  showScale?: boolean;
  wave?: boolean;
  /** The value, unit and quality, drawn beside (or over) the tank; none draws the tank alone. */
  children?: React.ReactNode;
}

export function TankVariant({ variant, pct, color, min, max, showScale, wave, children }: TankDrawing) {
  const f = clamp01(pct);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (variant === "level") {
    return (
      <div data-variant="level" className="relative h-full w-full overflow-hidden rounded" style={{ background: track }}>
        <div className="absolute left-0 right-0 bottom-0" style={{ height: `${f * 100}%`, background: color, opacity: 0.85, transition: "height 0.5s" }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ textShadow: "0 1px 2px var(--card)" }}>{children}</div>
      </div>
    );
  }
  const s = TANK_SHAPES[variant];
  const top = s.h * (1 - f);
  const quarters = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div data-variant={variant} className={`flex gap-3 h-full items-end ${children ? "" : "justify-center"}`}>
      {wave && <style>{WAVE_CSS}</style>}
      <svg viewBox={`0 0 ${s.w} ${s.h}`} className="h-full shrink min-w-0" style={{ aspectRatio: `${s.w} / ${s.h}`, maxWidth: children ? "60%" : "100%" }}>
        <defs><clipPath id={`tank-${id}`}><path d={s.d} /></clipPath></defs>
        <path d={s.d} style={{ fill: track }} />
        <g clipPath={`url(#tank-${id})`}>
          <rect x="0" width={s.w} y={top} height={s.h - top} style={{ fill: color, opacity: 0.85, transition: "y 0.5s, height 0.5s" }} />
          {wave && f > 0.01 && f < 0.995 && (
            <path data-ss-motion d={`M -40 ${top} q 10 -3.5 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 V ${top + 4} H -40 Z`}
              style={{ fill: color, animation: "ss-wave 2.4s linear infinite", transition: "d 0.5s" }} />
          )}
          {showScale && quarters.slice(1, 4).map((q) => <line key={q} x1="0" x2={s.w} y1={s.h * (1 - q)} y2={s.h * (1 - q)} strokeWidth="0.6" strokeDasharray="2 2" style={{ stroke: "var(--foreground)", opacity: 0.35 }} />)}
        </g>
        <path d={s.d} fill="none" strokeWidth="1.5" strokeLinejoin="round" style={{ stroke: muted }} />
      </svg>
      {showScale && (
        <div className="flex flex-col-reverse justify-between h-full text-xs tabular-nums leading-none" style={{ color: muted }}>
          {quarters.map((q) => <span key={q}>{Math.round((min + (max - min) * q) * 100) / 100}</span>)}
        </div>
      )}
      {children && <div className="flex flex-col justify-end pb-1 min-w-0">{children}</div>}
    </div>
  );
}

// ── Number ─────────────────────────────────────────────────────────────────

/** A small line of the values shown since the screen was drawn. */
export function Sparkline({ values, color = "var(--primary)", fill }: { values: number[]; color?: string; fill?: boolean }) {
  const box = fill ? "w-full h-full" : "w-full h-6 mt-1";
  if (values.length < 2) return <div data-variant="sparkline" className={box} />;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(22 - ((v - lo) / span) * 20).toFixed(1)}`).join(" ");
  return (
    <svg data-variant="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" className={box}>
      <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ stroke: color }} />
    </svg>
  );
}

/** A bar from the lowest to the highest value with the value's place on it. */
export function RangeBar({ pct, min, max, color = "var(--primary)" }: { pct: number; min: number; max: number; color?: string }) {
  return (
    <div data-variant="range" className="mt-2">
      <div className="relative h-1.5 rounded-full" style={{ background: track }}>
        <div className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${clamp01(pct) * 100}%`, background: color, transition: "width 0.3s ease-out" }} />
      </div>
      <Ends min={min} max={max} />
    </div>
  );
}

/** Whether the values are rising, falling or steady: the newest against the one `back` values ago,
 *  steady within a hundredth of the span seen. */
export function direction(values: number[], back = 8): "up" | "down" | "steady" {
  if (values.length < 2) return "steady";
  const now = values[values.length - 1]!, then = values[Math.max(0, values.length - 1 - back)]!;
  const span = Math.max(...values) - Math.min(...values);
  if (Math.abs(now - then) <= span * 0.01) return "steady";
  return now > then ? "up" : "down";
}

export function TrendArrow({ values }: { values: number[] }) {
  const d = direction(values);
  const path = d === "up" ? "M 4 15 L 12 6 L 20 15 Z" : d === "down" ? "M 4 8 L 12 17 L 20 8 Z" : "M 4 10 H 20 V 13 H 4 Z";
  return (
    <svg data-variant="trend" data-direction={d} role="img" aria-label={d === "up" ? "rising" : d === "down" ? "falling" : "steady"} viewBox="0 0 24 24" className="inline-block ml-2 align-baseline" style={{ width: "0.6em", height: "0.6em" }}>
      <path d={path} style={{ fill: muted }} />
    </svg>
  );
}

// Seven segments: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle.
const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg", "-": "g", " ": "",
};
const SEGMENT_PATHS: Record<string, string> = {
  a: "M 3 1 H 11 L 9.5 3 H 4.5 Z", b: "M 12 2 V 10 L 10 9 V 4 Z", c: "M 12 12 V 20 L 10 18 V 13 Z",
  d: "M 3 21 H 11 L 9.5 19 H 4.5 Z", e: "M 2 12 V 20 L 4 18 V 13 Z", f: "M 2 2 V 10 L 4 9 V 4 Z", g: "M 3.5 11 L 4.5 10 H 9.5 L 10.5 11 L 9.5 12 H 4.5 Z",
};

/** A number as seven-segment digits; the unlit segments show faintly, as on a real display. */
export function SegmentDigits({ text, color = "var(--foreground)" }: { text: string; color?: string }) {
  const chars = [...text].filter((c) => c in SEGMENTS || c === ".");
  return (
    <span data-variant="segment" role="img" aria-label={text} className="inline-flex items-end" style={{ height: "1em", gap: "0.08em" }}>
      {chars.map((c, i) => c === "." ? (
        <svg key={i} viewBox="0 0 4 22" style={{ height: "1em" }}><circle cx="2" cy="20" r="1.4" style={{ fill: color }} /></svg>
      ) : (
        <svg key={i} viewBox="0 0 14 22" style={{ height: "1em" }}>
          {Object.entries(SEGMENT_PATHS).map(([seg, d]) => <path key={seg} d={d} strokeWidth="1" strokeLinejoin="round" style={{ fill: color, stroke: color, opacity: SEGMENTS[c]!.includes(seg) ? 1 : 0.06 }} />)}
        </svg>
      ))}
    </span>
  );
}

// ── State light ────────────────────────────────────────────────────────────

export type LedVariantName = "pill" | "tile" | "lamp" | "icon" | "ring";
export interface LedDrawing { variant: LedVariantName; on: boolean; color: string;
  /** The state as text; none draws the light alone, as large as its place. */
  label?: string; icon?: PageIcon }

/** A light's size: small beside its text, or as large as its place when it is alone. */
export const lightBox = (alone: boolean, small: string) => (alone ? "h-full aspect-square max-w-full" : small);

export function LedVariant({ variant, on, color, label, icon }: LedDrawing) {
  const alone = !label;
  const text = label ? <span className="text-sm font-medium">{label}</span> : null;
  if (variant === "pill") {
    return (
      <div data-variant="pill" className="flex items-center h-full">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: color, color: readableOn(color) }}>
          <span className="w-2 h-2 rounded-full" style={{ background: "currentColor", opacity: on ? 1 : 0.5 }} />{label}
        </span>
      </div>
    );
  }
  if (variant === "tile") {
    return (
      <div data-variant="tile" className="flex items-center justify-center h-full w-full rounded text-base font-semibold" style={{ background: color, color: readableOn(color), transition: "background 0.2s" }}>{label}</div>
    );
  }
  if (variant === "lamp") {
    return (
      <div data-variant="lamp" className="flex items-center gap-2 h-full">
        <div className={`${lightBox(alone, "w-7 h-7")} rounded-[3px]`} style={{ background: color, border: "2px solid color-mix(in srgb, var(--foreground) 35%, transparent)", boxShadow: on ? `0 0 10px ${color}` : "inset 0 0 6px rgba(0,0,0,.35)" }} />
        {text}
      </div>
    );
  }
  if (variant === "ring") {
    return (
      <div data-variant="ring" className="flex items-center gap-2 h-full">
        <div className={`${lightBox(alone, "w-6 h-6")} rounded-full`} style={{ border: `3px solid ${color}`, background: on ? color : "transparent", transition: "background 0.2s" }} />
        {text}
      </div>
    );
  }
  return (
    <div data-variant="icon" className="flex items-center gap-2 h-full" >
      <span className={alone ? "h-full aspect-square [&>svg]:w-full [&>svg]:h-full" : ""} style={{ color, opacity: on ? 1 : 0.7 }}><Icon name={icon ?? "bolt"} size={28} /></span>
      {text}
    </div>
  );
}
