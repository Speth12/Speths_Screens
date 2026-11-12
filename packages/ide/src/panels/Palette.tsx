import { useProject } from "../store/projectStore";
import { MANIFESTS, type WidgetManifest } from "@speths-screens/widgets";
import { PresetList } from "./Presets";
import { PALETTE_DRAG, fitNewWidget, newWidget, placeNew, visibleCanvasRect } from "../store/newWidget";
import { useSelection } from "../store/selection";
import { surfaceCustomWidget, surfaceOf, surfaceSnap } from "../store/surface";
import { WidgetIcon } from "../ui/icons";

/** The palette: every widget type except symbols, which the symbol library adds. */
const PALETTE = MANIFESTS.filter((m) => m.palette !== false);

/** Adds a widget in the middle of the part of the page in view, and selects it. */
function useAddWidget() {
  const { activePageId, addWidget } = useProject();
  return (m: WidgetManifest) => {
    const { project } = useProject.getState();
    const page = surfaceOf(project, activePageId);
    if (!page) return;
    const pixel = surfaceSnap(project, activePageId) === "pixel";
    const w = fitNewWidget(newWidget(m, pixel), surfaceCustomWidget(project, activePageId));
    const at = placeNew(visibleCanvasRect(), w, page.widgets, pixel);
    addWidget(page.id, { ...w, ...at });
    useSelection.getState().set([w.id]);
  };
}

/** A drag from the palette carries the widget's type; the canvas puts it where it is dropped. */
const dragType = (m: WidgetManifest) => (e: React.DragEvent) => {
  e.dataTransfer.setData(PALETTE_DRAG, m.type);
  e.dataTransfer.effectAllowed = "copy";
};

export function Palette() {
  const add = useAddWidget();
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto shrink-0">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 mr-1 shrink-0">Add</span>
      {PALETTE.map((it) => (
        <button
          key={it.type}
          draggable onDragStart={dragType(it)}
          onClick={() => add(it)}
          className="text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 whitespace-nowrap shrink-0 transition-colors"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function WidgetPalette() {
  const add = useAddWidget();
  return (
    <>
    <div className="px-2 pt-2 text-[10px] text-zinc-500">Click to add in the middle of the page, or drag onto the page.</div>
    <div className="p-2 space-y-1">
      {PALETTE.map((it) => (
        <button
          key={it.type}
          draggable onDragStart={dragType(it)}
          onClick={() => add(it)}
          title={`Add a ${it.label}: click, or drag onto the page`}
          className="w-full flex items-center gap-2 text-left text-[11px] px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors cursor-grab"
        >
          <WidgetIcon type={it.type} size={14} />
          {it.label}
        </button>
      ))}
    </div>
    <PresetList />
    </>
  );
}
