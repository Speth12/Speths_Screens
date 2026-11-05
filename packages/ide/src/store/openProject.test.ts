import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject, openSummary } from "./openProject";
import { validateProject } from "./validateProject";

const widgetDoc = (widget: object, extra: object = {}) => ({
  schemaVersion: 5, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [widget] }], ...extra,
});
const w = (type: string, more: object = {}) => ({ id: "w1", type, x: 0, y: 0, w: 2, h: 2, ...more });

// The same cases, and the same lines, as the runtime's TestValidateJSON.
describe("validateProject", () => {
  it.each([
    ["valid widget", widgetDoc(w("gauge", { props: { min: 0, label: "T" }, bindings: { value: "plc:T" } })), []],
    ["valid events", widgetDoc(w("button", { events: { onPress: [{ type: "write", value: 1 }] } })), []],
    ["driven properties", widgetDoc(w("gauge", { dynamics: { min: { expr: "{ns:a}" }, bgColor: { expr: "{ns:a}", transform: { kind: "thresholds", steps: [{ above: 80, value: "#f00" }], below: "#888" } } } })), []],
    ["a property the widget type cannot drive", widgetDoc(w("led", { dynamics: { min: { expr: "1" }, bgColor: { expr: "2" } } })),
      [`page "Main", widget w1 (led): dynamics: cannot drive min`]],
    ["a transform without its fields", widgetDoc(w("gauge", { dynamics: { rotate: { expr: "1", transform: { kind: "linear" } } } })),
      [`page "Main", widget w1 (gauge): dynamics.rotate.transform: missing properties 'in', 'out'`]],
    ["an expression that does not compile", widgetDoc(w("gauge", { dynamics: { bgColor: { expr: "avrg(1)" } } })),
      [`page "Main", widget w1 (gauge): dynamics.bgColor: unknown function avrg at column 1`]],
    ["setting of another widget type", widgetDoc(w("gauge", { props: { momentary: true } })),
      [`page "Main", widget w1 (gauge): unknown setting momentary`]],
    ["one bad setting among good ones", widgetDoc(w("gauge", { props: { min: 0, max: 10, unit: "bar", label: "P", momentary: true } })),
      [`page "Main", widget w1 (gauge): unknown setting momentary`]],
    ["two bad settings among good ones", widgetDoc(w("tank", { props: { min: 0, thresholds: [{ value: 1, color: "#fff" }], step: 1, momentary: true } })),
      [`page "Main", widget w1 (tank): unknown setting step`, `page "Main", widget w1 (tank): unknown setting momentary`]],
    ["bad value among good settings", widgetDoc(w("button", { props: { label: "Go", btnColor: "pink" } })),
      [`page "Main", widget w1 (button): props.btnColor: value must be one of 'blue', 'green', 'red', 'amber', 'zinc', 'purple', 'orange', 'white'`]],
    // The same case as in internal/project/validate_test.go.
    ["five bad settings, in document order", widgetDoc(w("gauge", { props: { zeta: 1, alpha: 1, min: 0, mid: 1, beta: 1, omega: 1 } })),
      ["zeta", "alpha", "mid", "beta", "omega"].map((k) => `page "Main", widget w1 (gauge): unknown setting ${k}`)],
    ["misspelt setting", widgetDoc(w("led", { props: { trueColour: "#fff" } })),
      [`page "Main", widget w1 (led): unknown setting trueColour`]],
    ["wrong value in a setting", widgetDoc(w("button", { props: { btnColor: "pink" } })),
      [`page "Main", widget w1 (button): props.btnColor: value must be one of 'blue', 'green', 'red', 'amber', 'zinc', 'purple', 'orange', 'white'`]],
    ["unknown action", widgetDoc(w("button", { events: { onClick: [{ type: "jump" }] } })),
      [`page "Main", widget w1 (button): events.onClick.0.type: value must be one of 'write', 'toggle', 'increment', 'navigate', 'openUrl'`]],
    ["v1 field in a v2 file", widgetDoc(w("led", { binding: "plc:B" })),
      [`page "Main", widget w1 (led): unknown field binding`]],
    ["faceplate widget", {
      schemaVersion: 5, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
      faceplates: [{ id: "fp", name: "Pump", params: [], widgets: [{ localId: "s", type: "tank", x: 0, y: 0, w: 1, h: 1, props: { step: 1 } }] }],
    }, [`faceplate "Pump", widget s (tank): unknown setting step`]],
    ["preset widget", widgetDoc(w("led"), {
      presets: [{ id: "ps", name: "Start/Stop", widgets: [{ id: "b", type: "button", x: 0, y: 0, w: 1, h: 1, props: { min: 1 } }] }],
    }), [`preset "Start/Stop", widget b (button): unknown setting min`]],
    ["empty preset", widgetDoc(w("led"), { presets: [{ id: "ps", name: "Empty", widgets: [] }] }),
      ["/presets/0/widgets: must NOT have fewer than 1 items"]],
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
    expect(o.project.schemaVersion).toBe(5);
    expect(o.project.pages[0]!.widgets[0]).toMatchObject({ bindings: { value: "plc:T" }, props: { min: 0 } });
    expect(o.notes).toEqual([`page "Main", widget g (gauge): dropped setting decimals, which no widget reads`]);
    expect(openSummary("plant.json", o)).toContain("opened plant.json, upgraded (1 note:");
  });

  it("refuses a project that does not follow the schema", () => {
    const o = openProject(widgetDoc(w("gauge", { props: { momentary: true } })));
    expect(o).toEqual({ ok: false, problems: [`page "Main", widget w1 (gauge): unknown setting momentary`] });
    expect(openSummary("x.json", o)).toBe(`could not open x.json: page "Main", widget w1 (gauge): unknown setting momentary`);
  });

  it("refuses a file from a newer version", () => {
    const o = openProject({ schemaVersion: 9, version: "1", datasources: [], pages: [] });
    expect(o).toEqual({ ok: false, problems: ["the project is format 9; this version of Speth's Screens reads up to 5"] });
  });

  it.each(["demo", "example", "dan-project", "all-rules"])("opens the %s golden file", (name) => {
    const v1 = JSON.parse(readFileSync(resolve(__dirname, `../../../../testdata/upgrade/${name}.v1.json`), "utf8"));
    const o = openProject(v1);
    expect(o.ok ? [] : o.problems).toEqual([]);
  });
});

// The expression problems in each current golden file, as in internal/project/expressions_test.go.
const GOLDEN_EXPRESSION_PROBLEMS: Record<string, string[]> = {
  "all-rules": [], demo: [], example: [], "dan-project": [], alarms: [],
  "calc-tags": [`datasource "sim", calculated tag pick: unknown function if at column 1`],
  dynamics: [`page "Main", widget bad (led): dynamics.borderColor: unexpected "." at column 9`],
};

describe("expression problems", () => {
  it.each(Object.entries(GOLDEN_EXPRESSION_PROBLEMS))("%s.v5.json", (name, want) => {
    const doc = JSON.parse(readFileSync(resolve(__dirname, `../../../../testdata/upgrade/${name}.v5.json`), "utf8"));
    const o = openProject(doc);
    if (!o.ok) throw new Error(o.problems.join("; "));
    expect(o.problems).toEqual(want);
    expect(validateProject(doc)).toEqual(want);
  });

  it("opens a project whose expressions do not compile, and says so", () => {
    const o = openProject(widgetDoc(w("gauge", { dynamics: { bgColor: { expr: "1 +" } } })));
    expect(o.ok).toBe(true);
    expect(openSummary("x.json", o)).toBe(`opened x.json; fix before deploying: page "Main", widget w1 (gauge): dynamics.bgColor: unexpected end of expression`);
  });
});
