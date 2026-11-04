// Expression tree and the value rules. Mirrors internal/expr/expr.go.
import type { Func } from "./funcs";

/** A result value. */
export type Value = number | boolean | string;

/** A tag value with its quality ("Good", "Uncertain" or "Bad"). Good and
 *  Uncertain values are used; Bad ones make the result unknown. */
export interface Input { value: unknown; quality: string }

/** Supplies tag values. tag looks up a reference as written between the
 *  braces ("ns:Tank1/Level"); value is the widget's own tag and is missing
 *  where there is none (calculated tags, alarms). */
export interface Env {
  tag?: (ref: string) => Input | undefined;
  value?: () => Input | undefined;
}

/** An unknown result and why. */
export class Unknown {
  constructor(readonly reason: string) {}
}

export type Out = Value | Unknown;

export interface Node { eval(env: Env): Out }

export class LitNode implements Node {
  constructor(private readonly v: Value) {}
  eval(): Out { return this.v; }
}

export class RefNode implements Node {
  constructor(readonly key: string, readonly isValue: boolean) {}

  private name(): string { return this.isValue ? "input value" : `input {${this.key}}`; }

  // lookup returns the input, or why there is none.
  private lookup(env: Env): Input | Unknown {
    if (this.isValue) {
      if (!env.value) return new Unknown("no widget value here");
      return env.value() ?? new Unknown("input value has no value");
    }
    return env.tag?.(this.key) ?? new Unknown(`${this.name()} has no value`);
  }

  eval(env: Env): Out {
    const inp = this.lookup(env);
    if (inp instanceof Unknown) return inp;
    if (inp.quality === "Bad") return new Unknown(`${this.name()} is Bad`);
    const v = inp.value;
    if (v === null || v === undefined) return new Unknown(`${this.name()} has no value`);
    if (typeof v === "number") return isFinite(v) ? v : new Unknown(`${this.name()} is not a finite number`);
    if (typeof v === "boolean" || typeof v === "string") return v;
    return new Unknown(`${this.name()} has an unsupported value`);
  }

  /** Whether the input is there and Good. */
  good(env: Env): boolean {
    const inp = this.lookup(env);
    return !(inp instanceof Unknown) && inp.quality === "Good" && inp.value !== null && inp.value !== undefined;
  }
}

export class UnaryNode implements Node {
  constructor(private readonly op: string, private readonly x: Node) {}
  eval(env: Env): Out {
    const v = this.x.eval(env);
    if (v instanceof Unknown) return v;
    if (this.op === "!") return !truthy(v);
    const f = num(v);
    return f === undefined ? new Unknown(`- needs a number, got ${typeName(v)}`) : -f;
  }
}

export class LogicNode implements Node {
  constructor(private readonly or: boolean, private readonly l: Node, private readonly r: Node) {}
  eval(env: Env): Out {
    const l = this.l.eval(env);
    if (l instanceof Unknown) return l;
    if (truthy(l) === this.or) return this.or;
    const r = this.r.eval(env);
    return r instanceof Unknown ? r : truthy(r);
  }
}

export class CondNode implements Node {
  constructor(private readonly c: Node, private readonly a: Node, private readonly b: Node) {}
  eval(env: Env): Out {
    const c = this.c.eval(env);
    if (c instanceof Unknown) return c;
    return truthy(c) ? this.a.eval(env) : this.b.eval(env);
  }
}

export class BinNode implements Node {
  constructor(private readonly op: string, private readonly l: Node, private readonly r: Node) {}
  eval(env: Env): Out {
    const l = this.l.eval(env);
    if (l instanceof Unknown) return l;
    const r = this.r.eval(env);
    if (r instanceof Unknown) return r;
    switch (this.op) {
      case "==": return equal(l, r);
      case "!=": return !equal(l, r);
      case "<": case "<=": case ">": case ">=": {
        const c = compare(l, r);
        if (c instanceof Unknown) return c;
        if (this.op === "<") return c < 0;
        if (this.op === "<=") return c <= 0;
        if (this.op === ">") return c > 0;
        return c >= 0;
      }
      case "+":
        if (typeof l === "string" || typeof r === "string") return toString(l) + toString(r);
    }
    const a = num(l), b = num(r);
    if (a === undefined || b === undefined) return new Unknown(`${this.op} needs numbers, got ${typeName(a === undefined ? l : r)}`);
    switch (this.op) {
      case "+": return finite(a + b);
      case "-": return finite(a - b);
      case "*": return finite(a * b);
    }
    if (b === 0) return new Unknown("division by zero");
    return finite(this.op === "/" ? a / b : a % b);
  }
}

export class CallNode implements Node {
  constructor(private readonly name: string, private readonly fn: Func, private readonly args: Node[]) {}
  eval(env: Env): Out {
    if (this.fn.tag) return (this.args[0] as RefNode).good(env);
    const vals: Value[] = [];
    for (const a of this.args) {
      const v = a.eval(env);
      if (v instanceof Unknown) return v;
      vals.push(v);
    }
    return this.fn.eval!(this.name, vals);
  }
}

// ── value rules ─────────────────────────────────────────────────────────────

/** Reads a number; booleans count as 0 and 1, because PLC BOOLs arrive as either. */
export function num(v: Value): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return undefined;
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v !== "";
}

export function typeName(v: Value): string {
  return typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string";
}

// equal never converts between strings and numbers.
function equal(l: Value, r: Value): boolean {
  if (typeof l === "string" || typeof r === "string") return l === r;
  return num(l) === num(r);
}

// compare orders two numbers (booleans count) or two strings by code
// point, as Go does (JavaScript's < compares UTF-16 units).
function compare(l: Value, r: Value): number | Unknown {
  if (typeof l === "string" && typeof r === "string") {
    const a = Array.from(l), b = Array.from(r);
    for (let i = 0; i < a.length && i < b.length; i++) {
      const d = a[i]!.codePointAt(0)! - b[i]!.codePointAt(0)!;
      if (d !== 0) return d;
    }
    return a.length - b.length;
  }
  if (typeof l === "string" || typeof r === "string") return new Unknown(`cannot compare ${typeName(l)} with ${typeName(r)}`);
  return num(l)! - num(r)!;
}

export function finite(v: number): Out {
  return isFinite(v) ? v : new Unknown("result is not a finite number");
}

function toString(v: Value): string {
  // String(x) is the rule; internal/expr writes numbers the same way.
  return typeof v === "string" ? v : String(v);
}
