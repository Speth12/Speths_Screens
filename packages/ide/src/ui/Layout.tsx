// The pieces the full-size tabs of the workspace (Variables, Alarms, Recipes, Scripts, Custom widgets)
// are built from, so they share one look: a header with a title and its actions, a list on the left
// to choose from, a detail on the right, and a message for when there is nothing yet.
import { useRef, type ReactNode } from "react";
import { FOCUS_RING } from "./Button";

type TabHeaderProps = {
  title: string;
  /** One line under or beside the title: how many there are, what state they are in. */
  summary?: ReactNode;
  /** Buttons at the right. */
  actions?: ReactNode;
};

/** The bar at the top of a tab. */
export function TabHeader({ title, summary, actions }: TabHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
      <h2 className="text-ui-title font-semibold text-zinc-100">{title}</h2>
      {summary && <span className="text-ui-label text-zinc-400">{summary}</span>}
      <div className="flex-1" />
      {actions}
    </div>
  );
}

/** What a list or a detail says when there is nothing to show yet. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center px-6 py-10 text-zinc-400">
      <div className="text-ui-title font-medium text-zinc-200">{title}</div>
      {children && <div className="text-ui max-w-md">{children}</div>}
      {action}
    </div>
  );
}

export type ListItem = { id: string; content: ReactNode };

type SelectListProps = {
  /** What the list holds ("Alarm rules"), for screen readers. */
  label: string;
  items: ListItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
};

/** A list to choose one item from. Up and down arrows move the choice; the chosen item is the one
 *  a Tab key stops at. */
export function SelectList({ label, items, selected, onSelect, className = "" }: SelectListProps) {
  const box = useRef<HTMLDivElement>(null);
  const stop = items.some((i) => i.id === selected) ? selected : items[0]?.id;

  const move = (from: number, by: number) => {
    const next = items[from + by];
    if (!next) return;
    onSelect(next.id);
    box.current?.querySelectorAll<HTMLElement>('[role="option"]')[from + by]?.focus();
  };

  return (
    <div ref={box} role="listbox" aria-label={label} className={`overflow-auto ${className}`}>
      {items.map((item, i) => {
        const on = item.id === selected;
        return (
          <div key={item.id} role="option" aria-selected={on} tabIndex={item.id === stop ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
              else if (e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
              else if (e.key === "Home") { e.preventDefault(); move(i, -i); }
              else if (e.key === "End") { e.preventDefault(); move(i, items.length - 1 - i); }
              else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item.id); }
            }}
            className={`px-3 py-2 border-b border-zinc-800/60 cursor-pointer ${FOCUS_RING} ${on ? "bg-blue-600/15" : "hover:bg-zinc-800/40"}`}>
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
