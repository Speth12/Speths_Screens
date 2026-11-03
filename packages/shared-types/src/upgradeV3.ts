// The v2 to v3 step: calculated tags move to a typed list of expressions,
// and widget dynamics to driven properties, with common JavaScript
// rewritten into the expression language (Phase 3 decisions 3, 5 and 8).
// Mirrors internal/project/upgrade_v3.go.
import { compile } from "@speths-screens/expr";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const orDefault = (v: unknown, def: unknown) => (v === undefined || v === null || v === "" ? def : v);

export function v2ToV3(doc: Obj, notes: string[]) {
  calculatedTagsV3(doc, notes);
  alarmRulesV3(doc, notes);
  const q = (v: unknown) => JSON.stringify(str(v));
  for (const pg of objects(doc.pages)) {
    for (const w of objects(pg.widgets)) drivesV3(w, `page ${q(pg.name)}, widget ${String(w.id)} (${String(w.type)})`, notes);
  }
  for (const fp of objects(doc.faceplates)) {
    for (const w of objects(fp.widgets)) drivesV3(w, `faceplate ${q(fp.name)}, widget ${String(w.localId)} (${String(w.type)})`, notes);
  }
  for (const ps of objects(doc.presets)) {
    for (const w of objects(ps.widgets)) drivesV3(w, `preset ${q(ps.name)}, widget ${String(w.id)} (${String(w.type)})`, notes);
  }
}

// The v2 alarm conditions as expression operators.
const ALARM_OPS: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "==", ne: "!=" };

// alarmRulesV3 turns each alarm rule's binding, condition and threshold into
// one expression: {binding} > threshold.
function alarmRulesV3(doc: Obj, notes: string[]) {
  if (!Array.isArray(doc.alarmRules)) return;
  const kept: Obj[] = [];
  for (const r of doc.alarmRules.filter(isObj)) {
    const where = `alarm rule ${JSON.stringify(str(r.id))}`;
    const binding = str(r.binding);
    if (binding === "") {
      notes.push(`${where}: dropped, it had no tag`);
      continue;
    }
    let op = Object.prototype.hasOwnProperty.call(ALARM_OPS, str(r.condition)) ? ALARM_OPS[str(r.condition)] : undefined;
    if (op === undefined) {
      notes.push(`${where}: unknown condition ${JSON.stringify(str(r.condition))}, read as gt`);
      op = ">";
    }
    const threshold = typeof r.threshold === "number" ? r.threshold : 0;
    r.expr = `${tagRef(binding)} ${op} ${String(threshold)}`;
    delete r.binding;
    delete r.condition;
    delete r.threshold;
    kept.push(r);
  }
  doc.alarmRules = kept;
}

// drivesV3 turns a widget's list of v2 dynamics into its map of driven
// properties, keeping what each kind did on screen.
function drivesV3(w: Obj, where: string, notes: string[]) {
  if (!Array.isArray(w.dynamics)) return;
  const drives: Obj = {};
  const setProp = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (!isObj(w.props)) w.props = {};
    (w.props as Obj)[k] = v;
  };
  const drive = (prop: string, d: Obj) => {
    if (prop in drives) notes.push(`${where}: two dynamics drive ${prop}; kept the last`);
    drives[prop] = d;
  };
  for (const d of w.dynamics.map((x) => (isObj(x) ? x : {}))) {
    const kind = str(d.kind);
    const tag = str(d.binding);
    if (tag === "") {
      notes.push(`${where}: dropped a ${kind} dynamic without a tag`);
      continue;
    }
    const ref = tagRef(tag);
    switch (kind) {
      case "visibility":
        drive("visible", { expr: ref });
        break;
      case "disable":
        drive("disabled", { expr: ref });
        break;
      case "blink":
        drive("blink", { expr: ref });
        setProp("blinkPeriodMs", d.blinkPeriodMs);
        setProp("blinkColor", d.blinkColor);
        break;
      case "colorFill":
        // v2 drew a ring in these colors; the frame's border is the nearest.
        drive("borderColor", { expr: `${ref} ? ${jsQuote(orDefault(d.trueColor, "#22c55e"))} : ${jsQuote(orDefault(d.falseColor, "#3f3f46"))}` });
        break;
      case "rotation":
        drive("rotate", {
          expr: ref,
          transform: {
            kind: "linear",
            in: [orDefault(d.minValue, 0), orDefault(d.maxValue, 100)],
            out: [orDefault(d.minAngle, -90), orDefault(d.maxAngle, 90)],
          },
        });
        break;
      case "script": {
        const prop = str(orDefault(d.targetProp, "bgColor"));
        const old = str(orDefault(d.expression, "value"));
        // In v2, value was this dynamic's tag; in v3 it is the widget's.
        let e = replaceValue(rewriteJS(old), ref);
        if (e !== replaceValue(old, ref)) notes.push(`${where}: dynamics.${prop}: rewrote ${old} as ${e}`);
        if (prop !== "visible") e = `(${e}) ? ${jsQuote(str(d.trueValue))} : ${jsQuote(str(d.falseValue))}`;
        const c = compile(e);
        if (!c.ok) notes.push(`${where}: dynamics.${prop}: ${c.error}; the property keeps its own setting until it is fixed`);
        drive(prop, { expr: e });
        break;
      }
      default:
        notes.push(`${where}: dropped a dynamic of unknown kind ${kind}`);
    }
  }
  if (Object.keys(drives).length === 0) delete w.dynamics;
  else w.dynamics = drives;
}

// tagRef writes a v2 binding as a tag reference; faceplate bindings
// ({param}) already are one.
const tagRef = (binding: string) => (binding.startsWith("{") && binding.endsWith("}") ? binding : `{${binding}}`);

// jsQuote writes v as a single-quoted string of the expression language.
const jsQuote = (v: unknown) => `'${str(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const NAME = /[\p{L}\p{Nd}_$]/u;

// replaceValue replaces the name value with ref, outside strings and tag
// references.
function replaceValue(src: string, ref: string): string {
  const r = Array.from(src);
  let out = "";
  for (let i = 0; i < r.length; ) {
    const c = r[i]!;
    if (c === '"' || c === "'" || c === "{") {
      const end = c === "{" ? "}" : c;
      let j = i + 1;
      while (j < r.length && r[j] !== end) {
        if (r[j] === "\\" && c !== "{") j++;
        j++;
      }
      if (j < r.length) j++;
      out += r.slice(i, Math.min(j, r.length)).join("");
      i = j;
    } else if (NAME.test(c)) {
      let j = i;
      while (j < r.length && NAME.test(r[j]!)) j++;
      const word = r.slice(i, j).join("");
      out += word === "value" && (i === 0 || r[i - 1] !== ".") ? ref : word;
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// calculatedTagsV3 moves calculated tags from a JSON-encoded string of
// {path, formula} to a typed list of {path, expr}.
function calculatedTagsV3(doc: Obj, notes: string[]) {
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
