// Built-in functions. Mirrors internal/expr/funcs.go.
import { Unknown, finite, num, typeName, type Out, type Value } from "./nodes";

/** One built-in. min and max bound the argument count (max -1: no limit);
 *  tag means the single argument must be a tag reference (good). */
export interface Func {
  min: number;
  max: number;
  tag?: boolean;
  eval?: (name: string, args: Value[]) => Out;
}

// Rounds half away from zero, as Go's math.Round does.
const roundHalfAway = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));

function numArg(name: string, v: Value): number | Unknown {
  const x = num(v);
  return x === undefined ? new Unknown(`${name} needs a number, got ${typeName(v)}`) : x;
}

// digitsArg reads a decimal-places argument: a whole number from 0 to 10.
function digitsArg(v: Value, what: string): number | Unknown {
  const d = num(v);
  if (d === undefined || !Number.isInteger(d) || d < 0 || d > 10) return new Unknown(`${what} must be a whole number from 0 to 10`);
  return d;
}

const unary = (f: (x: number) => number): Func => ({
  min: 1, max: 1,
  eval: (name, a) => {
    const x = numArg(name, a[0]!);
    return x instanceof Unknown ? x : finite(f(x));
  },
});

const variadic = (f: (xs: number[]) => number): Func => ({
  min: 1, max: -1,
  eval: (name, a) => {
    const xs: number[] = [];
    for (const v of a) {
      const x = num(v);
      if (x === undefined) return new Unknown(`${name} needs numbers, got ${typeName(v)}`);
      xs.push(x);
    }
    return finite(f(xs));
  },
});

// numbers is a function of exactly n numbers.
const numbers = (n: number, f: (xs: number[]) => number): Func => ({
  min: n, max: n,
  eval: (name, a) => {
    const xs: number[] = [];
    for (const v of a) {
      const x = num(v);
      if (x === undefined) return new Unknown(`${name} needs numbers, got ${typeName(v)}`);
      xs.push(x);
    }
    return finite(f(xs));
  },
});

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// formatFixed writes x with d decimals, rounding half away from zero as
// round does. It goes through a whole number so that Go and TypeScript
// print the same digits (toFixed rounds differently).
function formatFixed(x: number, d: number): Out {
  const n = roundHalfAway(x * 10 ** d);
  if (Number.isNaN(n) || Math.abs(n) > 2 ** 53) return new Unknown("number too large to format");
  let digits = String(Math.abs(n));
  if (digits.length <= d) digits = "0".repeat(d - digits.length + 1) + digits;
  let s = d > 0 ? `${digits.slice(0, digits.length - d)}.${digits.slice(digits.length - d)}` : digits;
  if (n < 0) s = "-" + s;
  return s;
}

export const FUNCS: Record<string, Func> = {
  abs: unary(Math.abs),
  floor: unary(Math.floor),
  ceil: unary(Math.ceil),
  sqrt: unary(Math.sqrt),
  round: {
    min: 1, max: 2,
    eval: (name, a) => {
      const x = numArg(name, a[0]!);
      if (x instanceof Unknown) return x;
      const d = a.length === 2 ? digitsArg(a[1]!, "round digits") : 0;
      if (d instanceof Unknown) return d;
      const p = 10 ** d;
      return finite(roundHalfAway(x * p) / p);
    },
  },
  min: variadic((xs) => xs.slice(1).reduce((m, x) => Math.min(m, x), xs[0]!)),
  max: variadic((xs) => xs.slice(1).reduce((m, x) => Math.max(m, x), xs[0]!)),
  sum: variadic(sum),
  avg: variadic((xs) => sum(xs) / xs.length),
  clamp: {
    min: 3, max: 3,
    eval: (name, a) => {
      const xs: number[] = [];
      for (const v of a) {
        const x = num(v);
        if (x === undefined) return new Unknown(`${name} needs numbers, got ${typeName(v)}`);
        xs.push(x);
      }
      return finite(Math.max(xs[1]!, Math.min(xs[2]!, xs[0]!)));
    },
  },
  bit: {
    min: 2, max: 2,
    eval: (name, a) => {
      const w = numArg(name, a[0]!);
      if (w instanceof Unknown) return w;
      if (!Number.isInteger(w) || Math.abs(w) > 2 ** 53) return new Unknown(`bit needs a whole number, got ${String(w)}`);
      const n = num(a[1]!);
      if (n === undefined || !Number.isInteger(n) || n < 0 || n > 63) return new Unknown("bit position must be a whole number from 0 to 63");
      // BigInt shifts like Go's int64: negative words are two's complement.
      return ((BigInt(w) >> BigInt(n)) & 1n) === 1n;
    },
  },
  format: {
    min: 2, max: 2,
    eval: (name, a) => {
      const x = numArg(name, a[0]!);
      if (x instanceof Unknown) return x;
      const d = digitsArg(a[1]!, "format decimals");
      return d instanceof Unknown ? d : formatFixed(x, d);
    },
  },
  good: { min: 1, max: 1, tag: true },
  // From the calculated-tag engine this language replaced. sin, cos, tan,
  // log and pow may differ from Go in the last digit.
  sin: unary(Math.sin),
  cos: unary(Math.cos),
  tan: unary(Math.tan),
  log: unary(Math.log),
  log10: unary(Math.log10),
  log2: unary(Math.log2),
  sign: unary((x) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  pow: numbers(2, (xs) => Math.pow(xs[0]!, xs[1]!)),
  // map(x, inLo, inHi, outLo, outHi) scales x linearly, without clamping; an
  // empty input range gives outLo.
  map: numbers(5, ([x, inLo, inHi, outLo, outHi]) => {
    const span = inHi! - inLo!;
    return span === 0 ? outLo! : outLo! + ((x! - inLo!) / span) * (outHi! - outLo!);
  }),
};
