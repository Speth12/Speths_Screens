import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFESTS, type TagState } from "@speths-screens/widgets";
import { generateStandaloneHtml, placement, snapshotHost } from "./exportHtml";
import type { Project, Widget } from "./projectStore";

const at = new Date("2026-10-24T12:00:00Z");
const none = () => undefined;
const page = (widgets: Widget[], more: Partial<Project> = {}): Project => ({
  schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets }], ...more,
});
const html = (p: Project, tag: (path: string) => TagState | undefined = none, css = "") =>
  generateStandaloneHtml(p, { tag, css, exportedAt: at });

describe("generateStandaloneHtml", () => {
  it("draws the whole demo project with the widget library, with no scripts", async () => {
    const demo = JSON.parse(readFileSync(resolve(__dirname, "../../../../demo.xhmi.json"), "utf8")) as Project;
    const out = await html(demo);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/\son[a-z]+=/i); // no inline handlers either
    for (const p of demo.pages) expect(out).toContain(`id="page-${p.id}"`);
    expect(out).toContain(`href="#page-${demo.pages[1]!.id}"`);
  });

  it.each(MANIFESTS.filter((m) => m.palette !== false).map((m) => [m.type, m] as const))(
    "a %s renders without a browser", async (_, m) => {
      const out = await html(page([{ id: "w", type: m.type, x: 0, y: 0, w: m.defaultSize.w, h: m.defaultSize.h, ...structuredClone(m.defaults) }]));
      expect(out).toContain(`id="page-p1"`);
    });

  it("shows the value the IDE had for each tag", async () => {
    const values: Record<string, TagState> = { "ns:plant.temp": { value: 42.5, quality: "Good", ts: 1 } };
    const out = await html(page([
      { id: "d", type: "numericDisplay", x: 0, y: 0, w: 2, h: 1, props: { label: "Temp" }, bindings: { value: "ns:plant.temp" } },
    ]), (p) => values[p]);
    expect(out).toContain("42.5");
    expect(out).toContain("Temp");
  });

  it("escapes the project name and keeps the CSS inside its element", async () => {
    const out = await html(page([], { name: `<b>Plant & "Co"</b>` }), none, `.x{content:"</style><script>alert(1)</script>"}`);
    expect(out).toContain("<title>&lt;b&gt;Plant &amp; \"Co\"&lt;/b&gt;</title>");
    // The style element ends once, at its real end; the hostile text stays inside it as text.
    expect(out.match(/<\/style>/g)).toHaveLength(1);
    expect(out.split("</style>")[1]).not.toMatch(/<script/i);
  });

  it("carries the IDE theme on <html>, data attributes only", async () => {
    const out = await generateStandaloneHtml(page([]), {
      tag: none, css: "", exportedAt: at,
      root: { style: "--card: #111", className: "dark", attrs: { "data-theme-id": "slate", onload: "x()" } },
    });
    expect(out).toContain(`<html lang="en" class="dark" style="--card: #111" data-theme-id="slate">`);
    expect(out).not.toContain("onload");
  });
});

describe("placement", () => {
  it.each([
    ["grid cells as the canvas draws them", { x: 1, y: 2, w: 2, h: 1 }, false, { left: 88, top: 144, width: 168, height: 64 }],
    ["pixels as they are", { x: 10, y: 20, w: 300, h: 100 }, true, { left: 10, top: 20, width: 300, height: 100 }],
  ])("%s", (_, box, pixel, want) => {
    expect(placement({ id: "w", type: "led", ...box }, pixel)).toEqual(want);
  });
});

describe("snapshotHost", () => {
  const project = page([], {
    images: [{ id: "img1", name: "logo", dataUrl: "data:image/png;base64,AA", mimeType: "image/png", width: 1, height: 1, size: 1 }],
    faceplates: [{ id: "fp", name: "Pump", params: [], widgets: [] }],
  });
  const host = snapshotHost(project, (p) => (p === "plc:a" ? { value: 1, quality: "Good", ts: 1 } : undefined));

  it("serves snapshot values, images and faceplates", () => {
    expect(host.useTag("plc:a").value).toBe(1);
    expect(host.useTag("plc:missing").quality).toBe("Unknown");
    expect(host.useTag(undefined).quality).toBe("Unknown");
    expect(host.useTags(["plc:a", "plc:b"])).toMatchObject({ "plc:a": { value: 1 }, "plc:b": { quality: "Unknown" } });
    expect(host.useImage("img1")).toBe("data:image/png;base64,AA");
    expect(host.useFaceplate("fp")?.name).toBe("Pump");
  });

  it("writes and navigates nowhere", () => {
    expect(() => { host.write({ binding: "plc:a", value: 1 }); host.requestWrite({ binding: "plc:a", value: 1 }); host.navigate("p2"); }).not.toThrow();
  });
});
