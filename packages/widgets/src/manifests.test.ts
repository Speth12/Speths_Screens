// The manifests and schema.json describe the same settings: these tests hold
// them together in both directions. PROPS_KEYS is generated from schema.json.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROPS_KEYS } from "@speths-screens/shared-types";
import type { Field } from "./manifest";
import { FRAME_SETTINGS, MANIFESTS } from "./manifests";
import { RENDERED_TYPES } from "./widgets";

type SchemaNode = { type?: string | string[]; $ref?: string; enum?: string[]; items?: SchemaNode; properties?: Record<string, SchemaNode> };
const schema = JSON.parse(readFileSync(resolve(__dirname, "../../../schema.json"), "utf8")) as { $defs: Record<string, SchemaNode> };
const deref = (n: SchemaNode): SchemaNode => (n.$ref ? schema.$defs[n.$ref.replace("#/$defs/", "")]! : n);
const frameProps = schema.$defs.FrameProps!.properties!;
const frameFields = FRAME_SETTINGS.flatMap((g) => g.fields);

/** The schema node of a widget type's setting (frame settings included). */
function settingNode(type: string, key: string): SchemaNode | undefined {
  const typed = schema.$defs.TypedProps as unknown as { oneOf: { properties: { type: { const: string }; props: { $ref: string } } }[] };
  const branch = typed.oneOf.find((b) => b.properties.type.const === type)!;
  const def = schema.$defs[branch.properties.props.$ref.replace("#/$defs/", "")]!;
  return def.properties?.[key] ?? frameProps[key];
}

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
    const props = deref(n.items!).properties ?? {};
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

  it("frame settings are exactly FrameProps", () => {
    for (const f of frameFields) checkField("frame", f, frameProps[f.key]);
    expect(frameFields.map((f) => f.key).sort()).toEqual(Object.keys(frameProps).sort());
  });

  for (const m of MANIFESTS) {
    it(`${m.type}: its settings plus the frame's are exactly its settings type`, () => {
      for (const f of m.settings) checkField(m.type, f, settingNode(m.type, f.key));
      const edited = [...frameFields, ...m.settings].map((f) => f.key).sort();
      expect(edited).toEqual([...PROPS_KEYS[m.type]].sort());
    });
  }

  it("frame settings are not repeated by a widget", () => {
    const frameKeys = new Set(frameFields.map((f) => f.key));
    for (const m of MANIFESTS) for (const f of m.settings) expect(frameKeys.has(f.key), `${m.type}.${f.key}`).toBe(false);
  });

  it("slots are tag slots in WidgetBindings", () => {
    const slots = Object.keys(schema.$defs.WidgetBindings!.properties!);
    for (const m of MANIFESTS) for (const b of m.bindings) expect(slots).toContain(b.name);
    for (const g of FRAME_SETTINGS) for (const b of g.slots ?? []) expect(slots).toContain(b.name);
  });

  it("palette sizes are positive", () => {
    for (const m of MANIFESTS) expect(m.defaultSize.w > 0 && m.defaultSize.h > 0, m.type).toBe(true);
  });
});
