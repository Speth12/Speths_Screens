// The manifests and schema.json describe the same settings: these tests hold
// them together in both directions.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Field } from "./manifest";
import { FRAME_SETTINGS, MANIFESTS, UNUSED_CONFIG_KEYS } from "./manifests";
import { RENDERED_TYPES } from "./widgets";

type SchemaNode = { type?: string | string[]; $ref?: string; enum?: string[]; items?: SchemaNode; properties?: Record<string, SchemaNode> };
const schema = JSON.parse(readFileSync(resolve(__dirname, "../../../schema.json"), "utf8")) as { $defs: Record<string, SchemaNode> };
const deref = (n: SchemaNode): SchemaNode => (n.$ref ? schema.$defs[n.$ref.replace("#/$defs/", "")]! : n);
const configProps = schema.$defs.WidgetConfig!.properties!;

const frameFields = FRAME_SETTINGS.flatMap((g) => g.fields);
const allFields: { where: string; field: Field }[] = [
  ...frameFields.map((field) => ({ where: "frame", field })),
  ...MANIFESTS.flatMap((m) => m.settings.map((field) => ({ where: m.type, field }))),
];

/** Which schema types a field kind may edit. */
const KIND_TYPES: Record<Field["kind"], string[] | "any"> = {
  number: ["number", "integer"], text: ["string"], color: ["string"], choice: ["string"],
  page: ["string"], binding: ["string"], image: ["string"], symbol: ["string"], faceplate: ["string"],
  boolean: ["boolean"], list: ["array"], faceplateParams: ["object"], value: "any",
};

function checkField(where: string, f: Field, node: SchemaNode | undefined) {
  expect(node, `${where}.${f.key} is not in schema.json`).toBeDefined();
  const n = deref(node!);
  const want = KIND_TYPES[f.kind];
  if (want !== "any") {
    const types = [n.type ?? (n.enum ? "string" : undefined)].flat();
    expect(types.some((t) => t && want.includes(t)), `${where}.${f.key}: ${f.kind} field on schema type ${String(n.type)}`).toBe(true);
  }
  if (f.kind === "choice" && n.enum) {
    expect(f.options.map((o) => o.value).filter((v) => v !== "").sort(), `${where}.${f.key} options`).toEqual([...n.enum].sort());
  }
  if (f.kind === "number" && f.default !== undefined) {
    if (f.min !== undefined) expect(f.default).toBeGreaterThanOrEqual(f.min);
    if (f.max !== undefined) expect(f.default).toBeLessThanOrEqual(f.max);
  }
  if (f.kind === "list") {
    const item = deref(n.items!);
    const props = item.properties ?? {};
    for (const sub of f.item) checkField(`${where}.${f.key}[]`, sub, props[sub.key]);
    expect(Object.keys(props).sort(), `${where}.${f.key}[]: every item key has a field`).toEqual(f.item.map((s) => s.key).sort());
  }
}

describe("manifests", () => {
  it("one manifest per widget type, matching the renderers", () => {
    const types = MANIFESTS.map((m) => m.type);
    expect(new Set(types).size).toBe(types.length);
    expect([...types].sort()).toEqual([...RENDERED_TYPES].sort());
  });

  it("every setting is a WidgetConfig key of a matching type", () => {
    for (const { where, field } of allFields) checkField(where, field, configProps[field.key]);
  });

  it("every WidgetConfig key is edited somewhere, or listed as unused or as an alias", () => {
    const edited = new Set(allFields.map(({ field }) => field.key));
    const aliases = new Set(allFields.map(({ field }) => field.alias).filter(Boolean));
    const missing = Object.keys(configProps).filter((k) => !edited.has(k) && !aliases.has(k) && !(UNUSED_CONFIG_KEYS as readonly string[]).includes(k));
    expect(missing).toEqual([]);
  });

  it("unused keys really are unused", () => {
    const edited = new Set(allFields.map(({ field }) => field.key));
    for (const k of UNUSED_CONFIG_KEYS) expect(edited.has(k), k).toBe(false);
  });

  it("frame settings are not repeated by a widget", () => {
    const frameKeys = new Set(frameFields.map((f) => f.key));
    for (const m of MANIFESTS) for (const f of m.settings) expect(frameKeys.has(f.key), `${m.type}.${f.key}`).toBe(false);
  });

  it("palette sizes are positive", () => {
    for (const m of MANIFESTS) expect(m.defaultSize.w > 0 && m.defaultSize.h > 0, m.type).toBe(true);
  });
});
