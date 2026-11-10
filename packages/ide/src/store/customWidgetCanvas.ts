// The drawing area of the custom widget editor, kept apart from the screen so it can be tested.
//
// A free-layout custom widget places its parts as fractions of the size it is given on a page
// (packages/widgets, CustomWidgetView), and its parts' x, y, w and h are in the project's canvas
// units: grid cells, or pixels in a pixel project. So the editor works in those units too, and in
// a pixel project it draws the box the widget really has on a page.
import { COL_W, GAP, ROW_H } from "@speths-screens/widgets";
import type { Project } from "@speths-screens/shared-types";

export type EditorCanvas = {
  /** True in a pixel project: a unit is one pixel. Otherwise a unit is one grid cell. */
  pixel: boolean;
  /** The box the parts are placed in, in units. */
  cols: number;
  rows: number;
  /** How many screen pixels one unit is drawn with. */
  unit: number;
  /** Pixel projects: the box is the size the widget has on a page (false: it is on no page yet). */
  placed: boolean;
};

/** The grid editor's box, and the cell size it is drawn with when it fits. */
export const GRID_COLS = 12, GRID_ROWS = 8, GRID_CELL = 72;
/** A pixel project's box for a custom widget that is on no page yet. */
export const UNPLACED: Size = { w: 480, h: 320 };
/** The room the box is fitted into. */
const VIEW: Size = { w: GRID_COLS * GRID_CELL, h: GRID_ROWS * GRID_CELL };
/** A small pixel design is drawn up to twice its size, so its parts can be grabbed. */
const MAX_PIXEL_ZOOM = 2;
/** The smallest part a drag or a field can make. */
const MIN_PIXELS = 8;

type Size = { w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };
type ProjectLike = Pick<Project, "canvasSnap" | "pages" | "customWidgets">;

/** The box that holds every part. */
export function partsExtent(parts: readonly Rect[]): Size {
  return parts.reduce((s, p) => ({ w: Math.max(s.w, p.x + p.w), h: Math.max(s.h, p.y + p.h) }), { w: 0, h: 0 });
}

/** The size the custom widget is given where it is used: on pages, and inside other free-layout
 *  custom widgets (a stack sizes its parts itself). The most common size wins, the first on a tie. */
export function placedSize(project: ProjectLike, id: string): Size | null {
  const sizes: Size[] = [];
  const take = (w: { type: string; w: number; h: number; props?: unknown }) => {
    if (w.type === "customWidget" && (w.props as { customWidgetId?: string } | undefined)?.customWidgetId === id) sizes.push({ w: w.w, h: w.h });
  };
  for (const page of project.pages) page.widgets.forEach(take);
  for (const cw of project.customWidgets ?? []) if (cw.layout?.mode !== "stack") cw.widgets.forEach(take);
  const count = new Map<string, number>();
  let best: Size | null = null;
  for (const s of sizes) {
    const key = `${s.w}x${s.h}`;
    const n = (count.get(key) ?? 0) + 1;
    count.set(key, n);
    if (!best || n > count.get(`${best.w}x${best.h}`)!) best = s;
  }
  return best;
}

/** The editor's drawing area for a custom widget of this project. Parts already outside the usual
 *  box widen it, so nothing a project holds is drawn out of sight. */
export function editorCanvas(project: ProjectLike, id: string, parts: readonly Rect[]): EditorCanvas {
  const extent = partsExtent(parts);
  if (project.canvasSnap !== "pixel") {
    const cols = Math.max(GRID_COLS, Math.ceil(extent.w));
    const rows = Math.max(GRID_ROWS, Math.ceil(extent.h));
    return { pixel: false, cols, rows, unit: Math.min(GRID_CELL, VIEW.w / cols, VIEW.h / rows), placed: false };
  }
  const placed = placedSize(project, id);
  const base = placed ?? UNPLACED;
  const cols = Math.max(base.w, Math.ceil(extent.w));
  const rows = Math.max(base.h, Math.ceil(extent.h));
  return { pixel: true, cols, rows, unit: Math.min(MAX_PIXEL_ZOOM, VIEW.w / cols, VIEW.h / rows), placed: !!placed };
}

/** A part's place kept whole and inside the box: at least the smallest size, never past an edge. */
export function clampPart<R extends Rect>(part: R, canvas: EditorCanvas): R {
  const min = canvas.pixel ? Math.min(MIN_PIXELS, canvas.cols, canvas.rows) : 1;
  const w = Math.round(Math.max(min, Math.min(canvas.cols, part.w)));
  const h = Math.round(Math.max(min, Math.min(canvas.rows, part.h)));
  const x = Math.round(Math.max(0, Math.min(canvas.cols - w, part.x)));
  const y = Math.round(Math.max(0, Math.min(canvas.rows - h, part.y)));
  return { ...part, x, y, w, h };
}

/** A part moved by a drag of (dx, dy) screen pixels from where it started. */
export function movePartBy<R extends Rect>(start: R, dx: number, dy: number, canvas: EditorCanvas): R {
  return clampPart({ ...start, x: start.x + dx / canvas.unit, y: start.y + dy / canvas.unit }, canvas);
}

/** A part resized by a drag of its corner by (dx, dy) screen pixels; its top left stays put. */
export function resizePartBy<R extends Rect>(start: R, dx: number, dy: number, canvas: EditorCanvas): R {
  const min = canvas.pixel ? Math.min(MIN_PIXELS, canvas.cols, canvas.rows) : 1;
  const w = Math.max(min, Math.min(canvas.cols - start.x, Math.round(start.w + dx / canvas.unit)));
  const h = Math.max(min, Math.min(canvas.rows - start.y, Math.round(start.h + dy / canvas.unit)));
  return { ...start, w, h };
}

/** The size a new part starts with: its type's size in cells, as pixels in a pixel project. */
export function newPartSize(cellsW: number, cellsH: number, canvas: EditorCanvas): Size {
  if (!canvas.pixel) return { w: Math.min(cellsW, canvas.cols), h: Math.min(cellsH, canvas.rows) };
  return {
    w: Math.min(cellsW * (COL_W + GAP) - GAP, canvas.cols),
    h: Math.min(cellsH * (ROW_H + GAP) - GAP, canvas.rows),
  };
}

/** Where the editor draws its guide lines, in units: every cell, or every 20 pixels. */
export function guideLines(canvas: EditorCanvas): { xs: number[]; ys: number[] } {
  const step = canvas.pixel ? 20 : 1;
  const upTo = (n: number) => { const out: number[] = []; for (let v = 0; v < n; v += step) out.push(v); out.push(n); return out; };
  return { xs: upTo(canvas.cols), ys: upTo(canvas.rows) };
}

/** What the editor says above the box. */
export function canvasCaption(canvas: EditorCanvas): string {
  if (!canvas.pixel) return `${canvas.cols} × ${canvas.rows} grid — drag to place`;
  const size = `${canvas.cols} × ${canvas.rows} px`;
  return canvas.placed ? `${size}, the size it has on a page — drag to place` : `${size} (it is on no page yet) — drag to place`;
}
