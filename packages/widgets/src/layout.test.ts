import { describe, expect, it } from "vitest";
import { COL_W, GAP, PREVIEW_MINIMUM, ROW_H, fitScale, pageExtent, placement, stageSize } from "./layout";

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
