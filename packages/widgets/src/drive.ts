// Driven properties: each is an expression, then an optional transform,
// then a check that the value suits the property. Anything that fails
// (an unknown result, a value of the wrong type) leaves the property's own
// setting, so a widget never shows a half-applied look.
import { useMemo } from "react";
import { compile, type Expr, type Input } from "@speths-screens/expr";
import type { Drive, Transform, Widget } from "@speths-screens/shared-types";
import { useTags, type TagState } from "./host";
import { tokenColor } from "./tokens";

export type DrivenValue = string | number | boolean;

const num = (v: DrivenValue) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : undefined);

// equal is the expression language's ==: no conversion between text and
// numbers, but true and false equal 1 and 0.
function equal(a: DrivenValue, b: DrivenValue): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return num(a) === num(b);
}

/** Applies a transform to an expression's value; undefined leaves the
 *  property's own setting. */
export function applyTransform(v: DrivenValue, t: Transform | undefined): DrivenValue | undefined {
  if (!t) return v;
  switch (t.kind) {
    case "linear": {
      const x = num(v);
      if (x === undefined || !t.in || !t.out) return undefined;
      const [i0, i1] = t.in as [number, number];
      const [o0, o1] = t.out as [number, number];
      if (i1 === i0) return o0;
      let f = (x - i0) / (i1 - i0);
      if (t.clamp !== false) f = Math.max(0, Math.min(1, f));
      return o0 + f * (o1 - o0);
    }
    case "thresholds": {
      const x = num(v);
      if (x === undefined) return undefined;
      // The step with the highest above that the value reaches.
      let best: { above: number; value: DrivenValue } | undefined;
      for (const s of t.steps ?? []) if (x >= s.above && (!best || s.above >= best.above)) best = s as typeof best;
      return best ? best.value : (t.below as DrivenValue | undefined);
    }
    case "map": {
      const hit = (t.cases ?? []).find((c) => equal(v, c.equals as DrivenValue));
      return hit ? (hit.value as DrivenValue) : (t.default as DrivenValue | undefined);
    }
  }
  return undefined;
}

type Kind = "flag" | "number" | "text" | "color";

/** What kind of value each drivable property takes. */
export const DRIVEN_KIND: Record<string, Kind> = {
  visible: "flag", disabled: "flag", blink: "flag",
  opacity: "number", rotate: "number", min: "number", max: "number", step: "number",
  label: "text", unit: "text", staticText: "text", trueLabel: "text", falseLabel: "text", src: "text",
  bgColor: "color", borderColor: "color", textColor: "color", trueColor: "color", falseColor: "color", btnColor: "color", stroke: "color",
};

/** The value for a property, or undefined when v does not suit it. Flags
 *  follow the expression language's truthiness; numbers and flags become
 *  text; a color must be non-empty text, and "token:alarm-critical" names
 *  a design token (an unknown token does not suit). */
export function suit(prop: string, v: DrivenValue): DrivenValue | undefined {
  switch (DRIVEN_KIND[prop]) {
    case "flag": return v !== false && v !== 0 && v !== "";
    case "number": return num(v);
    case "text": return typeof v === "string" ? v : String(v);
    case "color": return typeof v === "string" && v !== "" ? tokenColor(v) : undefined;
  }
  return v;
}

/** One driven property's value from its compiled expression, or undefined. */
export function driveValue(prop: string, e: Expr, transform: Transform | undefined, env: Parameters<Expr["eval"]>[0]): DrivenValue | undefined {
  const r = e.eval(env);
  if (!r.ok) return undefined;
  const t = applyTransform(r.value, transform);
  return t === undefined ? undefined : suit(prop, t);
}

const NO_DRIVES: Record<string, Drive> = {};

function input(s: TagState | undefined): Input | undefined {
  if (!s || (s.quality === "Unknown" && (s.value === null || s.value === undefined))) return undefined;
  return { value: s.value, quality: s.quality };
}

/** The values of a widget's driven properties that apply right now. */
export function useDrives(w: Widget): Record<string, DrivenValue> {
  const dynamics = w.dynamics ?? NO_DRIVES;
  const compiled = useMemo(() => Object.entries(dynamics).flatMap(([prop, d]) => {
    const c = compile(d.expr);
    return c.ok ? [{ prop, expr: c.expr, transform: d.transform }] : [];
  }), [dynamics]);
  const valueTag = w.bindings?.value;
  const paths = useMemo(() => [...new Set(compiled.flatMap((c) =>
    [...c.expr.refs, ...(c.expr.usesValue && valueTag ? [valueTag] : [])]))], [compiled, valueTag]);
  const vals = useTags(paths);
  const out: Record<string, DrivenValue> = {};
  const env = { tag: (ref: string) => input(vals[ref]), value: () => (valueTag ? input(vals[valueTag]) : undefined) };
  for (const c of compiled) {
    const v = driveValue(c.prop, c.expr, c.transform, env);
    if (v !== undefined) out[c.prop] = v;
  }
  return out;
}

/** Fills a faceplate's parameters ({name}) into an expression: each becomes
 *  the instance's tag reference. Unknown names are left as they are. */
export function rewriteExpr(src: string, params: Record<string, string>): string {
  return src.replace(/\{(\w+)\}/g, (m, key: string) => (params[key] !== undefined ? `{${params[key]}}` : m));
}
