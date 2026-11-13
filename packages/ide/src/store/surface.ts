// What the canvas edits: a page, or a custom widget. A custom widget is edited on the same canvas as
// a page, with every tool a page has, by giving it a page-like id ("cw:<id>"): its parts are shown
// as widgets (localId as id), and every change to them is written back to the custom widget.
import { COL_W, GAP, ROW_H } from "@speths-screens/widgets";
import type { CustomWidget, CustomWidgetPart, Page, Project, Widget } from "@speths-screens/shared-types";
import { partsExtent, placedSize } from "./customWidgetCanvas";

export const SURFACE_PREFIX = "cw:";

/** The id the canvas edits a custom widget by. */
export const surfaceId = (customWidgetId: string) => `${SURFACE_PREFIX}${customWidgetId}`;

/** The custom widget an id names, or null for a page. */
export function customWidgetIdOf(pageId: string | null | undefined): string | null {
  return pageId?.startsWith(SURFACE_PREFIX) ? pageId.slice(SURFACE_PREFIX.length) : null;
}

export function partToWidget(p: CustomWidgetPart): Widget {
  const { localId, ...rest } = p;
  return { id: localId, ...rest } as Widget;
}

/** A widget as a part. A part has no tablet or phone layout of its own (it follows the custom widget). */
export function widgetToPart(w: Widget): CustomWidgetPart {
  const { id, layout: _layout, ...rest } = w as Widget & { layout?: unknown };
  return { localId: id, ...rest } as CustomWidgetPart;
}

const asPage = new WeakMap<CustomWidget, Page>();

/** What the canvas shows for an id: the page, or the custom widget as a page of its parts. The same
 *  custom widget gives the same object, so a screen does not draw again for nothing. */
export function surfaceOf(project: Pick<Project, "pages" | "customWidgets">, pageId: string): Page | undefined {
  const cwId = customWidgetIdOf(pageId);
  if (cwId === null) return project.pages.find((p) => p.id === pageId);
  const cw = project.customWidgets?.find((c) => c.id === cwId);
  if (!cw) return undefined;
  let page = asPage.get(cw);
  if (!page) {
    page = { id: pageId, name: cw.name, widgets: cw.widgets.map(partToWidget) };
    asPage.set(cw, page);
  }
  return page;
}

/** The custom widget an id names, when the canvas is editing one. */
export function surfaceCustomWidget(project: Pick<Project, "customWidgets">, pageId: string): CustomWidget | undefined {
  const cwId = customWidgetIdOf(pageId);
  return cwId === null ? undefined : project.customWidgets?.find((c) => c.id === cwId);
}

/** The project with the widgets of a page, or the parts of a custom widget, changed. */
export function mapSurface(project: Project, pageId: string, change: (ws: Widget[]) => Widget[]): Project {
  const cwId = customWidgetIdOf(pageId);
  if (cwId === null) {
    return { ...project, pages: project.pages.map((p) => (p.id === pageId ? { ...p, widgets: change(p.widgets) } : p)) };
  }
  return {
    ...project,
    customWidgets: project.customWidgets?.map((c) => (c.id === cwId ? { ...c, widgets: change(c.widgets.map(partToWidget)).map(widgetToPart) } : c)),
  };
}

/** Pixels or grid cells, for the page or custom widget an id names: a custom widget on the canvas
 *  always has a designed size, so it is in pixels. */
export function surfaceSnap(project: Pick<Project, "canvasSnap">, pageId: string): "pixel" | "grid" {
  return customWidgetIdOf(pageId) !== null ? "pixel" : project.canvasSnap ?? "grid";
}

const cellsToPx = (n: number, pitch: number) => n * pitch - GAP;

/** A free-layout custom widget given a designed size in pixels, so the canvas can edit it: in a
 *  grid project its parts are turned from cells into pixels. Its size is the size it is most used at,
 *  else the box around its parts, at least 160 by 64. One that has a size already is returned as it is. */
export function withDesignedSize(cw: CustomWidget, project: Pick<Project, "canvasSnap" | "pages" | "customWidgets">): CustomWidget {
  if (cw.width && cw.height) return cw;
  const pixel = project.canvasSnap === "pixel";
  const parts = pixel ? cw.widgets : cw.widgets.map((p) => ({
    ...p,
    x: p.x * (COL_W + GAP), y: p.y * (ROW_H + GAP), w: cellsToPx(p.w, COL_W + GAP), h: cellsToPx(p.h, ROW_H + GAP),
  }));
  const placed = placedSize(project, cw.id);
  const used = placed && (pixel ? placed : { w: cellsToPx(placed.w, COL_W + GAP), h: cellsToPx(placed.h, ROW_H + GAP) });
  const extent = partsExtent(parts);
  return {
    ...cw, widgets: parts,
    width: Math.max(160, Math.round(used?.w ?? 0), Math.ceil(extent.w)),
    height: Math.max(64, Math.round(used?.h ?? 0), Math.ceil(extent.h)),
  };
}
