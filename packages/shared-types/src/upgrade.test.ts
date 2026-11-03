// Held to the same golden files as the Go upgrader (internal/project/upgrade_test.go).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, UpgradeError, propsKeys, upgradeProject } from "./upgrade";
import { rewriteJS } from "./upgradeV3";

const dir = resolve(__dirname, "../../../testdata/upgrade");
const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf8"));

const V1_TO_V2: Record<string, string[]> = {
  "all-rules": [
    `dropped the project's users list: users live on the runtime`,
    `page "Main", widget g1 (gauge): dropped setting decimals, which no widget reads`,
    `page "Main", widget g1 (gauge): dropped setting momentary, which this widget type does not have`,
    `page "Main", widget b3 (button): dropped setting min, which this widget type does not have`,
    `page "Main", widget i2 (image): dropped setting placeholder, which no widget reads`,
    `page "Main", widget n1 (numericDisplay): dropped a writeValue action without a tag to write`,
  ],
  demo: [`page "Control Panel", widget c-text-in (textInput): dropped setting placeholder, which no widget reads`],
  example: [
    `page "PLC Demo", widget w-numeric (numericDisplay): dropped setting decimals, which no widget reads`,
    `page "PLC Demo", widget w-textinput (textInput): dropped setting placeholder, which no widget reads`,
  ],
  "dan-project": [
    `page "PLC Demo", widget w-numeric (numericDisplay): dropped setting decimals, which no widget reads`,
    `page "PLC Demo", widget w-textinput (textInput): dropped setting placeholder, which no widget reads`,
  ],
};
const V2_TO_V3: Record<string, string[]> = {
  "all-rules": [],
  demo: [`datasource "sim", calculated tag phase reads itself, so it stays Bad until it has a value; start it with (good({sim:phase}) ? {sim:phase} : 0)`],
  example: [],
  "dan-project": [],
  "calc-tags": [
    `datasource "sim", calculated tag absFlow: rewrote Math.abs({mb:Flow}) + Math.max(1, 2) as abs({mb:Flow}) + max(1, 2)`,
    `datasource "sim", calculated tag label: rewrote {mb:Flow}.toFixed(1) + ' m3/h' as format({mb:Flow}, 1) + ' m3/h'`,
    `datasource "sim", calculated tag isRun: rewrote {mb:State} === 1 as {mb:State} == 1`,
    `datasource "sim", calculated tag phase reads itself, so it stays Bad until it has a value; start it with (good({sim:phase}) ? {sim:phase} : 0)`,
    `datasource "sim", calculated tag pick: unknown function if at column 1; the tag stays Bad until the formula is fixed`,
    `datasource "broken": dropped its calculated tags, which were not valid JSON`,
  ],
  alarms: [
    `alarm rule "odd": unknown condition "between", read as gt`,
    `alarm rule "untagged": dropped, it had no tag`,
  ],
  dynamics: [
    `page "Main", widget ring (led): two dynamics drive borderColor; kept the last`,
    `page "Main", widget scr (numericDisplay): dynamics.visible: rewrote Math.abs(value) === 0 as abs({plc:Press}) == 0`,
    `page "Main", widget scr (numericDisplay): dynamics.textColor: rewrote value.toFixed(1) == '20.0' && 'value' != {ns:value} as format({plc:T}, 1) == '20.0' && 'value' != {ns:value}`,
    `page "Main", widget bad (led): dropped a blink dynamic without a tag`,
    `page "Main", widget bad (led): dynamics.borderColor: unexpected "." at column 9; the property keeps its own setting until it is fixed`,
  ],
};
// Notes for upgrading <name>.v<N>.json, as in internal/project/upgrade_test.go.
const NOTES: Record<string, string[]> = {};
for (const [name, n] of Object.entries(V2_TO_V3)) {
  NOTES[`${name}.v2`] = n;
  if (V1_TO_V2[name]) NOTES[`${name}.v1`] = [...V1_TO_V2[name], ...n];
}

describe("golden files", () => {
  const current = `.v${CURRENT_SCHEMA_VERSION}.json`;
  const names = readdirSync(dir).filter((f) => f.endsWith(current)).map((f) => f.replace(current, ""));
  const sources = readdirSync(dir).filter((f) => !f.endsWith(current)).map((f) => f.replace(".json", ""));
  it("has notes for every older golden file", () => expect(sources.sort()).toEqual(Object.keys(NOTES).sort()));

  for (const key of sources) {
    it(key, () => {
      const name = key.replace(/\.v\d+$/, "");
      const input = read(`${key}.json`);
      const want = read(`${name}${current}`);
      const { project, notes } = upgradeProject(input);
      expect(project).toEqual(want);
      expect(notes).toEqual(NOTES[key]);
      // The input is not changed.
      expect(input).toEqual(read(`${key}.json`));
    });
  }
  for (const name of names) {
    it(`${name} current is left alone`, () => {
      const want = read(`${name}${current}`);
      const again = upgradeProject(want);
      expect(again.project).toBe(want);
      expect(again.notes).toEqual([]);
    });
  }
});

describe("rewriteJS", () => {
  // The same cases as TestRewriteJS in internal/project/upgrade_test.go.
  it.each([
    ["Math.abs(x)", "abs(x)"],
    ["Math.round( {a} ) + Math.log10({b})", "round( {a} ) + log10({b})"],
    ["Math.PI * 2", "Math.PI * 2"],
    ["Math.random()", "Math.random()"],
    ["{a}.toFixed(2)", "format({a}, 2)"],
    ["value.toFixed( 1 )", "format(value, 1)"],
    ["({a} * 2).toFixed(0)", "format(({a} * 2), 0)"],
    ["3.14159.toFixed(2)", "format(3.14159, 2)"],
    ["{a} === 1 && {b} !== 2", "{a} == 1 && {b} != 2"],
    ["{a} == 1", "{a} == 1"],
  ])("%s", (src, want) => expect(rewriteJS(src)).toBe(want));
});

describe("versions", () => {
  it.each([
    ["missing means 1", { version: "1", pages: [] }],
    ["1", { schemaVersion: 1, pages: [] }],
    ["2", { schemaVersion: 2, pages: [] }],
    ["current", { schemaVersion: 3, pages: [] }],
  ])("%s", (_, doc) => expect(upgradeProject(doc).project.schemaVersion).toBe(3));

  it.each([
    ["newer", { schemaVersion: 4 }, "the project is format 4; this version of Speth's Screens reads up to 3"],
    ["not a version", { schemaVersion: 0 }, "is not a format version"],
    ["not an object", [1, 2], "not a JSON object"],
  ])("%s is refused", (_, doc, msg) => {
    expect(() => upgradeProject(doc)).toThrow(UpgradeError);
    expect(() => upgradeProject(doc)).toThrow(msg);
  });
});

it("reads each widget type's settings from schema.json", () => {
  const keys = propsKeys();
  expect(keys.size).toBe(17);
  expect(keys.get("gauge")?.has("min")).toBe(true);
  expect(keys.get("gauge")?.has("label")).toBe(true);
  expect(keys.get("gauge")?.has("momentary")).toBe(false);
  expect(keys.get("button")?.has("onValue")).toBe(false);
  expect(keys.get("numericInput")?.has("max")).toBe(true);
});
