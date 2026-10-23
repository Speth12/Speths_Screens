import { newWidgetId, useProject } from "../store/projectStore";
import { allWidgets } from "../widgets/widgetRegistry";

function useAddWidget() {
  const { activePageId, addWidget, project } = useProject();
  const page = project.pages.find((p) => p.id === activePageId);
  return (type: string, w: number, h: number) => {
    if (!page) return;
    const { project: latest } = useProject.getState();
    const latestPage = latest.pages.find((p) => p.id === activePageId) ?? page;
    const nextY = latestPage.widgets.reduce((max, wg) => Math.max(max, wg.y + wg.h), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addWidget(page.id, { id: newWidgetId(), type: type as any, x: 0, y: nextY, w, h });
  };
}

export function Palette() {
  const add = useAddWidget();
  const items = allWidgets();
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-900/80 overflow-x-auto shrink-0">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 mr-1 shrink-0">Add</span>
      {items.map((it) => (
        <button
          key={it.type}
          onClick={() => add(it.type, it.defaultW, it.defaultH)}
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
  const items = allWidgets();
  return (
    <div className="p-2 space-y-1">
      {items.map((it) => (
        <button
          key={it.type}
          onClick={() => add(it.type, it.defaultW, it.defaultH)}
          className="w-full text-left text-[11px] px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
