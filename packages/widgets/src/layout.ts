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

// ── Custom widget stacks ─────────────────────────────────────────────────

/** A custom widget's stack as it applies on one screen size. */
export type StackSpec = {
  direction: "row" | "column";
  gap: number;
  padding: number;
  justify: "start" | "center" | "end" | "between";
  align: "start" | "center" | "end" | "stretch";
  wrap: boolean;
};

type StackFields = Partial<StackSpec>;
/** What the stack needs of a custom widget's layout (the generated type satisfies it). */
export type StackLayoutLike = StackFields & {
  mode?: "free" | "stack";
  tablet?: StackFields;
  phone?: StackFields;
};

const STACK_DEFAULTS: StackSpec = { direction: "row", gap: 8, padding: 0, justify: "start", align: "stretch", wrap: false };

/** The stack settings on a device, each field from that device's own settings, else from the next
 *  size up (a phone from the tablet, the tablet from the desktop); null when the layout is free. */
export function stackFor(layout: StackLayoutLike | undefined, device: Device): StackSpec | null {
  if (layout?.mode !== "stack") return null;
  const chain: (StackFields | undefined)[] = [...(device === "phone" ? [layout.phone, layout.tablet] : device === "tablet" ? [layout.tablet] : []), layout];
  const out: Record<string, unknown> = { ...STACK_DEFAULTS };
  for (const key of Object.keys(STACK_DEFAULTS)) {
    for (const c of chain) {
      const v = (c as Record<string, unknown> | undefined)?.[key];
      if (v !== undefined) { out[key] = v; break; }
    }
  }
  return out as StackSpec;
}

const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;

/** The CSS of the stack container. */
export function stackStyle(s: StackSpec): Record<string, string | number> {
  return {
    display: "flex", flexDirection: s.direction, flexWrap: s.wrap ? "wrap" : "nowrap",
    gap: s.gap, padding: s.padding, justifyContent: JUSTIFY[s.justify], alignItems: ALIGN[s.align],
  };
}

/** What a stack needs of a part. */
type FlexFields = { grow?: number; basis?: number };
export type StackPart = Placeable & { flex?: FlexFields & { tablet?: FlexFields; phone?: FlexFields }; hiddenOn?: readonly ("tablet" | "phone")[] };

/** The CSS of one part in a stack, or null when it is left out on this device. A part keeps the
 *  size it has in grid units unless it says a basis (pixels along the direction) or a share of
 *  the free room (grow). */
export function partStyle(part: StackPart, spec: StackSpec, device: Device): Record<string, string | number> | null {
  if (device !== "desktop" && part.hiddenOn?.includes(device)) return null;
  const box = placement({ w: part.w, h: part.h }, false);
  const row = spec.direction === "row";
  const natural = row ? box.width : box.height;
  // grow and basis each come from the device's own settings, else the next size up
  const chain = [...(device === "phone" ? [part.flex?.phone, part.flex?.tablet] : device === "tablet" ? [part.flex?.tablet] : []), part.flex];
  const pick = (key: "grow" | "basis") => chain.find((c) => c?.[key] !== undefined)?.[key];
  const grow = pick("grow") ?? 0;
  const basis = pick("basis") ? pick("basis")! : grow > 0 ? 0 : natural;
  const style: Record<string, string | number> = { flex: `${grow} 1 ${basis}px`, minWidth: 0, minHeight: 0 };
  if (spec.align !== "stretch") style[row ? "height" : "width"] = row ? box.height : box.width;
  return style;
}

// ── Frame slots ──────────────────────────────────────────────────────────

export type FrameEdge = "top" | "right" | "bottom" | "left";

/** What the frame needs of a slot (the generated type satisfies it). */
export type SlotLike = {
  edge: FrameEdge;
  size: number;
  devices?: readonly Device[];
  tablet?: { edge?: FrameEdge; size?: number };
  phone?: { edge?: FrameEdge; size?: number };
};

/** Where a slot sits on a device, or null when it is not drawn there. Each field comes from the
 *  device's own override, else the next size up (a phone from the tablet, the tablet from the desktop). */
export function slotFor(slot: SlotLike, device: Device): { edge: FrameEdge; size: number } | null {
  if (slot.devices && !slot.devices.includes(device)) return null;
  const chain = device === "phone" ? [slot.phone, slot.tablet] : device === "tablet" ? [slot.tablet] : [];
  return {
    edge: chain.find((c) => c?.edge !== undefined)?.edge ?? slot.edge,
    size: chain.find((c) => c?.size !== undefined)?.size ?? slot.size,
  };
}

/** The slots a device draws, by edge, in the order the project lists them. */
export function slotsByEdge<S extends SlotLike>(slots: readonly S[], device: Device): Record<FrameEdge, { slot: S; size: number }[]> {
  const out: Record<FrameEdge, { slot: S; size: number }[]> = { top: [], right: [], bottom: [], left: [] };
  for (const slot of slots) {
    const at = slotFor(slot, device);
    if (at) out[at.edge].push({ slot, size: at.size });
  }
  return out;
}

// ── Custom widgets with a designed size ─────────────────────────────────────
// A custom widget given a width and a height is drawn in that box, its parts in pixels. Placed on a
// page it is scaled to fit the place it is given (fitInBox); pinned to a screen edge its parts keep
// their size and follow their anchors (anchoredStyle), so a header spans any width.

/** The uniform scale that fits a design into a box, and where the scaled design sits so that it is
 *  centered. A box with no size yet gives scale 1. */
export function fitInBox(design: Size, box: Size): { scale: number; left: number; top: number } {
  if (!(box.width > 0 && box.height > 0) || !(design.width > 0 && design.height > 0)) return { scale: 1, left: 0, top: 0 };
  const scale = Math.min(box.width / design.width, box.height / design.height);
  return { scale, left: (box.width - design.width * scale) / 2, top: (box.height - design.height * scale) / 2 };
}

export type AnchorXLike = "left" | "right" | "center" | "stretch";
export type AnchorYLike = "top" | "bottom" | "center" | "stretch";
export type AnchoredPart = { x: number; y: number; w: number; h: number; anchorX?: AnchorXLike; anchorY?: AnchorYLike };

/** CSS that places a part inside a box of any size, measured from the designed box: it keeps its
 *  distance from the edge or the middle its anchor names, and its size, unless it stretches, when it
 *  keeps its distance from both edges. */
export function anchoredStyle(p: AnchoredPart, design: Size): Record<string, string> {
  const css: Record<string, string> = { position: "absolute" };
  const axis = (anchor: string, pos: number, size: number, total: number, start: "left" | "top", end: "right" | "bottom", dim: "width" | "height") => {
    if (anchor === end) { css[end] = `${total - pos - size}px`; css[dim] = `${size}px`; }
    else if (anchor === "center") { css[start] = `calc(50% + ${pos - total / 2}px)`; css[dim] = `${size}px`; }
    else if (anchor === "stretch") { css[start] = `${pos}px`; css[end] = `${total - pos - size}px`; }
    else { css[start] = `${pos}px`; css[dim] = `${size}px`; }
  };
  axis(p.anchorX ?? "left", p.x, p.w, design.width, "left", "right", "width");
  axis(p.anchorY ?? "top", p.y, p.h, design.height, "top", "bottom", "height");
  return css;
}
