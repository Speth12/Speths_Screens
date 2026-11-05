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
export function placement<W extends Placeable>(w: W, pixel: boolean): Box {
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

// ── Screen sizes ─────────────────────────────────────────────────────────

/** A screen size. desktop is the layout in a widget's own x, y, w and h. */
export type Device = "desktop" | "tablet" | "phone";

/** A window under this width is a tablet, and under PHONE_MAX a phone. */
export const TABLET_MAX = 1024;
export const PHONE_MAX = 640;

export function deviceFor(width: number): Device {
  return width < PHONE_MAX ? "phone" : width < TABLET_MAX ? "tablet" : "desktop";
}

/** The width the editor draws a device's screen at. */
export const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 820, phone: 390 };

type PlacementFields = { x?: number; y?: number; w?: number; h?: number; hidden?: boolean };
type WithLayouts = { x?: number; y?: number; w: number; h: number; layout?: { tablet?: PlacementFields; phone?: PlacementFields } };

/** Where a widget sits on a device: each field from the device's own layout, else the next size
 *  up (a phone inherits from the tablet, then the desktop). */
export function effectivePlacement(w: WithLayouts, device: Device): { x: number; y: number; w: number; h: number; hidden: boolean } {
  const chain: PlacementFields[] = [...(device === "desktop" ? [] : device === "tablet" ? [w.layout?.tablet] : [w.layout?.phone, w.layout?.tablet]), w]
    .filter((c): c is PlacementFields => !!c);
  const pick = <K extends "x" | "y" | "w" | "h">(k: K, fallback: number): number => {
    for (const c of chain) if (c[k] !== undefined) return c[k] as number;
    return fallback;
  };
  // hidden is only a setting of a smaller device's layout, and the nearest one that says wins.
  const hiddenIn = (device === "desktop" ? [] : device === "tablet" ? [w.layout?.tablet] : [w.layout?.phone, w.layout?.tablet]).find((c) => c?.hidden !== undefined);
  return { x: pick("x", 0), y: pick("y", 0), w: pick("w", 1), h: pick("h", 1), hidden: hiddenIn?.hidden === true };
}

/** The widgets as they sit on a device. The IDE keeps hidden ones (`keepHidden`) to show them faded
 *  and let them be shown again; a screen drops them. A desktop gets the widgets back as they are. */
export function forDevice<W extends WithLayouts>(widgets: readonly W[], device: Device, keepHidden = false): (W & { hiddenOnDevice?: boolean })[] {
  if (device === "desktop") return widgets as W[];
  const out: (W & { hiddenOnDevice?: boolean })[] = [];
  for (const w of widgets) {
    const p = effectivePlacement(w, device);
    if (p.hidden && !keepHidden) continue;
    out.push({ ...w, x: p.x, y: p.y, w: p.w, h: p.h, ...(p.hidden ? { hiddenOnDevice: true } : {}) });
  }
  return out;
}

/** A change to a widget's x, y, w, h made while editing a device: the layout to store. On the desktop
 *  the fields are the widget's own; on a smaller device they go into that device's layout, and a
 *  field equal to what the device would inherit is not stored, so it keeps following the larger size. */
export function placeFor<W extends WithLayouts>(w: W, device: Device, patch: PlacementFields): Partial<W> {
  if (device === "desktop") {
    const own: Partial<W> = {};
    for (const k of ["x", "y", "w", "h"] as const) if (patch[k] !== undefined) (own as Record<string, unknown>)[k] = patch[k];
    return own;
  }
  const inherited = effectivePlacement(
    { ...w, layout: device === "phone" ? { tablet: w.layout?.tablet } : undefined } as WithLayouts, device === "phone" ? "tablet" : "desktop");
  const mine: PlacementFields = { ...(w.layout?.[device] ?? {}) };
  for (const k of ["x", "y", "w", "h"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v === inherited[k]) delete mine[k]; else mine[k] = v;
  }
  if (patch.hidden !== undefined) { if (patch.hidden) mine.hidden = true; else delete mine.hidden; }
  const layout = { ...(w.layout ?? {}) } as { tablet?: PlacementFields; phone?: PlacementFields };
  if (Object.keys(mine).length) layout[device] = mine; else delete layout[device];
  return { layout: Object.keys(layout).length ? layout : undefined } as unknown as Partial<W>;
}
