// Checks a project against schema.json, as the runtime does before loading
// or deploying one. Problems are written for people, in the same form as the
// runtime's (internal/project/validate.go): "page "Main", widget w1 (gauge):
// unknown setting momentary".
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import schema from "../../../../schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema, "project");
const check = ajv.getSchema("project")!;

type Obj = Record<string, unknown>;

// Each widget type's own settings check, from the TypedProps branches
// ({ type: { const: "gauge" }, props: { $ref: "#/$defs/GaugeProps" } }).
const propsCheck = new Map(
  (schema.$defs.TypedProps.oneOf as { properties: { type: { const: string }; props: { $ref: string } } }[])
    .map((b) => [b.properties.type.const, ajv.getSchema(`project${b.properties.props.$ref}`)!]),
);

/** The problems with a project in the current format; empty when it is valid. */
export function validateProject(project: unknown): string[] {
  if (check(project)) return [];
  const problems: string[] = [];
  const errors = widgetAware(project, check.errors ?? []);
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

/**
 * The widget-type oneOf tries every widget type's settings, and ajv reports
 * all of them, with paths relative to each settings type, so they cannot be
 * told apart. For a widget whose oneOf failed, those errors are replaced by
 * a check of its settings against its own type's alone.
 */
function widgetAware(project: unknown, errors: ErrorObject[]): ErrorObject[] {
  const failed = new Set<string>(); // instance paths of widgets whose oneOf failed
  for (const e of errors) if (e.keyword === "oneOf" && widgetAt(project, e.instancePath.split("/").slice(1))) failed.add(e.instancePath);
  const inFailed = (path: string) => [...failed].some((w) => path === w || path === `${w}/type` || path.startsWith(`${w}/props`));
  const out = errors.filter((e) => !inFailed(e.instancePath));
  for (const at of failed) {
    const w = widgetAt(project, at.split("/").slice(1))!;
    const own = propsCheck.get(String(w.type));
    if (!own || w.props === undefined || own(w.props)) continue;
    for (const e of own.errors ?? []) out.push({ ...e, instancePath: `${at}/props${e.instancePath}` });
  }
  return out;
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
