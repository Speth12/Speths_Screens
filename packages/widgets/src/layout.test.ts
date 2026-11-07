import { describe, expect, it } from "vitest";
import { COL_W, GAP, PREVIEW_MINIMUM, ROW_H, deviceFor, effectivePlacement, fitScale, forDevice, pageExtent, placeFor, stackFor, stackStyle, partStyle, slotFor, slotsByEdge, placement, stageSize } from "./layout";

const w = (x: number, y: number, ww: number, h: number) => ({ x, y, w: ww, h });

describe("placement", () => {
  it("grid: cells of 80 by 64 pixels with an 8 pixel gap", () => {
    expect(placement(w(0, 0, 1, 1), false)).toEqual({ left: 0, top: 0, width: 80, height: 64 });
    expect(placement(w(2, 3, 4, 2), false)).toEqual({ left: 176, top: 216, width: 4 * 88 - 8, height: 2 * 72 - 8 });
  });
  it("pixel: the numbers are pixels", () => {
    expect(placement(w(10, 20, 300, 150), true)).toEqual({ left: 10, top: 20, width: 300, height: 150 });
  });
  it("a missing x or y is 0", () => {
    expect(placement({ w: 2, h: 1 }, false)).toMatchObject({ left: 0, top: 0 });
    expect(placement({ w: 2, h: 1 }, true)).toMatchObject({ left: 0, top: 0 });
  });
});

describe("pageExtent", () => {
  it("covers the right and bottom edge of the farthest widgets", () => {
    expect(pageExtent([w(0, 0, 1, 1), w(11, 5, 1, 1)], false)).toEqual({ width: 12 * 88 - 8, height: 6 * 72 - 8 });
    expect(pageExtent([w(100, 40, 300, 150), w(10, 500, 20, 20)], true)).toEqual({ width: 400, height: 520 });
  });
  it("is at least one cell, and an empty page too", () => {
    expect(pageExtent([], false)).toEqual({ width: COL_W, height: ROW_H });
    expect(pageExtent([w(0, 0, 1, 1)], true)).toEqual({ width: COL_W, height: ROW_H });
  });
  it("takes a minimum", () => {
    expect(pageExtent([w(0, 0, 1, 1)], false, PREVIEW_MINIMUM)).toEqual({ width: 1048, height: 424 });
    expect(PREVIEW_MINIMUM).toEqual({ width: 12 * (COL_W + GAP) - GAP, height: 6 * (ROW_H + GAP) - GAP });
  });
});

describe("stageSize", () => {
  it("fixed uses the resolution whatever the widgets cover", () => {
    expect(stageSize({ type: "fixed", width: 1280, height: 720 }, [w(0, 0, 50, 50)], true)).toEqual({ width: 1280, height: 720, fixed: true });
  });
  it("fixed without a size is 1920 by 1080", () => {
    expect(stageSize({ type: "fixed" }, [], false)).toEqual({ width: 1920, height: 1080, fixed: true });
  });
  it("dynamic, or none, is the widgets' extent", () => {
    expect(stageSize({ type: "dynamic" }, [w(1, 1, 2, 2)], false)).toEqual({ width: 3 * 88 - 8, height: 3 * 72 - 8, fixed: false });
    expect(stageSize(undefined, [w(0, 0, 400, 300)], true)).toEqual({ width: 400, height: 300, fixed: false });
  });
});

describe("fitScale", () => {
  const stage = { width: 1000, height: 500 };
  it("fits both directions", () => {
    expect(fitScale(stage, { width: 500, height: 500 })).toBe(0.5);
    expect(fitScale(stage, { width: 2000, height: 700 })).toBe(1.4);
  });
  it("fits only the width when asked", () => {
    expect(fitScale(stage, { width: 2000, height: 100 }, { fitHeight: false })).toBe(2);
  });
  it("never goes above maxScale", () => {
    expect(fitScale(stage, { width: 4000, height: 4000 }, { maxScale: 1 })).toBe(1);
    expect(fitScale(stage, { width: 250, height: 4000 }, { maxScale: 1 })).toBe(0.25);
  });
  it("is 1 before the window is measured", () => {
    expect(fitScale(stage, { width: 0, height: 0 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(1);
  });
});

describe("screen sizes", () => {
  const w = { x: 4, y: 2, w: 6, h: 3 };
  const withLayout = { ...w, layout: { tablet: { x: 0, w: 8 }, phone: { x: 0, y: 5, w: 4, h: 2 } } };

  it.each([[320, "phone"], [639, "phone"], [640, "tablet"], [1023, "tablet"], [1024, "desktop"], [2560, "desktop"]] as const)(
    "%i px wide is a %s", (width, want) => expect(deviceFor(width)).toBe(want));

  it("the desktop is the widget's own x, y, w, h", () => {
    expect(effectivePlacement(withLayout, "desktop")).toEqual({ ...w, hidden: false });
  });

  it("a tablet takes its own fields and inherits the rest from the desktop", () => {
    expect(effectivePlacement(withLayout, "tablet")).toEqual({ x: 0, y: 2, w: 8, h: 3, hidden: false });
  });

  it("a phone takes its own, then the tablet's, then the desktop's, one field at a time", () => {
    expect(effectivePlacement({ ...w, layout: { tablet: { w: 8 }, phone: { y: 9 } } }, "phone")).toEqual({ x: 4, y: 9, w: 8, h: 3, hidden: false });
  });

  it("a widget with no layouts sits the same on every device", () => {
    for (const d of ["desktop", "tablet", "phone"] as const) expect(effectivePlacement(w, d)).toEqual({ ...w, hidden: false });
  });

  it("hidden follows the nearest layout that says so: a phone can show what the tablet hides", () => {
    const a = { ...w, layout: { tablet: { hidden: true } } };
    expect(effectivePlacement(a, "tablet").hidden).toBe(true);
    expect(effectivePlacement(a, "phone").hidden).toBe(true);
    expect(effectivePlacement(a, "desktop").hidden).toBe(false);
    expect(effectivePlacement({ ...w, layout: { tablet: { hidden: true }, phone: { hidden: false } } }, "phone").hidden).toBe(false);
  });

  it("forDevice drops hidden widgets for a screen and keeps them, marked, for the editor", () => {
    const list = [{ id: "a", ...w }, { id: "b", ...w, layout: { phone: { hidden: true } } }];
    expect(forDevice(list, "phone").map((x) => x.id)).toEqual(["a"]);
    const kept = forDevice(list, "phone", true);
    expect(kept.map((x) => [x.id, x.hiddenOnDevice])).toEqual([["a", undefined], ["b", true]]);
    expect(forDevice(list, "desktop")).toBe(list);
  });

  describe("placeFor stores a change where it belongs", () => {
    it("on the desktop it is the widget's own field", () => {
      expect(placeFor(withLayout, "desktop", { x: 7 })).toEqual({ x: 7 });
    });
    it("on a tablet it goes into the tablet layout", () => {
      expect(placeFor(w, "tablet", { x: 1, w: 8 })).toEqual({ layout: { tablet: { x: 1, w: 8 } } });
    });
    it("a field equal to what is inherited is not stored, so it keeps following the larger size", () => {
      expect(placeFor({ ...w, layout: { tablet: { x: 1 } } }, "tablet", { x: 4 })).toEqual({ layout: undefined });
      expect(placeFor({ ...w, layout: { tablet: { w: 8 } } }, "phone", { w: 8 })).toEqual({ layout: { tablet: { w: 8 } } });
    });
    it("hiding and showing", () => {
      expect(placeFor(w, "phone", { hidden: true })).toEqual({ layout: { phone: { hidden: true } } });
      expect(placeFor({ ...w, layout: { phone: { hidden: true } } }, "phone", { hidden: false })).toEqual({ layout: undefined });
    });
    it("other layouts are left alone", () => {
      expect(placeFor(withLayout, "phone", { y: 6 })).toEqual({ layout: { tablet: { x: 0, w: 8 }, phone: { x: 0, y: 6, w: 4, h: 2 } } });
    });
  });
});

describe("custom widget stacks", () => {
  const nav = { mode: "stack" as const, direction: "column" as const, gap: 4, phone: { direction: "row" as const } };

  it("a free layout is not a stack", () => {
    expect(stackFor(undefined, "desktop")).toBeNull();
    expect(stackFor({ mode: "free", direction: "row" }, "desktop")).toBeNull();
  });

  it("fills what the layout leaves out with defaults", () => {
    expect(stackFor({ mode: "stack" }, "desktop")).toEqual({ direction: "row", gap: 8, padding: 0, justify: "start", align: "stretch", wrap: false });
  });

  it("a smaller screen replaces a field and inherits the rest", () => {
    expect(stackFor(nav, "desktop")).toMatchObject({ direction: "column", gap: 4 });
    expect(stackFor(nav, "tablet")).toMatchObject({ direction: "column", gap: 4 });
    expect(stackFor(nav, "phone")).toMatchObject({ direction: "row", gap: 4 });
  });

  it("a phone inherits from the tablet before the desktop", () => {
    const l = { mode: "stack" as const, direction: "column" as const, tablet: { gap: 2, direction: "row" as const }, phone: { gap: 1 } };
    expect(stackFor(l, "phone")).toMatchObject({ direction: "row", gap: 1 });
  });

  it("the container's CSS", () => {
    const css = stackStyle(stackFor({ mode: "stack", direction: "column", justify: "between", align: "center", wrap: true, padding: 6 }, "desktop")!);
    expect(css).toMatchObject({ display: "flex", flexDirection: "column", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: 6 });
  });

  describe("a part's CSS", () => {
    const row = stackFor({ mode: "stack", direction: "row" }, "desktop")!;
    const col = stackFor({ mode: "stack", direction: "column", align: "center" }, "desktop")!;
    it("keeps its grid size along the direction", () => {
      expect(partStyle({ w: 2, h: 1 }, row, "desktop")).toMatchObject({ flex: "0 1 168px" });
      expect(partStyle({ w: 2, h: 1 }, col, "desktop")).toMatchObject({ flex: "0 1 64px", width: 168 });
    });
    it("a basis in pixels wins, and grow shares the free room", () => {
      expect(partStyle({ w: 2, h: 1, flex: { basis: 240 } }, row, "desktop")).toMatchObject({ flex: "0 1 240px" });
      expect(partStyle({ w: 2, h: 1, flex: { grow: 1 } }, row, "desktop")).toMatchObject({ flex: "1 1 0px" });
      expect(partStyle({ w: 2, h: 1, flex: { grow: 2, basis: 100 } }, row, "desktop")).toMatchObject({ flex: "2 1 100px" });
    });
    it("grow and basis can differ on a smaller screen and inherit the rest", () => {
      const p = { w: 2, h: 1, flex: { basis: 220, phone: { grow: 1 } } };
      expect(partStyle(p, row, "desktop")).toMatchObject({ flex: "0 1 220px" });
      expect(partStyle(p, row, "tablet")).toMatchObject({ flex: "0 1 220px" });
      expect(partStyle(p, row, "phone")).toMatchObject({ flex: "1 1 220px" });
      expect(partStyle({ w: 2, h: 1, flex: { grow: 1, tablet: { grow: 0, basis: 90 } } }, row, "phone")).toMatchObject({ flex: "0 1 90px" });
    });
    it("is left out on the screen sizes it names", () => {
      const clock = { w: 2, h: 1, hiddenOn: ["phone" as const] };
      expect(partStyle(clock, row, "phone")).toBeNull();
      expect(partStyle(clock, row, "tablet")).not.toBeNull();
      expect(partStyle(clock, row, "desktop")).not.toBeNull();
    });
  });
});

describe("frame slots", () => {
  const header = { edge: "top" as const, size: 60, phone: { size: 52 } };
  const nav = { edge: "left" as const, size: 208, devices: ["desktop" as const, "tablet" as const] };
  const bottom = { edge: "bottom" as const, size: 64, devices: ["phone" as const] };

  it("a slot has its own edge and size on the desktop", () => {
    expect(slotFor(header, "desktop")).toEqual({ edge: "top", size: 60 });
  });

  it("a smaller screen replaces a field and inherits the rest", () => {
    expect(slotFor(header, "tablet")).toEqual({ edge: "top", size: 60 });
    expect(slotFor(header, "phone")).toEqual({ edge: "top", size: 52 });
    expect(slotFor({ ...nav, tablet: { edge: "top", size: 72 } }, "phone")).toBeNull();
    expect(slotFor({ edge: "left", size: 200, tablet: { edge: "top", size: 72 } }, "phone")).toEqual({ edge: "top", size: 72 });
  });

  it("a slot is left out of the screen sizes it does not list", () => {
    expect(slotFor(nav, "phone")).toBeNull();
    expect(slotFor(bottom, "desktop")).toBeNull();
    expect(slotFor(bottom, "phone")).toEqual({ edge: "bottom", size: 64 });
  });

  it("slotsByEdge groups what a device draws, in the project's order", () => {
    const slots = [{ id: "h", ...header }, { id: "n", ...nav }, { id: "b", ...bottom }, { id: "h2", edge: "top" as const, size: 20 }];
    const desktop = slotsByEdge(slots, "desktop");
    expect(desktop.top.map((x) => x.slot.id)).toEqual(["h", "h2"]);
    expect(desktop.left.map((x) => [x.slot.id, x.size])).toEqual([["n", 208]]);
    expect(desktop.bottom).toEqual([]);
    const phone = slotsByEdge(slots, "phone");
    expect(phone.left).toEqual([]);
    expect(phone.bottom.map((x) => x.slot.id)).toEqual(["b"]);
    expect(phone.top.map((x) => x.size)).toEqual([52, 20]);
  });
});
