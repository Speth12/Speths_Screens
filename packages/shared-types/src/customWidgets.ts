// Custom widget checks, as internal/project/customwidgets.go does them: the same problems, in the
// same order, with the same words.
import type { CustomWidget, Project } from "./project";

type Placed = { type: string; props?: { customWidgetId?: string } };
const idOf = (w: Placed): string | undefined => (w.type === "customWidget" ? w.props?.customWidgetId : undefined);

/** A custom widget placed on a page or inside another that does not exist, and a custom widget
 *  that contains itself, directly or through others. */
export function customWidgetProblems(p: Project): string[] {
  const out: string[] = [];
  const byId = new Map<string, CustomWidget>();
  for (const cw of p.customWidgets ?? []) byId.set(cw.id, cw);
  const missing = (where: string, id: string | undefined) => {
    if (id && !byId.has(id)) out.push(`${where}: no custom widget with id ${JSON.stringify(id)}`);
  };
  for (const pg of p.pages ?? []) {
    for (const w of pg.widgets ?? []) missing(`page ${JSON.stringify(pg.name)}, widget ${w.id} (${w.type})`, idOf(w as unknown as Placed));
  }
  for (const cw of p.customWidgets ?? []) {
    for (const w of cw.widgets ?? []) missing(`custom widget ${JSON.stringify(cw.name)}, widget ${w.localId} (${w.type})`, idOf(w as unknown as Placed));
  }
  const seenSlots = new Set<string>();
  for (const slot of p.shell?.frame ?? []) {
    if (seenSlots.has(slot.id)) out.push(`frame slot ${JSON.stringify(slot.id)} is listed twice`);
    seenSlots.add(slot.id);
    missing(`frame slot ${JSON.stringify(slot.id)}`, slot.customWidgetId);
  }
  // What the built-in header names has to exist: the page its alarm count opens, and its logo.
  const header = p.shell?.header;
  if (header?.alarmsPage && !(p.pages ?? []).some((pg) => pg.id === header.alarmsPage)) {
    out.push(`header: the alarm count opens page ${JSON.stringify(header.alarmsPage)}, which does not exist`);
  }
  if (header?.logoImage && !(p.images ?? []).some((img) => img.id === header.logoImage)) {
    out.push(`header: the logo is image ${JSON.stringify(header.logoImage)}, which does not exist`);
  }
  // A custom widget that can reach itself: follow the custom widgets its parts name.
  const walk = (cw: CustomWidget, target: string, path: string[], seen: Set<string>): string[] | undefined => {
    for (const w of cw.widgets ?? []) {
      const id = idOf(w as unknown as Placed);
      const next = id === undefined ? undefined : byId.get(id);
      if (!next) continue;
      if (next.id === target) return [...path, next.name];
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      const found = walk(next, target, [...path, next.name], seen);
      if (found) return found;
    }
    return undefined;
  };
  for (const cw of p.customWidgets ?? []) {
    const path = walk(cw, cw.id, [cw.name], new Set([cw.id]));
    if (path) out.push(`custom widget ${JSON.stringify(cw.name)} contains itself (${path.join(" > ")})`);
  }
  return out;
}
