// Checks a project against schema.json, as the runtime does before loading
// or deploying one. Problems are written for people, in the same form as the
// runtime's (internal/project/validate.go): "page "Main", widget w1 (gauge):
// unknown setting momentary".
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../../schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const check = ajv.compile(schema);

type Obj = Record<string, unknown>;

// Which TypedProps branch (oneOf index) holds each widget type.
const branchOf = new Map<string, number>(
  (schema.$defs.TypedProps.oneOf as { properties: { type: { const: string } } }[])
    .map((b, i) => [b.properties.type.const, i]),
);

/** The problems with a project in the current format; empty when it is valid. */
export function validateProject(project: unknown): string[] {
  if (check(project)) return [];
  const problems: string[] = [];
  const errors = (check.errors ?? []).filter((e) => relevant(project, e));
  // A setting that fails its own check also counts as unevaluated (JSON
  // Schema 2020-12); report only its own error, not "unknown setting".
  const failed = new Set(errors.map((e) => e.instancePath));
  for (const e of errors) {
    const key = (e.params as { unevaluatedProperty?: string }).unevaluatedProperty;
    if (e.keyword === "unevaluatedProperties" && key !== undefined && failed.has(`${e.instancePath}/${key}`)) continue;
    const p = describe(project, e);
    if (!problems.includes(p)) problems.push(p);
  }
  return problems;
}

/** Drops the noise of the widget-type oneOf: the summary error, and errors
 *  from the branches for other widget types. */
function relevant(project: unknown, e: ErrorObject): boolean {
  // TypedProps holds the schema's only oneOf; ajv gives its path relative to the definition.
  const m = e.schemaPath.match(/\/oneOf(?:\/(\d+))?/);
  if (!m) return true;
  if (m[1] === undefined) return false; // "must match exactly one schema"
  const w = widgetAt(project, e.instancePath.split("/").slice(1));
  return w !== undefined && branchOf.get(String(w.type)) === Number(m[1]);
}

const OWNERS: Record<string, string> = { pages: "page", faceplates: "faceplate", presets: "preset" };

function widgetAt(project: unknown, loc: string[]): Obj | undefined {
  if (loc.length < 4 || loc[2] !== "widgets" || !OWNERS[loc[0]!]) return undefined;
  const owner = item((project as Obj)[loc[0]!], loc[1]!);
  return item(owner?.widgets, loc[3]!);
}

function item(list: unknown, index: string): Obj | undefined {
  const v = Array.isArray(list) ? list[Number(index)] : undefined;
  return typeof v === "object" && v !== null ? (v as Obj) : undefined;
}

function describe(project: unknown, e: ErrorObject): string {
  const loc = e.instancePath.split("/").slice(1);
  let where = "";
  let rest = loc;
  const w = widgetAt(project, loc);
  if (w) {
    const owner = item((project as Obj)[loc[0]!], loc[1]!);
    const isFp = loc[0] === "faceplates";
    where = `${OWNERS[loc[0]!]} ${JSON.stringify(owner?.name ?? "")}, widget ${String(isFp ? w.localId : w.id)} (${String(w.type)})`;
    rest = loc.slice(4);
  } else if (loc.length) {
    where = "/" + loc.join("/");
    rest = [];
  }
  let what: string;
  const params = e.params as Record<string, unknown>;
  if (e.keyword === "unevaluatedProperties" || e.keyword === "additionalProperties") {
    const key = String(params.unevaluatedProperty ?? params.additionalProperty);
    what = rest.at(-1) === "props" ? `unknown setting ${key}` : `unknown field ${key}`;
    if (rest.at(-1) === "props") rest = rest.slice(0, -1);
  } else if (e.keyword === "enum") {
    what = `value must be one of ${(params.allowedValues as unknown[]).map((v) => `'${String(v)}'`).join(", ")}`;
  } else {
    what = e.message ?? e.keyword;
  }
  if (rest.length) what = `${rest.join(".")}: ${what}`;
  return where ? `${where}: ${what}` : what;
}
