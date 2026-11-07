// Edits to a custom widget's layout that the editor makes, kept apart from the screen so they can
// be tested: a stack field set for one screen size, and the parts' order.
import type { Device } from "@speths-screens/widgets";
import type { CustomWidgetLayout, CustomWidgetLayoutOverride, CustomWidgetPart } from "@speths-screens/shared-types";

export type StackField = keyof CustomWidgetLayoutOverride;

/** The layout with `key` set (or cleared, with undefined) for `device`. The desktop's value is the
 *  layout's own field; a smaller screen's goes in its override, which is dropped when empty. A
 *  layout with nothing left but the default free mode is dropped altogether. */
export function setLayoutField(
  layout: CustomWidgetLayout | undefined, device: Device, key: StackField, value: unknown,
): CustomWidgetLayout | undefined {
  const next: CustomWidgetLayout = { ...(layout ?? {}) };
  if (device === "desktop") {
    if (value === undefined) delete (next as Record<string, unknown>)[key]; else (next as Record<string, unknown>)[key] = value;
  } else {
    const mine: Record<string, unknown> = { ...(next[device] ?? {}) };
    if (value === undefined) delete mine[key]; else mine[key] = value;
    if (Object.keys(mine).length) next[device] = mine as CustomWidgetLayoutOverride; else delete next[device];
  }
  return tidy(next);
}

/** The layout with its mode set; free removes every stack setting. */
export function setLayoutMode(layout: CustomWidgetLayout | undefined, mode: "free" | "stack"): CustomWidgetLayout | undefined {
  if (mode === "free") return undefined;
  return { ...(layout ?? {}), mode: "stack", direction: layout?.direction ?? "row" };
}

function tidy(l: CustomWidgetLayout): CustomWidgetLayout | undefined {
  return l.mode === "stack" ? l : undefined;
}

/** The parts with the one at `index` moved by `by` places (a stack lays them out in this order). */
export function movePart(parts: CustomWidgetPart[], index: number, by: -1 | 1): CustomWidgetPart[] {
  const to = index + by;
  if (index < 0 || index >= parts.length || to < 0 || to >= parts.length) return parts;
  const out = [...parts];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** A part with its flex setting changed for a screen size (the desktop's is the part's own); a
 *  smaller screen's value equal to nothing is dropped so it follows the larger size again, and an
 *  empty flex is removed. A value of 0 clears a setting. */
export function setPartFlex(part: CustomWidgetPart, device: Device, patch: { grow?: number; basis?: number }): CustomWidgetPart {
  const flex: Record<string, unknown> = { ...(part.flex ?? {}) };
  const target: Record<string, unknown> = device === "desktop" ? flex : { ...((flex[device] as object | undefined) ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (device === "desktop" && !v) delete target[k]; else target[k] = v;
  }
  if (device !== "desktop") {
    if (Object.keys(target).length) flex[device] = target; else delete flex[device];
  }
  const { flex: _old, ...rest } = part;
  return Object.keys(flex).length ? { ...rest, flex: flex as CustomWidgetPart["flex"] } : rest;
}

/** A part's flex setting as shown for a screen size: its own, else the next size up. */
export function shownFlex(part: CustomWidgetPart, device: Device, key: "grow" | "basis"): number {
  const f = part.flex;
  const chain = [...(device === "phone" ? [f?.phone, f?.tablet] : device === "tablet" ? [f?.tablet] : []), f];
  return chain.find((c) => c?.[key] !== undefined)?.[key] ?? 0;
}

export function setPartHiddenOn(part: CustomWidgetPart, size: "tablet" | "phone", hidden: boolean): CustomWidgetPart {
  const set = new Set(part.hiddenOn ?? []);
  if (hidden) set.add(size); else set.delete(size);
  const { hiddenOn: _old, ...rest } = part;
  return set.size ? { ...rest, hiddenOn: (["tablet", "phone"] as const).filter((s) => set.has(s)) } : rest;
}
