// Every widget on the page as a list, the one drawn on top first. A click selects the widget and
// brings it into view on the page, so a widget that is behind another, off the screen or too small
// to grab can still be reached. The buttons above the list act on the selection: the drawing order,
// grouping, lining up, spacing and sizing.
import { manifestFor } from "@speths-screens/widgets";
import { useProject, type Widget } from "../store/projectStore";
import { useSelection } from "../store/selection";
import { NEEDS, arrange, type ArrangeAction, type StackMove } from "../store/arrange";
import { IconButton } from "../ui";
import {
  AlignBottomIcon, AlignCenterXIcon, AlignCenterYIcon, AlignLeftIcon, AlignRightIcon, AlignTopIcon, ArrowDownIcon, ArrowUpIcon,
  DeleteIcon, DistributeXIcon, DistributeYIcon, GroupIcon, LockIcon, ToBackIcon, ToFrontIcon, UngroupIcon, UnlockIcon, WidgetIcon, type Icon,
} from "../ui/icons";

/** What a widget is called in the list: its label or text, else its type. */
export function widgetName(w: Widget): string {
  const p = (w.props ?? {}) as { label?: string; staticText?: string };
  return (p.label || p.staticText || "").trim() || manifestFor(w.type)?.label || w.type;
}

const STACK: { move: StackMove; label: string; icon: Icon }[] = [
  { move: "front", label: "Bring to front", icon: ToFrontIcon },
  { move: "forward", label: "Bring forward", icon: ArrowUpIcon },
  { move: "backward", label: "Send backward", icon: ArrowDownIcon },
  { move: "back", label: "Send to back", icon: ToBackIcon },
];

const ALIGN: { action: ArrangeAction; label: string; icon: Icon }[] = [
  { action: "align-left", label: "Align left edges", icon: AlignLeftIcon },
  { action: "align-cx", label: "Center on each other, left to right", icon: AlignCenterXIcon },
  { action: "align-right", label: "Align right edges", icon: AlignRightIcon },
  { action: "align-top", label: "Align top edges", icon: AlignTopIcon },
  { action: "align-cy", label: "Center on each other, top to bottom", icon: AlignCenterYIcon },
  { action: "align-bottom", label: "Align bottom edges", icon: AlignBottomIcon },
  { action: "dist-h", label: "Space evenly, left to right", icon: DistributeXIcon },
  { action: "dist-v", label: "Space evenly, top to bottom", icon: DistributeYIcon },
];

const SIZE: { action: ArrangeAction; label: string; text: string }[] = [
  { action: "same-w", label: "Same width as the first one selected", text: "Width" },
  { action: "same-h", label: "Same height as the first one selected", text: "Height" },
  { action: "same-size", label: "Same size as the first one selected", text: "Both" },
];

const row = "flex items-center gap-0.5";
const caption = "text-ui-label text-zinc-500 w-12 shrink-0";

export function ObjectList() {
  const { project, activePageId, updateWidget, updateWidgets, reorderWidgets, groupWidgets, ungroupWidgets, removeWidgets } = useProject();
  const ids = useSelection((s) => s.ids);
  const setIds = useSelection((s) => s.set);
  const page = project.pages.find((p) => p.id === activePageId);
  if (!page) return <div className="p-3 text-ui text-zinc-500">No page selected.</div>;

  // In the order they were selected: sizes follow the first.
  const selected = ids.map((id) => page.widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w);
  const n = selected.length;
  const groupIds = [...new Set(selected.map((w) => w.groupId).filter((g): g is string => !!g))];
  const allLocked = n > 0 && selected.every((w) => w.locked);

  const pick = (w: Widget, additive: boolean) => {
    if (additive) setIds((cur) => (cur.includes(w.id) ? cur.filter((id) => id !== w.id) : [...cur, w.id]));
    else setIds(w.groupId ? page.widgets.filter((x) => x.groupId === w.groupId).map((x) => x.id) : [w.id]);
    // Bring it into view on the page.
    const el = [...document.querySelectorAll<HTMLElement>("[data-widget-id]")].find((e) => e.dataset.widgetId === w.id);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  const run = (action: ArrangeAction) => {
    const patches = arrange(selected.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h })), action);
    if (patches.length) updateWidgets(page.id, patches);
  };
  const setLocked = (locked: boolean) => selected.forEach((w) => updateWidget(page.id, w.id, { locked: locked || undefined }));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div role="toolbar" aria-label="Arrange the selected widgets" className="p-2 space-y-1.5 border-b border-zinc-800 shrink-0">
        <div className="text-ui-label text-zinc-400">{n === 0 ? "Select a widget in the list or on the page." : n === 1 ? "1 selected" : `${n} selected`}</div>
        <div className={row}>
          <span className={caption}>Order</span>
          {STACK.map((s) => <IconButton key={s.move} size="sm" label={s.label} icon={<s.icon size={14} />} disabled={n === 0} onClick={() => reorderWidgets(page.id, ids, s.move)} />)}
        </div>
        <div className={row}>
          <span className={caption}>Align</span>
          {ALIGN.map((a) => <IconButton key={a.action} size="sm" label={a.label} icon={<a.icon size={14} />} disabled={n < NEEDS[a.action]} onClick={() => run(a.action)} />)}
        </div>
        <div className={row}>
          <span className={caption}>Same</span>
          {SIZE.map((s) => (
            <button key={s.action} type="button" title={s.label} aria-label={s.label} disabled={n < NEEDS[s.action]} onClick={() => run(s.action)}
              className="h-7 px-2 rounded text-ui-label text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent">{s.text}</button>
          ))}
        </div>
        <div className={row}>
          <span className={caption}>Group</span>
          <IconButton size="sm" label="Group the selected widgets" icon={<GroupIcon size={14} />} disabled={n < 2} onClick={() => groupWidgets(page.id, ids)} />
          <IconButton size="sm" label="Ungroup" icon={<UngroupIcon size={14} />} disabled={groupIds.length === 0} onClick={() => groupIds.forEach((g) => ungroupWidgets(page.id, g))} />
          <IconButton size="sm" label={allLocked ? "Unlock" : "Lock in place"} icon={allLocked ? <UnlockIcon size={14} /> : <LockIcon size={14} />} disabled={n === 0} onClick={() => setLocked(!allLocked)} />
          <IconButton size="sm" label="Delete the selected widgets" icon={<DeleteIcon size={14} />} disabled={n === 0} onClick={() => { removeWidgets(page.id, ids); setIds([]); }} />
        </div>
      </div>

      {page.widgets.length === 0 && <div className="p-3 text-ui text-zinc-500">No widgets on this page yet.</div>}
      <ul role="listbox" aria-label="Widgets on this page" aria-multiselectable="true" className="flex-1 min-h-0 overflow-auto py-1">
        {[...page.widgets].reverse().map((w) => {
          const on = ids.includes(w.id);
          return (
            <li key={w.id} role="option" aria-selected={on} tabIndex={0}
              onClick={(e) => pick(w, e.shiftKey || e.ctrlKey || e.metaKey)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(w, e.shiftKey || e.ctrlKey || e.metaKey); } }}
              title={`${manifestFor(w.type)?.label ?? w.type} at ${w.x}, ${w.y}, ${w.w} by ${w.h}`}
              className={`flex items-center gap-2 px-2 h-7 cursor-pointer text-ui ${on ? "bg-blue-600/25 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800"}`}
              style={w.groupId ? { boxShadow: "inset 3px 0 0 #8b5cf6" } : undefined}>
              <WidgetIcon type={w.type} size={14} />
              <span className="truncate flex-1">{widgetName(w)}</span>
              {w.groupId && <span className="text-ui-label text-violet-400 shrink-0">group</span>}
              {w.locked && <span className="shrink-0 text-amber-500" aria-label="locked"><LockIcon size={12} /></span>}
            </li>
          );
        })}
      </ul>
      <div className="px-2 py-1.5 border-t border-zinc-800 text-ui-label text-zinc-500 shrink-0">Top of the list is drawn on top. Ctrl or Shift and click selects several.</div>
    </div>
  );
}
