// The other ways the controls can be drawn: a toggle as a switch, a rocker, a checkbox or two
// segments; a setpoint as a thick slider, a knob or a stepper; a multi-state as a label, a pill, a
// row of steps or an icon. Like variants.tsx these are drawings: the widget hands in the state and a
// function to call with a new value, and decides itself what a write is.
import { useRef, useState } from "react";
import type { PageIcon, StateEntry } from "@speths-screens/shared-types";
import { Icon } from "./icons";
import { readableOn } from "./variants";

const track = "var(--secondary)";
const muted = "var(--muted-foreground)";
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── Toggle ─────────────────────────────────────────────────────────────────

export type ToggleStyleName = "switch" | "rocker" | "checkbox" | "segments";
export interface ToggleDrawing {
  style: ToggleStyleName;
  on: boolean;
  /** The color of the side that is current, as CSS. */
  color: string;
  label?: string;
  onLabel?: string; offLabel?: string;
}

/** A toggle drawn as something other than a button. The click is the widget's own (its events). */
export function ToggleVisual({ style, on, color, label, onLabel = "ON", offLabel = "OFF" }: ToggleDrawing) {
  const text = label ? <span className="text-sm font-medium min-w-0 truncate">{label}</span> : null;
  if (style === "switch") {
    return (
      <div data-toggle="switch" role="switch" aria-checked={on} className="flex items-center gap-2.5 h-full w-full cursor-pointer">
        <span className="relative shrink-0 rounded-full" style={{ width: "2.75rem", height: "1.5rem", background: on ? color : track, transition: "background 0.15s" }}>
          <span className="absolute rounded-full" style={{ top: 2, left: on ? "calc(100% - 1.25rem - 2px)" : 2, width: "1.25rem", height: "1.25rem", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.4)", transition: "left 0.15s" }} />
        </span>
        {text}
      </div>
    );
  }
  if (style === "checkbox") {
    return (
      <div data-toggle="checkbox" role="checkbox" aria-checked={on} className="flex items-center gap-2.5 h-full w-full cursor-pointer">
        <span className="shrink-0 inline-flex items-center justify-center rounded-[4px]" style={{ width: "1.4rem", height: "1.4rem", background: on ? color : "transparent", border: `2px solid ${on ? color : muted}`, color: readableOn(color) }}>
          {on && <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 L6.5 12 L13 4.5" /></svg>}
        </span>
        {text}
      </div>
    );
  }
  if (style === "rocker") {
    // The side that is down is the current one.
    const side = (current: boolean): React.CSSProperties => ({
      background: current ? color : track, color: current ? readableOn(color) : muted,
      boxShadow: current ? "inset 0 3px 6px rgba(0,0,0,.35)" : "inset 0 -3px 0 rgba(0,0,0,.18)",
      transform: current ? "translateY(1px)" : undefined, transition: "background 0.15s",
    });
    return (
      <div data-toggle="rocker" role="switch" aria-checked={on} aria-label={label} className="flex h-full w-full cursor-pointer overflow-hidden rounded-md text-sm font-semibold" style={{ border: `1px solid ${muted}` }}>
        <span className="flex-1 flex items-center justify-center" style={side(!on)}>{offLabel}</span>
        <span className="flex-1 flex items-center justify-center" style={side(on)}>{onLabel}</span>
      </div>
    );
  }
  return (
    <div data-toggle="segments" role="switch" aria-checked={on} aria-label={label} className="flex h-full w-full cursor-pointer rounded-md p-[3px] gap-[3px] text-sm font-semibold" style={{ background: track }}>
      {[false, true].map((state) => (
        <span key={String(state)} data-current={state === on || undefined} className="flex-1 flex items-center justify-center rounded-[5px]"
          style={state === on ? { background: color, color: readableOn(color), boxShadow: "0 1px 2px rgba(0,0,0,.25)" } : { color: muted }}>
          {state ? onLabel : offLabel}
        </span>
      ))}
    </div>
  );
}

// ── Setpoint ───────────────────────────────────────────────────────────────

/** The value a step up or down gives, held inside the range and on the step's own decimals. */
export function stepValue(value: number, by: number, min: number, max: number): number {
  const decimals = (String(Math.abs(by)).split(".")[1] ?? "").length;
  return clamp(Number((value + by).toFixed(decimals)), min, max);
}

export interface SetpointDrawing {
  value: number; min: number; max: number; step: number;
  /** The value as text with its unit; none draws the control alone. */
  text?: string;
  /** While dragging: the value so far. */
  onDraft?: (n: number) => void;
  /** The value chosen: the widget writes it. */
  onCommit: (n: number) => void;
}

/** Minus and plus, a step at a time. */
export function Stepper({ value, min, max, step, text, onCommit }: SetpointDrawing) {
  const btn = "shrink-0 h-full aspect-square max-h-14 rounded-md text-xl font-semibold flex items-center justify-center active:scale-95 disabled:opacity-40";
  const look: React.CSSProperties = { background: track, color: "var(--foreground)", border: "1px solid var(--border)" };
  return (
    <div data-setpoint="stepper" className="flex items-center gap-2 h-full w-full">
      <button type="button" aria-label="Less" disabled={value <= min} className={btn} style={look} onClick={(e) => { e.stopPropagation(); onCommit(stepValue(value, -step, min, max)); }}>−</button>
      <div className="flex-1 min-w-0 text-center text-2xl font-semibold tabular-nums truncate">{text}</div>
      <button type="button" aria-label="More" disabled={value >= max} className={btn} style={look} onClick={(e) => { e.stopPropagation(); onCommit(stepValue(value, step, min, max)); }}>+</button>
    </div>
  );
}

const KNOB_START = 225, KNOB_SWEEP = 270; // degrees clockwise from the top, like the gauge

/** The value a pointer at (dx, dy) from the knob's middle points at; outside the sweep it goes to the nearer end. */
export function knobValue(dx: number, dy: number, min: number, max: number, step: number): number {
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 at the top, clockwise
  if (deg < 0) deg += 360;
  let along = (deg - KNOB_START + 360) % 360;
  if (along > KNOB_SWEEP) along = along - KNOB_SWEEP < (360 - KNOB_SWEEP) / 2 ? KNOB_SWEEP : 0;
  const raw = min + (along / KNOB_SWEEP) * (max - min);
  const decimals = (String(step).split(".")[1] ?? "").length;
  return clamp(Number((Math.round(raw / step) * step).toFixed(decimals)), min, max);
}

/** A rotary knob: drag around it, or use the arrow keys. */
export function Knob({ value, min, max, step, text, onDraft, onCommit }: SetpointDrawing) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const f = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return knobValue(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), min, max, step);
  };
  const polar = (deg: number, r: number) => { const a = ((deg - 90) * Math.PI) / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const; };
  const arc = (sweep: number) => {
    const s = clamp(sweep, 0.01, KNOB_SWEEP - 0.01);
    const [x0, y0] = polar(KNOB_START, 44), [x1, y1] = polar(KNOB_START + s, 44);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 44 44 0 ${s > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  return (
    <div data-setpoint="knob" className="relative h-full w-full" style={{ containerType: "size" }}>
      <svg ref={ref} viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ touchAction: "none", cursor: "grab", outline: "none" }}
        role="slider" tabIndex={0} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); setDragging(true); onDraft?.(at(e)); }}
        onPointerMove={(e) => { if (dragging) onDraft?.(at(e)); }}
        onPointerUp={(e) => { if (!dragging) return; setDragging(false); onCommit(at(e)); }}
        onKeyDown={(e) => {
          const by = e.key === "ArrowUp" || e.key === "ArrowRight" ? step : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -step : 0;
          if (by) { e.preventDefault(); onCommit(stepValue(value, by, min, max)); }
        }}>
        <path d={arc(KNOB_SWEEP)} fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: track }} />
        {f > 0.003 && <path d={arc(f * KNOB_SWEEP)} fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--primary)" }} />}
        <circle cx="50" cy="50" r="33" style={{ fill: "var(--card)", stroke: "var(--border)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }} strokeWidth="1.5" />
        <g style={{ transform: `rotate(${KNOB_START + f * KNOB_SWEEP}deg)`, transformOrigin: "50px 50px", transition: dragging ? undefined : "transform 0.2s" }}>
          <line x1="50" y1="22" x2="50" y2="34" strokeWidth="4" strokeLinecap="round" style={{ stroke: "var(--primary)" }} />
        </g>
      </svg>
      {text && <div className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums leading-none pointer-events-none" style={{ fontSize: "clamp(0.7rem, 13cqmin, 1.75rem)", color: "var(--foreground)" }}>{text}</div>}
    </div>
  );
}

/** The look of a thick slider for a finger: the browser's own range input, restyled. */
export const FAT_SLIDER_CSS = `
.ss-fat { -webkit-appearance: none; appearance: none; width: 100%; height: 1.75rem; background: transparent; cursor: pointer; }
.ss-fat::-webkit-slider-runnable-track { height: 0.9rem; border-radius: 999px; background: var(--secondary); }
.ss-fat::-moz-range-track { height: 0.9rem; border-radius: 999px; background: var(--secondary); }
.ss-fat::-webkit-slider-thumb { -webkit-appearance: none; width: 1.75rem; height: 1.75rem; margin-top: -0.425rem; border-radius: 999px; background: var(--primary); border: 3px solid var(--card); box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.ss-fat::-moz-range-thumb { width: 1.4rem; height: 1.4rem; border-radius: 999px; background: var(--primary); border: 3px solid var(--card); box-shadow: 0 1px 4px rgba(0,0,0,.4); }`;

// ── Multi-state ────────────────────────────────────────────────────────────

export type MultiStateVariantName = "label" | "pill" | "stepper" | "icon";

export function MultiStateVariant({ variant, states, current, text }: { variant: MultiStateVariantName; states: StateEntry[]; current: StateEntry | undefined; text: string }) {
  const color = current?.color ?? muted;
  if (variant === "label") {
    return <div data-variant="label" className="flex items-center h-full w-full text-lg font-bold" style={{ color: current ? color : muted }}>{text}</div>;
  }
  if (variant === "pill") {
    return (
      <div data-variant="pill" className="flex items-center h-full w-full">
        <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold" style={{ background: current?.color ?? track, color: current?.textColor ?? (current?.color ? readableOn(current.color) : muted) }}>{text}</span>
      </div>
    );
  }
  if (variant === "icon") {
    return (
      <div data-variant="icon" className="flex items-center gap-2 h-full w-full">
        <span style={{ color }}><Icon name={current?.icon as PageIcon | undefined} label={text} size={28} /></span>
        <span className="text-sm font-semibold">{text}</span>
      </div>
    );
  }
  // Every state in a row, the current one filled in its color.
  return (
    <div data-variant="stepper" className="flex h-full w-full items-stretch gap-[3px] text-xs font-semibold">
      {states.map((s, i) => {
        const here = s === current;
        return (
          <span key={i} data-current={here || undefined} className="flex-1 min-w-0 flex items-center justify-center rounded-[4px] px-1 text-center leading-tight"
            style={here ? { background: s.color ?? "var(--primary)", color: s.textColor ?? (s.color ? readableOn(s.color) : "var(--primary-foreground)") } : { background: track, color: muted }}>
            <span className="truncate">{s.label ?? String(s.value)}</span>
          </span>
        );
      })}
    </div>
  );
}
