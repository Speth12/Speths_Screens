import { describe, expect, it } from "vitest";
import { activeAlarms, exportView, generateStandaloneHtml } from "./exportHtml";
import type { Project, Widget } from "./projectStore";

const reply = [
  { id: "1", severity: "critical", message: "Tank high", active: true, acked: false },
  { id: "2", severity: "warning", message: "Back to normal", active: false, acked: true },
  { id: "3", severity: "info", message: "Acked but active", active: true, acked: true },
];

describe("activeAlarms", () => {
  const cases: { name: string; data: unknown; want: string[] }[] = [
    { name: "the runtime's array of events", data: reply, want: ["1", "3"] },
    { name: "an object is not the reply", data: { alarms: reply }, want: [] },
    { name: "null", data: null, want: [] },
    { name: "junk entries", data: [null, 3, { active: true, id: "4" }], want: ["4"] },
  ];
  for (const c of cases) {
    it(c.name, () => expect(activeAlarms(c.data).map((a) => (a as unknown as { id: string }).id)).toEqual(c.want));
  }
});

describe("exported page", () => {
  const project: Project = { schemaVersion: 2, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }] };
  const html = generateStandaloneHtml(project, "");

  it("embeds a working copy of activeAlarms", () => {
    const src = html.match(/const activeAlarms = ([\s\S]*?);\r?\nasync function pollAlarms/)?.[1];
    expect(src).toBeTruthy();
    const embedded = new Function(`return (${src})`)() as typeof activeAlarms;
    expect(embedded(reply).length).toBe(2);
  });

  it("polls the page's own host when no target is set", () => {
    expect(html).not.toMatch(/if \(!base\) return;/);
    expect(html).not.toContain("data?.alarms");
  });
});

describe("exportView", () => {
  const base = { id: "b", type: "button", x: 0, y: 0, w: 1, h: 1, bindings: { value: "plc:Run" }, props: { label: "Run" } } as const;
  it.each([
    ["momentary", { onPress: [{ type: "write", value: 5 }], onRelease: [{ type: "write", value: 0 }] }, { label: "Run", onValue: 5, offValue: 0 }],
    ["toggle", { onClick: [{ type: "toggle", on: true, off: false }] }, { label: "Run", momentary: false, onValue: true, offValue: false }],
    ["navigate", { onClick: [{ type: "navigate", page: "p2" }] }, { label: "Run", action: "navigate", navigateTo: "p2" }],
  ] as const)("a %s button", (_, events, config) => {
    const v = exportView({ ...base, events } as unknown as Widget);
    expect(v.binding).toBe("plc:Run");
    expect(v.config).toEqual(config);
  });

  it("is embedded in the page and works there", () => {
    const html = generateStandaloneHtml({ schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }] }, "");
    const src = html.match(/const exportView = ([\s\S]*?);\r?\nPROJECT\.pages\.forEach/)?.[1];
    expect(src).toBeTruthy();
    const embedded = new Function(`return (${src})`)() as typeof exportView;
    expect(embedded({ ...base, events: { onClick: [{ type: "navigate", page: "p9" }] } } as unknown as Widget).config.navigateTo).toBe("p9");
  });
});
