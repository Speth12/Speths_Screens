// The gallery is the visual regression test: each theme's gallery is drawn to
// HTML and compared with __snapshots__/gallery.<theme>.html. A change to a
// widget's look shows up as a diff there; review it, then update the
// snapshot with: npm test --workspace=packages/widgets -- --run -u
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Gallery, GALLERY_STATES, galleryCell, galleryInsert } from "./gallery";
import { MANIFESTS } from "./manifests";
import { THEMES } from "./tokens";

// The trend draws its time axis from the clock, in the local time zone: fix both.
process.env.TZ = "UTC";
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-01T12:00:00Z")); });
afterAll(() => vi.useRealTimers());

// Pretty-prints the markup a little so a diff points at one widget.
const lines = (html: string) => html.replace(/></g, ">\n<");

describe.each(THEMES.map((t) => [t.id, t] as const))("gallery in %s", (id, theme) => {
  it("matches the snapshot", async () => {
    const html = renderToStaticMarkup(<Gallery theme={theme} />);
    await expect(lines(html)).toMatchFileSnapshot(`__snapshots__/gallery.${id}.html`);
  });
});

it("draws the same markup twice (no clocks or random ids)", () => {
  const draw = () => renderToStaticMarkup(<Gallery theme={THEMES[0]!} />);
  expect(draw()).toBe(draw());
});

it("has a cell for every widget type in every state", () => {
  const html = renderToStaticMarkup(<Gallery theme={THEMES[0]!} />);
  for (const m of MANIFESTS) for (const st of GALLERY_STATES) expect(html).toContain(`data-testid="gallery-${m.type}-${st.id}"`);
});

describe("cells", () => {
  const gauge = MANIFESTS.find((m) => m.type === "gauge")!;
  const led = MANIFESTS.find((m) => m.type === "led")!;
  it.each([
    ["normal", gauge, undefined, 62, "Good"],
    ["normal", gauge, 30, 30, "Good"],
    ["off", gauge, 30, 0, "Good"],
    ["running", led, undefined, true, "Good"],
    ["off", led, undefined, false, "Good"],
    ["bad", gauge, undefined, 62, "Bad"],
  ] as const)("%s %s with slider %s", (state, m, slider, value, quality) => {
    const c = galleryCell(m, state, slider);
    expect(c.tag).toMatchObject({ value, quality });
    expect(c.widget.bindings?.value).toBe(`gallery:${m.type}:${state}`);
  });
  it("alarm states drive the border with the alarm's token", () => {
    expect(galleryCell(gauge, "critical").widget.dynamics).toEqual({ borderColor: { expr: "'token:alarm-critical'" } });
    expect(galleryCell(gauge, "disabled").widget.dynamics).toEqual({ disabled: { expr: "true" } });
  });
  it("inserts the sample's settings, without the gallery's tag or drives", () => {
    const w = galleryInsert(gauge);
    expect(w).toMatchObject({ type: "gauge", w: 4, h: 3, props: { min: 0, max: 100, unit: "%", label: "Level" } });
    expect(w).not.toHaveProperty("bindings");
    expect(w).not.toHaveProperty("dynamics");
  });
});
