// Held to the same golden files as the Go upgrader (internal/project/upgrade_test.go).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UpgradeError, propsKeys, upgradeProject } from "./upgrade";

const dir = resolve(__dirname, "../../../testdata/upgrade");
const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf8"));

const NOTES: Record<string, string[]> = {
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

describe("golden files", () => {
  const names = readdirSync(dir).filter((f) => f.endsWith(".v1.json")).map((f) => f.replace(".v1.json", ""));
  it("covers every golden file", () => expect(names.sort()).toEqual(Object.keys(NOTES).sort()));

  for (const name of names) {
    it(name, () => {
      const v1 = read(`${name}.v1.json`);
      const want = read(`${name}.v2.json`);
      const { project, notes } = upgradeProject(v1);
      expect(project).toEqual(want);
      expect(notes).toEqual(NOTES[name]);
      // The input is not changed, and a current file is left alone.
      expect(v1).toEqual(read(`${name}.v1.json`));
      const again = upgradeProject(want);
      expect(again.project).toBe(want);
      expect(again.notes).toEqual([]);
    });
  }
});

describe("versions", () => {
  it.each([
    ["missing means 1", { version: "1", pages: [] }],
    ["1", { schemaVersion: 1, pages: [] }],
    ["current", { schemaVersion: 2, pages: [] }],
  ])("%s", (_, doc) => expect(upgradeProject(doc).project.schemaVersion).toBe(2));

  it.each([
    ["newer", { schemaVersion: 3 }, "the project is format 3; this version of Speth's Screens reads up to 2"],
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
