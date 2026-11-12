// Where a widget lands while it is dragged on a pixel canvas: on a neighbor's edge or center when it
// is close to one, otherwise on a step of the pixel grid. Kept apart from the canvas so it can be tested.

export type Rect = { x: number; y: number; w: number; h: number };
/** Lines to draw while a drag is held on them, in canvas units. */
export type Guides = { xs: number[]; ys: number[] };

/** The pixel grid a drag lands on when no neighbor is near. */
export const SNAP_STEP = 8;
/** How close, in screen pixels, an edge has to come to a neighbor's line to land on it. */
export const SNAP_REACH = 6;
/** The smallest widget a resize can make on a pixel canvas. */
export const MIN_SIZE = 8;

export type Corner = "br" | "bl" | "tr" | "tl";

export type SnapOptions = {
  /** The widgets that stay where they are. */
  others: readonly Rect[];
  /** The stage's own size, when it has one: its edges and center are lines too. */
  stage?: { w: number; h: number };
  /** Screen pixels per canvas unit. */
  zoom?: number;
  /** True while Alt is held: no snapping at all. */
  free?: boolean;
};

const NO_GUIDES: Guides = { xs: [], ys: [] };

/** The box around some rectangles. */
export function boundsOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

/** The lines of the widgets that stay put. Edges and centers are kept apart: an edge lands on an
 *  edge and a center on a center, as in a drawing tool, never an edge on a center. */
type Lines = { edgeX: number[]; midX: number[]; edgeY: number[]; midY: number[] };

function lines(o: SnapOptions): Lines {
  const l: Lines = { edgeX: [], midX: [], edgeY: [], midY: [] };
  for (const r of o.others) {
    l.edgeX.push(r.x, r.x + r.w); l.midX.push(r.x + r.w / 2);
    l.edgeY.push(r.y, r.y + r.h); l.midY.push(r.y + r.h / 2);
  }
  if (o.stage) {
    l.edgeX.push(0, o.stage.w); l.midX.push(o.stage.w / 2);
    l.edgeY.push(0, o.stage.h); l.midY.push(o.stage.h / 2);
  }
  return l;
}

type Hit = { shift: number; line: number } | null;
const closer = (a: Hit, b: Hit): Hit => (!a ? b : !b ? a : Math.abs(b.shift) < Math.abs(a.shift) ? b : a);

/** The nearest line to any of the points, within reach: how far to shift, and the line. */
function nearest(points: readonly number[], candidates: readonly number[], reach: number): Hit {
  let best: Hit = null;
  for (const p of points) for (const c of candidates) {
    const shift = c - p;
    if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, line: c };
  }
  return best;
}

const toStep = (v: number) => Math.round(v / SNAP_STEP) * SNAP_STEP;

/** A dragged box (one widget, or the box around several) moved to where it should land. Returns the
 *  box's new top left and the lines it landed on. */
export function snapMove(box: Rect, o: SnapOptions): { x: number; y: number; guides: Guides } {
  if (o.free) return { x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)), guides: NO_GUIDES };
  const reach = SNAP_REACH / (o.zoom ?? 1);
  const l = lines(o);
  const hx = closer(nearest([box.x, box.x + box.w], l.edgeX, reach), nearest([box.x + box.w / 2], l.midX, reach));
  const hy = closer(nearest([box.y, box.y + box.h], l.edgeY, reach), nearest([box.y + box.h / 2], l.midY, reach));
  const x = Math.round(hx ? box.x + hx.shift : toStep(box.x));
  const y = Math.round(hy ? box.y + hy.shift : toStep(box.y));
  // A box pushed back inside the canvas is no longer on the line it reached for.
  return {
    x: Math.max(0, x), y: Math.max(0, y),
    guides: { xs: hx && x >= 0 ? [hx.line] : [], ys: hy && y >= 0 ? [hy.line] : [] },
  };
}

/** A widget resized by dragging one corner by (dx, dy) canvas units; the opposite corner stays put.
 *  The dragged edges land on a neighbor's line when near one, otherwise on the pixel grid. */
export function snapResize(start: Rect, corner: Corner, dx: number, dy: number, o: SnapOptions): { rect: Rect; guides: Guides } {
  const reach = SNAP_REACH / (o.zoom ?? 1);
  const l = lines(o);
  const xs = o.free ? [] : l.edgeX, ys = o.free ? [] : l.edgeY;
  const guides: Guides = { xs: [], ys: [] };
  const land = (v: number, candidates: readonly number[], into: number[]) => {
    if (o.free) return Math.round(v);
    const hit = nearest([v], candidates, reach);
    if (hit) { into.push(hit.line); return Math.round(hit.line); }
    return toStep(v);
  };

  let left = start.x, right = start.x + start.w, top = start.y, bottom = start.y + start.h;
  if (corner.endsWith("r")) right = Math.max(left + MIN_SIZE, land(right + dx, xs, guides.xs));
  else left = Math.max(0, Math.min(right - MIN_SIZE, land(left + dx, xs, guides.xs)));
  if (corner.startsWith("b")) bottom = Math.max(top + MIN_SIZE, land(bottom + dy, ys, guides.ys));
  else top = Math.max(0, Math.min(bottom - MIN_SIZE, land(top + dy, ys, guides.ys)));

  const rect = { x: left, y: top, w: right - left, h: bottom - top };
  // Keep only the lines an edge really sits on (a clamp may have moved it off).
  return {
    rect,
    guides: {
      xs: guides.xs.filter((l) => l === rect.x || l === rect.x + rect.w),
      ys: guides.ys.filter((l) => l === rect.y || l === rect.y + rect.h),
    },
  };
}

/** The same resize on the cell grid: whole cells, at least one, inside the columns. */
export function resizeCells(start: Rect, corner: Corner, dCols: number, dRows: number, cols: number): Rect {
  let left = start.x, right = start.x + start.w, top = start.y, bottom = start.y + start.h;
  if (corner.endsWith("r")) right = Math.min(cols, Math.max(left + 1, right + dCols));
  else left = Math.max(0, Math.min(right - 1, left + dCols));
  if (corner.startsWith("b")) bottom = Math.max(top + 1, bottom + dRows);
  else top = Math.max(0, Math.min(bottom - 1, top + dRows));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
