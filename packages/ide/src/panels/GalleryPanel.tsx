// The widget gallery in the IDE: every widget type in every state under a
// theme, with a slider for the simulated value. Click a cell to add that widget
// to the page, or drag it onto the canvas (Phase 3, step 7).
import { useState } from "react";
import { Gallery, MANIFESTS, THEMES, galleryInsert, themeById, type WidgetManifest } from "@speths-screens/widgets";
import { useProject, newWidgetId, type Widget } from "../store/projectStore";
import { instantiatePreset } from "../store/presets";

/** Drag data of a gallery cell: the widget type. */
export const GALLERY_DRAG = "text/x-gallery-type";

/** Adds a widget type's gallery sample to the active page, at `at` (default:
 *  below everything), in the page's units. */
export function insertGalleryWidget(type: string, at?: { x: number; y: number }): Widget[] {
  const m = MANIFESTS.find((x) => x.type === type);
  const { project, activePageId, addWidgets } = useProject.getState();
  const page = project.pages.find((p) => p.id === activePageId);
  if (!m || !page) return [];
  const where = at ?? { x: 0, y: page.widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0) };
  const preset = { id: "gallery", name: m.label, widgets: [{ ...galleryInsert(m), id: "gallery", x: 0, y: 0 } as Widget] };
  const ws = instantiatePreset(preset, where, { from: "grid", to: project.canvasSnap ?? "grid" }, newWidgetId);
  addWidgets(page.id, ws);
  return ws;
}

export function GalleryPanel({ onClose }: { onClose: () => void }) {
  const projectTheme = useProject((s) => s.project.theme);
  const [themeId, setThemeId] = useState<string>(themeById(projectTheme).id);
  const [slider, setSlider] = useState(62);
  const drag = (m: WidgetManifest, e: React.DragEvent) => {
    e.dataTransfer.setData(GALLERY_DRAG, m.type);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="fixed left-0 top-10 bottom-0 z-40 w-[min(1400px,70vw)] flex flex-col bg-zinc-950 border-r border-zinc-700 shadow-2xl">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800">
        <div className="text-xs font-semibold text-zinc-200">Widget gallery</div>
        <label className="flex items-center gap-1 text-[11px] text-zinc-400">theme
          <select aria-label="Gallery theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}
            className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200">
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">value
          <input aria-label="Simulated value" type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
          <span className="font-mono w-8 text-zinc-200">{slider}</span>
        </label>
        <span className="text-[10px] text-zinc-500">click a cell to add it to the page, or drag it onto the canvas</span>
        <button aria-label="Close gallery" onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200 text-sm px-1">×</button>
      </div>
      <div className="flex-1 overflow-auto" onClick={(e) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-testid^='gallery-']");
        const m = cell && MANIFESTS.find((x) => cell.dataset.testid?.startsWith(`gallery-${x.type}-`));
        if (m) insertGalleryWidget(m.type);
      }}>
        <Gallery theme={themeById(themeId)} slider={slider} onDragCell={drag} />
      </div>
    </div>
  );
}
