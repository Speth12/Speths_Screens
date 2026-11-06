// Held to the same golden cases as the Go engine (internal/expr/expr_test.go).
// A tag or value is either a plain JSON value (Good) or {"value", "quality"};
// a tag missing from tags has no value; a missing value means no widget.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, type Env, type Input } from "./index";

interface GoldenCase {
  expr: string;
  tags?: Record<string, unknown>;
  value?: unknown;
  want?: unknown;
  unknown?: string;
  error?: string;
  refs?: string[];
  usesValue?: boolean;
  /** Compare to 12 significant digits (sin, cos, log, pow can differ from Go in the last digit). */
  near?: boolean;
  /** Compile as a custom widget template. */
  template?: boolean;
  params?: string[];
}

const dir = resolve(__dirname, "../../../testdata/expr");

function input(spec: unknown): Input {
  if (spec !== null && typeof spec === "object" && !Array.isArray(spec) && "quality" in spec) {
    const s = spec as { value?: unknown; quality: string };
    return { value: s.value ?? null, quality: s.quality };
  }
  return { value: spec, quality: "Good" };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("golden cases", () => {
  it("finds the golden files", () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    const cases = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as GoldenCase[];
    describe(file, () => {
      for (const c of cases) {
        it(c.expr, () => {
          const compiled = compile(c.expr, { template: c.template });
          if (c.error !== undefined) {
            expect(compiled).toEqual({ ok: false, error: c.error });
            return;
          }
          if (!compiled.ok) throw new Error(`compile: ${compiled.error}`);
          const e = compiled.expr;
          if (c.refs) expect(e.refs).toEqual(c.refs);
          if (c.params) expect(e.params).toEqual(c.params);
          expect(e.usesValue).toBe(c.usesValue ?? false);
          const env: Env = {
            tag: (ref) => (c.tags && Object.hasOwn(c.tags, ref) ? input(c.tags[ref]) : undefined),
          };
          if ("value" in c) env.value = () => input(c.value);
          const got = e.eval(env);
          if (c.unknown !== undefined) expect(got).toEqual({ ok: false, reason: c.unknown });
          else if (c.near) {
            const want = c.want as number;
            if (!got.ok || typeof got.value !== "number") throw new Error(`got ${JSON.stringify(got)}`);
            expect(Math.abs(got.value - want)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(want)));
          } else expect(got).toEqual({ ok: true, value: c.want });
        });
      }
    });
  }
});

describe("limits", () => {
  it.each([
    ["1000 characters", "1" + " ".repeat(999), true],
    ["1001 characters", "1" + " ".repeat(1000), false],
    ["1000 code points, more UTF-16 units", `"${"😀".repeat(998)}"`, true],
  ])("%s", (_name, src, ok) => {
    const c = compile(src);
    if (ok) expect(c.ok).toBe(true);
    else expect(c).toEqual({ ok: false, error: "expression longer than 1000 characters" });
  });
});

describe("driver values", () => {
  const e = compile("{ns:a}");
  if (!e.ok) throw new Error(e.error);
  it.each([
    ["NaN from a PLC float", NaN, "input {ns:a} is not a finite number"],
    ["an object", { x: 1 }, "input {ns:a} has an unsupported value"],
    ["undefined", undefined, "input {ns:a} has no value"],
  ])("%s", (_name, v, reason) => {
    expect(e.expr.eval({ tag: () => ({ value: v, quality: "Good" }) })).toEqual({ ok: false, reason });
  });
});
