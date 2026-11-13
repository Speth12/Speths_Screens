import { describe, expect, it } from "vitest";
import type { Project } from "@speths-screens/shared-types";
import {
  GRID_CELL, UNPLACED, canvasCaption, clampPart, editorCanvas, guideLines, movePartBy, newPartSize,
  partsExtent, placedSize, resizePartBy, type EditorCanvas,
} from "./customWidgetCanvas";

type Rect = { x: number; y: number; w: number; h: number };
const use = (id: string, w: number, h: number) => ({ id: `i${w}${h}${Math.random()}`, type: "customWidget", x: 0, y: 0, w, h, props: { customWidgetId: id } });
const project = (over: Partial<Project> = {}): Project => ({
  schemaVersion: 7, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...over,
} as Project);
const pump: Rect[] = [{ x: 12, y: 8, w: 80, h: 72 }, { x: 104, y: 8, w: 184, h: 72 }, { x: 12, y: 90, w: 276, h: 58 }];

const grid: EditorCanvas = { pixel: false, cols: 12, rows: 8, unit: 72, placed: false };
const pixel: EditorCanvas = { pixel: true, cols: 300, rows: 160, unit: 2, placed: true };

describe("partsExtent", () => {
  it.each<[string, Rect[], { w: number; h: number }]>([
    ["no parts", [], { w: 0, h: 0 }],
    ["the far edges of every part", pump, { w: 288, h: 148 }],
  ])("%s", (_, parts, want) => expect(partsExtent(parts)).toEqual(want));
});

describe("placedSize", () => {
  const pages = (...ws: ReturnType<typeof use>[]) => [{ id: "p1", name: "Main", widgets: ws }] as Project["pages"];

  it.each<[string, Project, { w: number; h: number } | null]>([
    ["on no page", project(), null],
    ["another custom widget's instances do not count", project({ pages: pages(use("other", 500, 500)) }), null],
    ["the size it has on a page", project({ pages: pages(use("cw", 300, 160)) }), { w: 300, h: 160 }],
    ["the most common size", project({ pages: pages(use("cw", 339, 170), use("cw", 300, 160), use("cw", 300, 160)) }), { w: 300, h: 160 }],
    ["the first size on a tie", project({ pages: pages(use("cw", 339, 170), use("cw", 300, 160)) }), { w: 339, h: 170 }],
    ["inside a free-layout custom widget", project({ customWidgets: [{ id: "outer", name: "Outer", params: [], widgets: [{ ...use("cw", 200, 100), localId: "a" }] }] as unknown as Project["customWidgets"] }), { w: 200, h: 100 }],
    ["not inside a stack, which sizes its parts itself", project({ customWidgets: [{ id: "outer", name: "Outer", params: [], layout: { mode: "stack" }, widgets: [{ ...use("cw", 200, 100), localId: "a" }] }] as unknown as Project["customWidgets"] }), null],
  ])("%s", (_, p, want) => expect(placedSize(p, "cw")).toEqual(want));
});

describe("editorCanvas", () => {
  const onPage = project({ canvasSnap: "pixel", pages: [{ id: "p1", name: "Main", widgets: [use("cw", 300, 160)] }] as Project["pages"] });

  it.each<[string, Project, Rect[], EditorCanvas]>([
    ["a grid project: 12 by 8 cells at full size", project(), [{ x: 0, y: 0, w: 3, h: 1 }], { pixel: false, cols: 12, rows: 8, unit: GRID_CELL, placed: false }],
    ["a grid project with no snap setting is a grid project", project({ canvasSnap: undefined }), [], { pixel: false, cols: 12, rows: 8, unit: GRID_CELL, placed: false }],
    ["a grid part past the box widens it, drawn smaller to fit", project(), [{ x: 14, y: 0, w: 4, h: 1 }], { pixel: false, cols: 18, rows: 8, unit: 48, placed: false }],
    ["a pixel project: the size on the page, drawn at twice the size", onPage, pump, { pixel: true, cols: 300, rows: 160, unit: 2, placed: true }],
    ["a pixel project, on no page yet", project({ canvasSnap: "pixel" }), [], { pixel: true, cols: UNPLACED.w, rows: UNPLACED.h, unit: 1.8, placed: false }],
    ["pixel parts past the placed size widen the box", onPage, [{ x: 0, y: 0, w: 400, h: 100 }], { pixel: true, cols: 400, rows: 160, unit: 2, placed: true }],
    ["a wide pixel design is drawn smaller to fit", project({ canvasSnap: "pixel", pages: [{ id: "p1", name: "Main", widgets: [use("cw", 1728, 64)] }] as Project["pages"] }), [], { pixel: true, cols: 1728, rows: 64, unit: 0.5, placed: true }],
  ])("%s", (_, p, parts, want) => expect(editorCanvas(p, "cw", parts)).toEqual(want));

  it("keeps every part of the feature tour's pump card inside the box (it used to draw them as cells, out of sight)", () => {
    const c = editorCanvas(onPage, "cw", pump);
    for (const p of pump) {
      expect(p.x + p.w).toBeLessThanOrEqual(c.cols);
      expect(p.y + p.h).toBeLessThanOrEqual(c.rows);
    }
  });
});

describe("clampPart", () => {
  it.each<[string, Rect, EditorCanvas, Rect]>([
    ["inside the box: unchanged", { x: 1, y: 1, w: 3, h: 2 }, grid, { x: 1, y: 1, w: 3, h: 2 }],
    ["past the right and bottom: moved back in", { x: 11, y: 7, w: 3, h: 2 }, grid, { x: 9, y: 6, w: 3, h: 2 }],
    ["negative: at the corner", { x: -4, y: -1, w: 3, h: 2 }, grid, { x: 0, y: 0, w: 3, h: 2 }],
    ["larger than the box: the box", { x: 0, y: 0, w: 40, h: 40 }, grid, { x: 0, y: 0, w: 12, h: 8 }],
    ["a grid part is at least one cell", { x: 2, y: 2, w: 0, h: 0 }, grid, { x: 2, y: 2, w: 1, h: 1 }],
    ["a pixel part is at least 8 px", { x: 10, y: 10, w: 1, h: 0 }, pixel, { x: 10, y: 10, w: 8, h: 8 }],
    ["fractions are rounded to whole units", { x: 10.4, y: 10.6, w: 20.5, h: 19.2 }, pixel, { x: 10, y: 11, w: 21, h: 19 }],
  ])("%s", (_, part, canvas, want) => expect(clampPart(part, canvas)).toEqual(want));

  it("keeps the part's other fields", () => {
    expect(clampPart({ x: 99, y: 0, w: 2, h: 1, localId: "a", type: "led" }, grid)).toEqual({ x: 10, y: 0, w: 2, h: 1, localId: "a", type: "led" });
  });
});

describe("dragging", () => {
  it.each<[string, EditorCanvas, Rect, [number, number], Rect]>([
    ["grid: a cell per 72 px", grid, { x: 1, y: 1, w: 2, h: 1 }, [144, 72], { x: 3, y: 2, w: 2, h: 1 }],
    ["grid: less than half a cell does not move it", grid, { x: 1, y: 1, w: 2, h: 1 }, [30, -30], { x: 1, y: 1, w: 2, h: 1 }],
    ["pixel: screen pixels divided by the zoom", pixel, { x: 12, y: 8, w: 80, h: 72 }, [40, 20], { x: 32, y: 18, w: 80, h: 72 }],
    ["stops at the edge of the box", pixel, { x: 12, y: 8, w: 80, h: 72 }, [9000, 9000], { x: 220, y: 88, w: 80, h: 72 }],
  ])("moving, %s", (_, canvas, start, [dx, dy], want) => expect(movePartBy(start, dx, dy, canvas)).toEqual(want));

  it.each<[string, EditorCanvas, Rect, [number, number], Rect]>([
    ["grid: a cell per 72 px", grid, { x: 1, y: 1, w: 2, h: 1 }, [72, 144], { x: 1, y: 1, w: 3, h: 3 }],
    ["pixel: screen pixels divided by the zoom", pixel, { x: 12, y: 8, w: 80, h: 72 }, [40, -20], { x: 12, y: 8, w: 100, h: 62 }],
    ["never past the box, from where the part sits", pixel, { x: 12, y: 8, w: 80, h: 72 }, [9000, 9000], { x: 12, y: 8, w: 288, h: 152 }],
    ["never smaller than the least size", pixel, { x: 12, y: 8, w: 80, h: 72 }, [-9000, -9000], { x: 12, y: 8, w: 8, h: 8 }],
  ])("resizing, %s", (_, canvas, start, [dx, dy], want) => expect(resizePartBy(start, dx, dy, canvas)).toEqual(want));
});

describe("newPartSize", () => {
  it.each<[string, [number, number], EditorCanvas, { w: number; h: number }]>([
    ["grid: the type's size in cells", [3, 1], grid, { w: 3, h: 1 }],
    ["pixel: the same cells as pixels of the page grid", [2, 2], pixel, { w: 168, h: 136 }],
    ["pixel: no larger than the box", [6, 4], pixel, { w: 300, h: 160 }],
  ])("%s", (_, [w, h], canvas, want) => expect(newPartSize(w, h, canvas)).toEqual(want));
});

describe("guideLines and canvasCaption", () => {
  it("a grid has a line per cell and both edges", () => {
    const g = guideLines(grid);
    expect(g.xs).toHaveLength(13);
    expect(g.ys).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("a pixel box has a line every 20 px and its far edges", () => {
    const g = guideLines(pixel);
    expect(g.xs.slice(0, 3)).toEqual([0, 20, 40]);
    expect(g.xs.at(-1)).toBe(300);
    expect(g.ys.at(-1)).toBe(160);
    expect(g.xs.length).toBeLessThan(20);
  });

  it.each<[string, EditorCanvas, string]>([
    ["grid", grid, "12 × 8 grid — drag to place"],
    ["pixel, on a page", pixel, "300 × 160 px, the size it has on a page — drag to place"],
    ["pixel, on no page", { ...pixel, placed: false }, "300 × 160 px (it is on no page yet) — drag to place"],
  ])("says what the box is: %s", (_, canvas, want) => expect(canvasCaption(canvas)).toBe(want));
});
