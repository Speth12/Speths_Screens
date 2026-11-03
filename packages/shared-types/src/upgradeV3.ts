// The v2 to v3 step: calculated tags move from a JSON-encoded string of
// {path, formula} to a typed list of {path, expr}, with common JavaScript
// rewritten into the expression language (Phase 3 decisions 5 and 8).
// Mirrors internal/project/upgrade_v3.go.
import { compile } from "@speths-screens/expr";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function v2ToV3(doc: Obj, notes: string[]) {
  const datasources = Array.isArray(doc.datasources) ? doc.datasources.filter(isObj) : [];
  for (const ds of datasources) {
    const cfg = isObj(ds.config) ? ds.config : undefined;
    if (!cfg || typeof cfg.tags !== "string") continue;
    const where = `datasource ${JSON.stringify(str(ds.id))}`;
    let specs: unknown;
    try {
      specs = JSON.parse(cfg.tags);
    } catch {
      specs = undefined;
    }
    if (!Array.isArray(specs)) {
      delete cfg.tags;
      notes.push(`${where}: dropped its calculated tags, which were not valid JSON`);
      continue;
    }
    cfg.tags = specs.filter(isObj).map((s) => {
      const path = str(s.path);
      return { path, expr: calcExpr(str(s.formula), str(ds.id), path, where, notes) };
    });
  }
}

// calcExpr rewrites one formula and notes what a person must check.
function calcExpr(formula: string, dsId: string, path: string, where: string, notes: string[]): string {
  where = `${where}, calculated tag ${path}`;
  const src = rewriteJS(formula);
  if (src !== formula) notes.push(`${where}: rewrote ${formula} as ${src}`);
  const c = compile(src);
  if (!c.ok) {
    notes.push(`${where}: ${c.error}; the tag stays Bad until the formula is fixed`);
    return src;
  }
  const self = `${dsId}:${path}`;
  if (c.expr.refs.includes(self)) {
    notes.push(`${where} reads itself, so it stays Bad until it has a value; start it with (good({${self}}) ? {${self}} : 0)`);
  }
  return src;
}

const JS_MATH = /\bMath\.(abs|min|max|round|floor|ceil|sqrt|sin|cos|tan|log10|log2|log|pow|sign)\b\s*\(/g;
const JS_TO_FIXED = /(\{[^{}]*\}|\bvalue\b|\d+(?:\.\d+)?|\([^()]*\))\.toFixed\(\s*(\d+)\s*\)/g;
const JS_STRICT = /(===|!==)/g;

/** Rewrites the common JavaScript that old formulas and script dynamics used
 *  into the expression language: Math.abs(x) becomes abs(x) (and the other
 *  functions the language has), x.toFixed(n) becomes format(x, n), and ===
 *  and !== become == and !=. Anything else is left for the expression
 *  compiler to report. Go's project.RewriteJS does the same. */
export function rewriteJS(src: string): string {
  return src
    .replace(JS_MATH, "$1(")
    .replace(JS_TO_FIXED, "format($1, $2)")
    .replace(JS_STRICT, (op) => op.slice(0, 2));
}
