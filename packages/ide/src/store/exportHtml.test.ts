import { describe, expect, it } from "vitest";
import { activeAlarms, generateStandaloneHtml } from "./exportHtml";
import type { Project } from "./projectStore";

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
  const project: Project = { version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }] };
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
