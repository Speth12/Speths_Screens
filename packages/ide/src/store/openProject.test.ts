import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject, openSummary } from "./openProject";
import { validateProject } from "./validateProject";

const widgetDoc = (widget: object, extra: object = {}) => ({
  schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [widget] }], ...extra,
});
const w = (type: string, more: object = {}) => ({ id: "w1", type, x: 0, y: 0, w: 2, h: 2, ...more });

// The same cases, and the same lines, as the runtime's TestValidateJSON.
describe("validateProject", () => {
  it.each([
    ["valid widget", widgetDoc(w("gauge", { props: { min: 0, label: "T" }, bindings: { value: "plc:T" } })), []],
    ["valid events", widgetDoc(w("button", { events: { onPress: [{ type: "write", value: 1 }] } })), []],
    ["setting of another widget type", widgetDoc(w("gauge", { props: { momentary: true } })),
      [`page "Main", widget w1 (gauge): unknown setting momentary`]],
    ["misspelt setting", widgetDoc(w("led", { props: { trueColour: "#fff" } })),
      [`page "Main", widget w1 (led): unknown setting trueColour`]],
    ["wrong value in a setting", widgetDoc(w("button", { props: { btnColor: "pink" } })),
      [`page "Main", widget w1 (button): props.btnColor: value must be one of 'blue', 'green', 'red', 'amber', 'zinc', 'purple', 'orange', 'white'`]],
    ["unknown action", widgetDoc(w("button", { events: { onClick: [{ type: "jump" }] } })),
      [`page "Main", widget w1 (button): events.onClick.0.type: value must be one of 'write', 'toggle', 'increment', 'navigate', 'openUrl'`]],
    ["v1 field in a v2 file", widgetDoc(w("led", { binding: "plc:B" })),
      [`page "Main", widget w1 (led): unknown field binding`]],
    ["faceplate widget", {
      schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
      faceplates: [{ id: "fp", name: "Pump", params: [], widgets: [{ localId: "s", type: "tank", x: 0, y: 0, w: 1, h: 1, props: { step: 1 } }] }],
    }, [`faceplate "Pump", widget s (tank): unknown setting step`]],
  ] as const)("%s", (_, doc, want) => {
    expect(validateProject(doc)).toEqual(want);
  });
});

describe("openProject", () => {
  it("upgrades a v1 file and reports what the upgrade dropped", () => {
    const v1 = { version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [
      { id: "g", type: "gauge", x: 0, y: 0, w: 2, h: 2, binding: "plc:T", config: { min: 0, decimals: 2 } },
    ] }] };
    const o = openProject(v1);
    if (!o.ok) throw new Error(o.problems.join("; "));
    expect(o.project.schemaVersion).toBe(2);
    expect(o.project.pages[0]!.widgets[0]).toMatchObject({ bindings: { value: "plc:T" }, props: { min: 0 } });
    expect(o.notes).toEqual([`page "Main", widget g (gauge): dropped setting decimals, which no widget reads`]);
    expect(openSummary("plant.json", o)).toContain("opened plant.json, upgraded (1 change:");
  });

  it("refuses a project that does not follow the schema", () => {
    const o = openProject(widgetDoc(w("gauge", { props: { momentary: true } })));
    expect(o).toEqual({ ok: false, problems: [`page "Main", widget w1 (gauge): unknown setting momentary`] });
    expect(openSummary("x.json", o)).toBe(`could not open x.json: page "Main", widget w1 (gauge): unknown setting momentary`);
  });

  it("refuses a file from a newer version", () => {
    const o = openProject({ schemaVersion: 9, version: "1", datasources: [], pages: [] });
    expect(o).toEqual({ ok: false, problems: ["the project is format 9; this version of Speth's Screens reads up to 2"] });
  });

  it.each(["demo", "example", "dan-project", "all-rules"])("opens the %s golden file", (name) => {
    const v1 = JSON.parse(readFileSync(resolve(__dirname, `../../../../testdata/upgrade/${name}.v1.json`), "utf8"));
    const o = openProject(v1);
    expect(o.ok ? [] : o.problems).toEqual([]);
  });
});
