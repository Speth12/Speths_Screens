// Widget presets: set-up widgets saved for reuse (Phase 2 step 6). Saving
// copies the widgets with positions made relative; inserting copies them
// again with new ids, so nothing links back to the preset.
import { BUILTIN_PRESETS } from "@speths-screens/widgets";
import type { CanvasSnap, Preset, Project, Widget } from "./projectStore";

// The grid the canvas draws (Canvas.tsx): a cell and the gap after it.
const COL_W = 80, ROW_H = 64, GAP = 8;

/** A widget's position and size in the other canvas mode, so it looks the same. */
export function convertWidget(w: Widget, to: CanvasSnap): Widget {
  if (to === "pixel") {
    return {
      ...w,
      x: Math.round((w.x ?? 0) * (COL_W + GAP)),
      y: Math.round((w.y ?? 0) * (ROW_H + GAP)),
      w: Math.max(40, Math.round(w.w * (COL_W + GAP) - GAP)),
      h: Math.max(40, Math.round(w.h * (ROW_H + GAP) - GAP)),
    };
  }
  return {
    ...w,
    x: Math.max(0, Math.round((w.x ?? 0) / (COL_W + GAP))),
    y: Math.max(0, Math.round((w.y ?? 0) / (ROW_H + GAP))),
    w: Math.max(1, Math.round((w.w + GAP) / (COL_W + GAP))),
    h: Math.max(1, Math.round((w.h + GAP) / (ROW_H + GAP))),
  };
}

/** A preset holding copies of these widgets, moved so the group starts at 0,0. */
export function presetFromWidgets(widgets: Widget[], id: string, name: string, description?: string): Preset {
  const minX = Math.min(...widgets.map((w) => w.x ?? 0));
  const minY = Math.min(...widgets.map((w) => w.y ?? 0));
  return {
    id, name, ...(description ? { description } : {}),
    widgets: widgets.map((w) => ({ ...structuredClone(w), x: (w.x ?? 0) - minX, y: (w.y ?? 0) - minY, locked: undefined })),
  };
}

/**
 * The preset's widgets for a page: new ids, placed with the group's top-left
 * at `at`, in the page's canvas units. Groups inside the preset stay groups,
 * under a new group id. `from` is the units the preset is stored in.
 */
export function instantiatePreset(
  preset: Preset, at: { x: number; y: number }, units: { from: CanvasSnap; to: CanvasSnap }, newId: () => string,
): Widget[] {
  const groups = new Map<string, string>();
  return preset.widgets.map((src) => {
    const w = structuredClone(src);
    const placed = units.from === units.to ? w : convertWidget(w, units.to);
    let groupId = placed.groupId;
    if (groupId) {
      if (!groups.has(groupId)) groups.set(groupId, `grp-${newId()}`);
      groupId = groups.get(groupId);
    }
    return { ...placed, id: newId(), x: at.x + (placed.x ?? 0), y: at.y + (placed.y ?? 0), groupId };
  });
}

export type PresetEntry = { preset: Preset; builtin: boolean; units: CanvasSnap };

/** Every preset the palette offers: the project's own, then the built-in ones. */
export function allPresets(project: Project): PresetEntry[] {
  const own = project.canvasSnap ?? "grid";
  return [
    ...(project.presets ?? []).map((preset) => ({ preset, builtin: false, units: own })),
    ...BUILTIN_PRESETS.map((preset) => ({ preset, builtin: true, units: "grid" as const })),
  ];
}
