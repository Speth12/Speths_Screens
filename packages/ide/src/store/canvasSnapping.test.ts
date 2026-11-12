import { describe, expect, it } from "vitest";
import { boundsOf, resizeCells, snapMove, snapResize, type Rect } from "./canvasSnapping";

const other: Rect = { x: 200, y: 100, w: 100, h: 60 };

describe("moving a widget on a pixel canvas", () => {
  const cases: { name: string; box: Rect; want: { x: number; y: number }; xs: number[]; ys: number[]; free?: boolean; zoom?: number }[] = [
    { name: "lands on the 8 px grid when no neighbor is near", box: { x: 13, y: 21, w: 50, h: 30 }, want: { x: 16, y: 24 }, xs: [], ys: [] },
    { name: "left edge lands on a neighbor's left edge", box: { x: 203, y: 300, w: 50, h: 30 }, want: { x: 200, y: 304 }, xs: [200], ys: [] },
    { name: "right edge lands on a neighbor's left edge", box: { x: 146, y: 300, w: 50, h: 30 }, want: { x: 150, y: 304 }, xs: [200], ys: [] },
    { name: "centers line up", box: { x: 223, y: 300, w: 50, h: 30 }, want: { x: 225, y: 304 }, xs: [250], ys: [] },
    { name: "top edge lands on a neighbor's bottom edge", box: { x: 500, y: 163, w: 50, h: 30 }, want: { x: 504, y: 160 }, xs: [], ys: [160] },
    { name: "an edge does not land on a neighbor's center", box: { x: 500, y: 103, w: 50, h: 30 }, want: { x: 504, y: 100 }, xs: [], ys: [100] },
    { name: "an edge near a center only: the grid", box: { x: 500, y: 128, w: 50, h: 40 }, want: { x: 504, y: 128 }, xs: [], ys: [] },
    { name: "both directions at once", box: { x: 302, y: 98, w: 50, h: 30 }, want: { x: 300, y: 100 }, xs: [300], ys: [100] },
    { name: "Alt held: no snapping, whole pixels", box: { x: 203.4, y: 98.6, w: 50, h: 30 }, want: { x: 203, y: 99 }, xs: [], ys: [], free: true },
    { name: "zoomed in, the reach is fewer canvas units", box: { x: 205, y: 300, w: 50, h: 30 }, want: { x: 208, y: 304 }, xs: [], ys: [], zoom: 2 },
    { name: "never left of or above the canvas", box: { x: -30, y: -9, w: 50, h: 30 }, want: { x: 0, y: 0 }, xs: [], ys: [] },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const got = snapMove(c.box, { others: [other], free: c.free, zoom: c.zoom });
      expect({ x: got.x, y: got.y }).toEqual(c.want);
      expect(got.guides).toEqual({ xs: c.xs, ys: c.ys });
    });
  }

  it("lands on the stage's center and edges", () => {
    const got = snapMove({ x: 477, y: 2, w: 50, h: 30 }, { others: [], stage: { w: 1000, h: 600 } });
    expect(got).toEqual({ x: 475, y: 0, guides: { xs: [500], ys: [0] } });
  });
});

describe("resizing a widget on a pixel canvas", () => {
  const start: Rect = { x: 40, y: 40, w: 100, h: 80 };
  it("the bottom right corner lands on the grid", () => {
    expect(snapResize(start, "br", 13, 5, { others: [] }).rect).toEqual({ x: 40, y: 40, w: 112, h: 88 });
  });
  it("the dragged edge lands on a neighbor's edge, with a guide", () => {
    const got = snapResize(start, "br", 57, 0, { others: [other] });
    expect(got.rect).toEqual({ x: 40, y: 40, w: 160, h: 80 });
    expect(got.guides.xs).toEqual([200]);
  });
  it("the top left corner moves the origin and keeps the opposite corner", () => {
    expect(snapResize(start, "tl", -9, 9, { others: [] }).rect).toEqual({ x: 32, y: 48, w: 108, h: 72 });
  });
  it("never smaller than the smallest size", () => {
    expect(snapResize(start, "br", -500, -500, { others: [] }).rect).toEqual({ x: 40, y: 40, w: 8, h: 8 });
    expect(snapResize(start, "tl", 500, 500, { others: [] }).rect).toEqual({ x: 132, y: 112, w: 8, h: 8 });
  });
  it("Alt held: whole pixels, no guides", () => {
    const got = snapResize(start, "br", 57.4, 3.2, { others: [other], free: true });
    expect(got).toEqual({ rect: { x: 40, y: 40, w: 157, h: 83 }, guides: { xs: [], ys: [] } });
  });
});

describe("resizing on the cell grid", () => {
  const start: Rect = { x: 2, y: 1, w: 3, h: 2 };
  it("grows by whole cells and stops at the last column", () => {
    expect(resizeCells(start, "br", 2, 1, 12)).toEqual({ x: 2, y: 1, w: 5, h: 3 });
    expect(resizeCells(start, "br", 40, 0, 12)).toEqual({ x: 2, y: 1, w: 10, h: 2 });
  });
  it("keeps at least one cell", () => {
    expect(resizeCells(start, "tl", 9, 9, 12)).toEqual({ x: 4, y: 2, w: 1, h: 1 });
  });
});

describe("the box around several widgets", () => {
  it("covers them all", () => {
    expect(boundsOf([{ x: 10, y: 20, w: 30, h: 10 }, { x: 0, y: 25, w: 5, h: 40 }])).toEqual({ x: 0, y: 20, w: 40, h: 45 });
  });
});
