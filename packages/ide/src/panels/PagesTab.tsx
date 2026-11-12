// The Pages tab: every page of the project at a glance, with a thumbnail of its layout, what is on it and what it
// uses, and the things done to a page as a whole (open, rename, group, icon, copy, reorder, delete).
import { useMemo, useState } from "react";
import type { Page, PageIcon } from "@speths-screens/shared-types";
import { ICON_NAMES, Icon, PREVIEW_MINIMUM, pageExtent, placement } from "@speths-screens/widgets";
import { newWidgetId, useProject } from "../store/projectStore";
import { TemplateModal, type Template } from "./PageTemplates";
import { pageSummary, type PageSummary } from "../store/usage";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";
import { ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon, DeleteIcon } from "../ui/icons";

// The colour of a widget in a thumbnail, by type.
const TYPE_COLOR: Record<string, string> = {
  gauge: "#3b82f6", numericDisplay: "#22c55e", numericInput: "#16a34a", textDisplay: "#6b7280", textInput: "#4b5563",
  led: "#eab308", button: "#2563eb", setpoint: "#8b5cf6", tank: "#0ea5e9", trend: "#f59e0b", historyLog: "#64748b",
  multiState: "#ec4899", alarmBanner: "#ef4444", image: "#78716c", symbol: "#a78bfa", pipe: "#38bdf8", shape: "#94a3b8",
  table: "#94a3b8", customWidget: "#14b8a6", pageList: "#a1a1aa", clock: "#a1a1aa", driverStatus: "#a1a1aa", userMenu: "#a1a1aa", recipes: "#f97316",
};

/** The layout of a page drawn as boxes, to scale. */
export function PageThumbnail({ page, pixel }: { page: Page; pixel: boolean }) {
  const extent = pageExtent(page.widgets, pixel, PREVIEW_MINIMUM);
  return (
    <svg viewBox={`0 0 ${extent.width} ${extent.height}`} className="w-full h-full block" preserveAspectRatio="xMinYMin meet" role="img" aria-label={`Layout of ${page.name}`}>
      <rect width={extent.width} height={extent.height} fill={page.backgroundColor ?? "#e4e4e7"} fillOpacity={page.backgroundColor ? 1 : 0.5} />
      {page.widgets.map((w) => {
        const b = placement(w, pixel);
        const fill = TYPE_COLOR[w.type] ?? "#52525b";
        return (
          <g key={w.id}>
            <rect x={b.left} y={b.top} width={b.width} height={b.height} fill={fill} opacity={0.3} rx={4} />
            <rect x={b.left} y={b.top} width={b.width} height={b.height} fill="none" stroke={fill} strokeWidth={Math.max(2, extent.width / 300)} rx={4} />
          </g>
        );
      })}
    </svg>
  );
}

function Badge({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span title={title} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{children}</span>;
}

function PageCard({ page, index, count, active, groups, summary, pixel }: {
  page: Page; index: number; count: number; active: boolean; groups: string[]; summary: PageSummary; pixel: boolean;
}) {
  const { renamePage, updatePage, duplicatePage, movePage, removePage, setActivePage } = useProject.getState();
  const activate = useWorkspace((s) => s.activate);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [more, setMore] = useState(false);
  const open = () => { setActivePage(page.id); activate(SCREEN_TAB.id); };
  const btn = "text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40";
  const field = "bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-zinc-600";

  return (
    <article className={`rounded-lg border bg-zinc-900/60 flex flex-col overflow-hidden ${active ? "border-blue-500" : "border-zinc-800"}`} aria-label={`Page ${page.name}`}>
      <button onClick={open} className="h-40 bg-zinc-950 border-b border-zinc-800 p-2 cursor-pointer hover:bg-zinc-900" title="Open this page on the screen">
        <PageThumbnail page={page} pixel={pixel} />
      </button>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 shrink-0"><Icon name={page.icon} size={16} /></span>
          {renaming ? (
            <input
              autoFocus defaultValue={page.name} aria-label="Page name" className={`${field} flex-1 min-w-0 text-xs`}
              onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== page.name) renamePage(page.id, n); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
            />
          ) : (
            <h3 className="flex-1 min-w-0 truncate text-sm font-medium" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{page.name}</h3>
          )}
          {active && <span className="text-[10px] text-blue-500 shrink-0">open</span>}
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge>{summary.widgets} widget{summary.widgets === 1 ? "" : "s"}</Badge>
          <Badge title={summary.tags.join("\n")}>{summary.tags.length} tag{summary.tags.length === 1 ? "" : "s"}</Badge>
          {summary.driven > 0 && <Badge title="Widgets with driven properties">{summary.driven} driven</Badge>}
          {summary.acting > 0 && <Badge title="Widgets with actions">{summary.acting} acting</Badge>}
          {summary.hasScript && <Badge>page script</Badge>}
          <Badge title="Widgets placed differently on a tablet">tablet {summary.tablet}</Badge>
          <Badge title="Widgets placed differently on a phone">phone {summary.phone}</Badge>
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-[10px] text-zinc-500">Group
            <input list="page-groups" defaultValue={page.group ?? ""} aria-label="Group" className={`${field} w-full mt-0.5`} placeholder="none"
              onBlur={(e) => { const g = e.target.value.trim(); if (g !== (page.group ?? "")) updatePage(page.id, { group: g || undefined }); }} />
            <datalist id="page-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="text-[10px] text-zinc-500">Icon
            <select value={page.icon ?? ""} aria-label="Icon" className={`${field} w-full mt-0.5`} onChange={(e) => updatePage(page.id, { icon: (e.target.value || undefined) as PageIcon | undefined })}>
              <option value="">first letter</option>
              {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <button onClick={() => setMore((m) => !m)} className="text-left text-[10px] text-zinc-500 hover:text-zinc-300">{more ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />} What is on it</button>
        {more && (
          <div className="text-[11px] space-y-1.5">
            <div className="flex flex-wrap gap-1">{summary.byType.map(([t, n]) => <Badge key={t}>{n} {t}</Badge>)}</div>
            {summary.tags.length > 0 && (
              <ul className="font-mono text-[10px] text-zinc-500 max-h-28 overflow-auto">
                {summary.tags.slice(0, 40).map((t) => <li key={t} className="truncate" title={t}>{t}</li>)}
                {summary.tags.length > 40 && <li>… and {summary.tags.length - 40} more</li>}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 pt-1 mt-auto">
          <button className={`${btn} !bg-blue-700 hover:!bg-blue-600 !text-white`} onClick={open}>Open</button>
          <button className={btn} onClick={() => setRenaming(true)}>Rename</button>
          <button className={btn} onClick={() => duplicatePage(page.id)} title="Make a copy after this page">Copy</button>
          <div className="flex-1" />
          <button className={btn} disabled={index === 0} onClick={() => movePage(page.id, -1)} aria-label={`Move ${page.name} earlier`} title="Earlier in the navigation"><ChevronLeftIcon size={14} /></button>
          <button className={btn} disabled={index === count - 1} onClick={() => movePage(page.id, 1)} aria-label={`Move ${page.name} later`} title="Later in the navigation"><ChevronRightIcon size={14} /></button>
          {confirm ? (
            <>
              <button className={`${btn} !bg-red-700 !text-white`} onClick={() => removePage(page.id)}>Delete</button>
              <button className={btn} onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : (
            <button className={btn} disabled={count <= 1} onClick={() => setConfirm(true)} aria-label={`Delete ${page.name}`} title={count <= 1 ? "A project needs a page" : "Delete this page"}><DeleteIcon size={14} /></button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PagesTab() {
  const pages = useProject((s) => s.project.pages);
  const activePageId = useProject((s) => s.activePageId);
  const pixel = useProject((s) => s.project.canvasSnap === "pixel");
  const [choosing, setChoosing] = useState(false);
  // A new page starts blank or from a template; it is added after the pages there are, and opens.
  const addFrom = (t: Template) => {
    const { addPage, addWidget } = useProject.getState();
    addPage(t.name === "Blank" ? undefined : t.name);
    const id = useProject.getState().activePageId;
    for (const w of t.widgets) addWidget(id, { ...w, id: newWidgetId() });
    setChoosing(false);
  };
  const groups = useMemo(() => [...new Set(pages.map((p) => p.group).filter((g): g is string => !!g))], [pages]);
  const summaries = useMemo(() => pages.map(pageSummary), [pages]);
  const widgets = summaries.reduce((n, s) => n + s.widgets, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold">Pages</h2>
        <span className="text-[11px] text-zinc-500">{pages.length} page{pages.length === 1 ? "" : "s"} · {widgets} widget{widgets === 1 ? "" : "s"} · the order here is the order of the navigation</span>
        <div className="flex-1" />
        <button className="text-[11px] px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white" onClick={() => setChoosing(true)}>+ Add page</button>
      </div>
      {choosing && <TemplateModal onClose={() => setChoosing(false)} onSelect={addFrom} />}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {pages.map((p, i) => (
            <PageCard key={p.id} page={p} index={i} count={pages.length} active={p.id === activePageId} groups={groups} summary={summaries[i]!} pixel={pixel} />
          ))}
        </div>
      </div>
    </div>
  );
}
