import type { Widget } from "../store/projectStore";

// Page templates: a new page can start from one of these instead of blank. ────────────────────────────────────────────────────────────


export type Template = { id: string; name: string; description: string; widgets: Omit<Widget, "id">[] };

export const PAGE_TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Empty page",
    widgets: [],
  },
  {
    id: "overview",
    name: "Overview",
    description: "Gauges, LED, button",
    widgets: [
      { type: "gauge",          x: 0,  y: 0, w: 4, h: 3, props: { label: "Value 1" } },
      { type: "gauge",          x: 4,  y: 0, w: 4, h: 3, props: { label: "Value 2" } },
      { type: "tank",           x: 8,  y: 0, w: 2, h: 4, props: { label: "Level" } },
      { type: "numericDisplay", x: 0,  y: 3, w: 3, h: 2, props: { label: "PV" } },
      { type: "numericDisplay", x: 3,  y: 3, w: 3, h: 2, props: { label: "SP" } },
      { type: "led",            x: 10, y: 0, w: 2, h: 2, props: { label: "Status" } },
      { type: "button",         x: 10, y: 2, w: 2, h: 2, props: { label: "Reset" },
        events: { onPress: [{ type: "write", value: 1 }], onRelease: [{ type: "write", value: 0 }] } },
    ],
  },
  {
    id: "trend",
    name: "Trend",
    description: "Full-width trend chart",
    widgets: [
      { type: "trend",  x: 0, y: 0, w: 12, h: 7, props: { label: "Trend", duration: 300 } },
      { type: "button", x: 0, y: 7, w: 3,  h: 2, props: { label: "← Back" } },
    ],
  },
  {
    id: "alarms",
    name: "Alarms",
    description: "Alarm banner + history",
    widgets: [
      { type: "alarmBanner", x: 0, y: 0, w: 12, h: 4, props: { label: "Active Alarms", maxRows: 8 } },
      { type: "historyLog",  x: 0, y: 4, w: 12, h: 5, props: { label: "Write History" } },
    ],
  },
];

export function TemplateModal({ onClose, onSelect }: { onClose: () => void; onSelect: (t: Template) => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-[420px] shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">New Page — Choose Template</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t); onClose(); }}
              className="text-left p-3 rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-zinc-800 transition-colors space-y-1"
            >
              <div className="text-sm font-medium text-zinc-100">{t.name}</div>
              <div className="text-[11px] text-zinc-500">{t.description}</div>
              <div className="text-[10px] text-zinc-600">{t.widgets.length} widget{t.widgets.length !== 1 ? "s" : ""}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
