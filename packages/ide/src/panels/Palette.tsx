import { newWidgetId, useProject } from "../store/projectStore";
import { MANIFESTS, type WidgetManifest } from "@speths-screens/widgets";

/** The palette: every widget type except symbols, which the symbol library adds. */
const PALETTE = MANIFESTS.filter((m) => m.palette !== false);

function useAddWidget() {
  const { activePageId, addWidget, project } = useProject();
  const page = project.pages.find((p) => p.id === activePageId);
  return (m: WidgetManifest) => {
    if (!page) return;
    const { project: latest } = useProject.getState();
    const latestPage = latest.pages.find((p) => p.id === activePageId) ?? page;
    const nextY = latestPage.widgets.reduce((max, wg) => Math.max(max, wg.y + wg.h), 0);
    // A new widget starts with its manifest's defaults (a button writes 1 while pressed).
    addWidget(page.id, { id: newWidgetId(), type: m.type, x: 0, y: nextY, w: m.defaultSize.w, h: m.defaultSize.h, ...structuredClone(m.defaults) });
  };
}

export function Palette() {
  const add = useAddWidget();
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto shrink-0">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 mr-1 shrink-0">Add</span>
      {PALETTE.map((it) => (
        <button
          key={it.type}
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
    <div className="p-2 space-y-1">
      {PALETTE.map((it) => (
        <button
          key={it.type}
          onClick={() => add(it)}
          className="w-full text-left text-[11px] px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
