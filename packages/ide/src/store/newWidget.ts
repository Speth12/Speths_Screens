// A new widget from the palette: what it starts as, and where it goes. A click puts it in the middle
// of the part of the page that is in view, so it never lands where it cannot be seen; a drag puts it
// where it is dropped.
import { COL_W, GAP, ROW_H, type WidgetManifest } from "@speths-screens/widgets";
import { SNAP_STEP, type Rect } from "./canvasSnapping";
import { convertWidget } from "./presets";
import { newWidgetId, type Widget } from "./projectStore";

/** What a drag from the palette carries: the widget type. */
export const PALETTE_DRAG = "text/x-widget-type";

const COLS = 12;
const COL_PITCH = COL_W + GAP, ROW_PITCH = ROW_H + GAP;
/** How far a new widget is put from one already at the same spot, so both can be seen. */
const CASCADE = 16;

/** The widget a manifest starts as (its defaults, its size in the project's units), at 0,0. */
export function newWidget(m: WidgetManifest, pixel: boolean): Widget {
  // Default sizes are grid cells; a pixel canvas gets them in pixels.
  const base = { id: newWidgetId(), type: m.type, x: 0, y: 0, w: m.defaultSize.w, h: m.defaultSize.h } as Widget;
  const sized = pixel ? convertWidget(base, "pixel") : base;
  // A new widget starts with its manifest's defaults (a button writes 1 while pressed).
  return { ...sized, ...structuredClone(m.defaults) } as Widget;
}

/** A new widget's size held inside a custom widget's designed box (a header 60 px high gets a button
 *  no taller than that); on a page, or a custom widget with no size, it is left as it is. */
export function fitNewWidget<W extends { w: number; h: number }>(w: W, box: { width?: number; height?: number } | undefined): W {
  if (!box?.width || !box.height) return w;
  return { ...w, w: Math.max(1, Math.min(w.w, box.width)), h: Math.max(1, Math.min(w.h, box.height)) };
}

/** The part of the page in view, in canvas pixels at full size, or null when it cannot be told
 *  (no canvas on screen). The canvas marks its page and its scrolling area for this. */
export function visibleCanvasRect(doc: Document = document): Rect | null {
  const page = doc.querySelector<HTMLElement>("[data-canvas-page]");
  const scroller = page?.closest<HTMLElement>("[data-canvas-scroll]");
  if (!page || !scroller) return null;
  const zoom = Number(page.dataset.zoom) || 1;
  const p = page.getBoundingClientRect(), s = scroller.getBoundingClientRect();
  const left = Math.max(p.left, s.left), top = Math.max(p.top, s.top);
  const right = Math.min(p.right, s.right), bottom = Math.min(p.bottom, s.bottom);
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: (left - p.left) / zoom, y: (top - p.top) / zoom, w: (right - left) / zoom, h: (bottom - top) / zoom };
}

/** Where a new widget of this size goes: the middle of what is in view, stepped aside from a widget
 *  already exactly there. With nothing known about the view it goes under the lowest widget, at the left. */
export function placeNew(view: Rect | null, size: { w: number; h: number }, existing: readonly Rect[], pixel: boolean): { x: number; y: number } {
  if (!view) return { x: 0, y: existing.reduce((max, w) => Math.max(max, w.y + w.h), 0) };
  let x: number, y: number;
  const step = pixel ? CASCADE : 1;
  if (pixel) {
    const snap = (v: number) => Math.max(0, Math.round(v / SNAP_STEP) * SNAP_STEP);
    x = snap(view.x + (view.w - size.w) / 2);
    y = snap(view.y + (view.h - size.h) / 2);
  } else {
    x = Math.max(0, Math.min(COLS - size.w, Math.round((view.x + view.w / 2) / COL_PITCH - size.w / 2)));
    y = Math.max(0, Math.round((view.y + view.h / 2) / ROW_PITCH - size.h / 2));
  }
  const taken = () => existing.some((w) => w.x === x && w.y === y);
  for (let i = 0; i < 50 && taken(); i++) {
    y += step;
    if (pixel) x += step;
  }
  return { x, y };
}
