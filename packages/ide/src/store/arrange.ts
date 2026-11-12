// Arranging the selected widgets against each other: lining up edges and centers, spacing them
// evenly, and giving them the same size. Kept apart from the canvas so the canvas's toolbar and the
// object list do the same thing, and so it can be tested.

export type ArrangeAction =
  | "align-left" | "align-right" | "align-top" | "align-bottom"
  | "align-cx" | "align-cy"
  | "dist-h" | "dist-v"
  | "same-w" | "same-h" | "same-size";

type Placed = { id: string; x: number; y: number; w: number; h: number };
export type Patch = { id: string; patch: Partial<Pick<Placed, "x" | "y" | "w" | "h">> };

/** How many widgets an action needs before it does anything. */
export const NEEDS: Record<ArrangeAction, number> = {
  "align-left": 2, "align-right": 2, "align-top": 2, "align-bottom": 2, "align-cx": 2, "align-cy": 2,
  "dist-h": 3, "dist-v": 3, "same-w": 2, "same-h": 2, "same-size": 2,
};

/** The changes that arrange `ws`. Sizes follow the first widget given (the one selected first);
 *  spacing keeps the two outermost widgets where they are. Widgets already in place get no change. */
export function arrange(ws: readonly Placed[], action: ArrangeAction): Patch[] {
  if (ws.length < NEEDS[action]) return [];
  const out: Patch[] = [];
  const put = (w: Placed, patch: Patch["patch"]) => {
    const changed = (Object.keys(patch) as (keyof Patch["patch"])[]).some((k) => patch[k] !== w[k]);
    if (changed) out.push({ id: w.id, patch });
  };
  const minX = Math.min(...ws.map((w) => w.x)), maxR = Math.max(...ws.map((w) => w.x + w.w));
  const minY = Math.min(...ws.map((w) => w.y)), maxB = Math.max(...ws.map((w) => w.y + w.h));
  const first = ws[0]!;

  switch (action) {
    case "align-left": ws.forEach((w) => put(w, { x: minX })); break;
    case "align-right": ws.forEach((w) => put(w, { x: maxR - w.w })); break;
    case "align-top": ws.forEach((w) => put(w, { y: minY })); break;
    case "align-bottom": ws.forEach((w) => put(w, { y: maxB - w.h })); break;
    case "align-cx": ws.forEach((w) => put(w, { x: Math.round((minX + maxR) / 2 - w.w / 2) })); break;
    case "align-cy": ws.forEach((w) => put(w, { y: Math.round((minY + maxB) / 2 - w.h / 2) })); break;
    case "dist-h": {
      const sorted = [...ws].sort((a, b) => a.x - b.x);
      const gap = (maxR - minX - sorted.reduce((s, w) => s + w.w, 0)) / (sorted.length - 1);
      let at = minX;
      sorted.forEach((w) => { put(w, { x: Math.round(at) }); at += w.w + gap; });
      break;
    }
    case "dist-v": {
      const sorted = [...ws].sort((a, b) => a.y - b.y);
      const gap = (maxB - minY - sorted.reduce((s, w) => s + w.h, 0)) / (sorted.length - 1);
      let at = minY;
      sorted.forEach((w) => { put(w, { y: Math.round(at) }); at += w.h + gap; });
      break;
    }
    case "same-w": ws.forEach((w) => put(w, { w: first.w })); break;
    case "same-h": ws.forEach((w) => put(w, { h: first.h })); break;
    case "same-size": ws.forEach((w) => put(w, { w: first.w, h: first.h })); break;
  }
  return out;
}

export type StackMove = "front" | "back" | "forward" | "backward";

/** A page's widgets with some moved in the drawing order (the last is drawn on top). The moved ones
 *  keep their order among themselves. */
export function restack<T extends { id: string }>(ws: readonly T[], ids: readonly string[], move: StackMove): T[] {
  const sel = new Set(ids);
  const picked = ws.filter((w) => sel.has(w.id));
  if (picked.length === 0) return [...ws];
  const rest = ws.filter((w) => !sel.has(w.id));
  if (move === "front") return [...rest, ...picked];
  if (move === "back") return [...picked, ...rest];
  const out = [...ws];
  const swap = (i: number, j: number) => { const t = out[i]!; out[i] = out[j]!; out[j] = t; };
  if (move === "forward") {
    for (let i = out.length - 2; i >= 0; i--) if (sel.has(out[i]!.id) && !sel.has(out[i + 1]!.id)) swap(i, i + 1);
  } else {
    for (let i = 1; i < out.length; i++) if (sel.has(out[i]!.id) && !sel.has(out[i - 1]!.id)) swap(i, i - 1);
  }
  return out;
}
