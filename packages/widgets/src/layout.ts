// Where widgets sit on a page and how a page is fitted to a window: one set
// of rules for the IDE canvas preview, the HTML export and the operator
// screen (Phase 2 left the operator on its own 12-column grid, which ignored
// the project's canvas settings).
//
// `canvasSnap` "grid": x, y, w and h count cells of COL_W by ROW_H pixels with
// GAP between them. "pixel": they are pixels. `canvasResolution` "fixed" is a
// stage of width by height pixels; "dynamic" is the extent of the widgets.

/** The canvas grid (the IDE canvas draws it): a cell and the gap after it. */
export const COL_W = 80, ROW_H = 64, GAP = 8;

/** The least a page that has to look like a screen measures in the IDE preview: 12 columns by 6 rows of cells. */
export const PREVIEW_MINIMUM: Size = { width: 12 * (COL_W + GAP) - GAP, height: 6 * (ROW_H + GAP) - GAP };

export type Size = { width: number; height: number };
export type Box = Size & { left: number; top: number };
/** What the layout needs of a widget. */
export type Placeable = { x?: number; y?: number; w: number; h: number };
export type CanvasResolutionLike = { type: "dynamic" | "fixed"; width?: number; height?: number };

/** Where a widget sits on its page, in pixels, as the IDE canvas draws it. */
export function placement(w: Placeable, pixel: boolean): Box {
  if (pixel) return { left: w.x ?? 0, top: w.y ?? 0, width: w.w, height: w.h };
  return {
    left: (w.x ?? 0) * (COL_W + GAP),
    top: (w.y ?? 0) * (ROW_H + GAP),
    width: w.w * (COL_W + GAP) - GAP,
    height: w.h * (ROW_H + GAP) - GAP,
  };
}

/** The pixels the widgets cover from the page's top left corner, at least `minimum` (one cell by default). */
export function pageExtent(widgets: readonly Placeable[], pixel: boolean, minimum: Size = { width: COL_W, height: ROW_H }): Size {
  const boxes = widgets.map((w) => placement(w, pixel));
  return {
    width: Math.max(minimum.width, ...boxes.map((b) => b.left + b.width)),
    height: Math.max(minimum.height, ...boxes.map((b) => b.top + b.height)),
  };
}

/** The page's stage in pixels: the fixed resolution, or else the widgets' extent. */
export function stageSize(
  resolution: CanvasResolutionLike | undefined, widgets: readonly Placeable[], pixel: boolean, minimum?: Size,
): Size & { fixed: boolean } {
  if (resolution?.type === "fixed") return { width: resolution.width ?? 1920, height: resolution.height ?? 1080, fixed: true };
  return { ...pageExtent(widgets, pixel, minimum), fixed: false };
}

/**
 * The scale that fits `stage` into `viewport`: both directions by default,
 * only the width with `fitHeight: false`, and never above `maxScale`. A
 * viewport that is not measured yet (zero) gives 1.
 */
export function fitScale(stage: Size, viewport: Size, opts: { maxScale?: number; fitHeight?: boolean } = {}): number {
  const { maxScale = Infinity, fitHeight = true } = opts;
  if (viewport.width <= 0 || viewport.height <= 0 || stage.width <= 0 || stage.height <= 0) return 1;
  const s = fitHeight ? Math.min(viewport.width / stage.width, viewport.height / stage.height) : viewport.width / stage.width;
  return Math.min(s, maxScale);
}
