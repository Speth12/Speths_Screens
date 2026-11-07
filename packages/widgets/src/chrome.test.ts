import { describe, expect, it } from "vitest";
import { DEFAULT_IDS, defaultCustomWidgets, defaultFrame, effectiveFrame, findCustomWidget, missingDefaults } from "./chrome";
import { slotsByEdge } from "./layout";

describe("the built-in header and navigation", () => {
  it("the header is a row that hides the drivers and clock on a phone", () => {
    const header = defaultCustomWidgets().find((c) => c.name === "Project header")!;
    expect(header.layout).toMatchObject({ mode: "stack", direction: "row" });
    expect(header.widgets.filter((w) => w.hiddenOn?.includes("phone")).map((w) => w.type)).toEqual(["driverStatus", "clock"]);
  });

  it("every slot refers to a custom widget the defaults have", () => {
    const ids = new Set(defaultCustomWidgets().map((c) => c.id));
    for (const nav of ["sidebar", "toolbar", "tabs"] as const) {
      for (const slot of defaultFrame(nav)) expect(ids.has(slot.customWidgetId)).toBe(true);
    }
  });

  it("the header is on top; the pages are on the left, as tabs or as icons; a phone gets the bottom bar", () => {
    const at = (nav: "sidebar" | "toolbar" | "tabs", device: "desktop" | "tablet" | "phone") => {
      const e = slotsByEdge(defaultFrame(nav), device);
      return { top: e.top.map((x) => x.slot.id), left: e.left.map((x) => x.slot.id), bottom: e.bottom.map((x) => x.slot.id) };
    };
    expect(at("sidebar", "desktop")).toEqual({ top: ["header"], left: ["nav"], bottom: [] });
    expect(at("tabs", "tablet")).toEqual({ top: ["header", "nav"], left: [], bottom: [] });
    expect(at("toolbar", "desktop")).toEqual({ top: ["header", "nav"], left: [], bottom: [] });
    for (const nav of ["sidebar", "toolbar", "tabs"] as const) expect(at(nav, "phone")).toEqual({ top: ["header"], left: [], bottom: ["bottom-nav"] });
  });

  it("the style asked for picks the navigation widget", () => {
    const nav = (n: "sidebar" | "toolbar" | "tabs") => defaultFrame(n).find((s) => s.id === "nav")!.customWidgetId;
    expect([nav("sidebar"), nav("tabs"), nav("toolbar")]).toEqual([DEFAULT_IDS.sideNav, DEFAULT_IDS.tabNav, DEFAULT_IDS.iconNav]);
  });

  it("adding the defaults twice changes nothing, and a deleted one comes back", () => {
    const have = { customWidgets: defaultCustomWidgets(), frame: defaultFrame() };
    expect(missingDefaults(have)).toEqual({ customWidgets: [], frame: [] });
    expect(missingDefaults({ customWidgets: have.customWidgets.slice(1), frame: have.frame.slice(1) }).customWidgets.map((c) => c.id)).toEqual(["cw-titles"]);
    expect(missingDefaults({}).frame.length).toBe(3);
  });
});

describe("what the screen draws", () => {
  it("a project that chose custom chrome draws its own frame, even an empty one", () => {
    const own = [{ id: "x", customWidgetId: "c", edge: "top" as const, size: 10 }];
    expect(effectiveFrame({ shell: { chrome: "custom", frame: own } })).toBe(own);
    expect(effectiveFrame({ shell: { chrome: "custom" } })).toEqual([]);
  });

  it("any other project draws the built-in frame in its navigation style, tabs when it names none", () => {
    const navId = (p: Parameters<typeof effectiveFrame>[0]) => effectiveFrame(p).find((s) => s.id === "nav")!.customWidgetId;
    expect(navId({})).toBe(DEFAULT_IDS.tabNav);
    expect(navId({ shell: { nav: "sidebar" } })).toBe(DEFAULT_IDS.sideNav);
    expect(navId({ shell: { nav: "toolbar" } })).toBe(DEFAULT_IDS.iconNav);
  });

  it("a custom widget is the project's own, else a built-in one", () => {
    const mine = { id: DEFAULT_IDS.header, name: "Mine", params: [], widgets: [] };
    expect(findCustomWidget({ customWidgets: [mine] }, DEFAULT_IDS.header)).toBe(mine);
    expect(findCustomWidget({}, DEFAULT_IDS.header)?.name).toBe("Project header");
    expect(findCustomWidget({}, "nope")).toBeUndefined();
    expect(findCustomWidget({}, undefined)).toBeUndefined();
  });
});
