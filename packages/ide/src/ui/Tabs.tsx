// A row of tabs. Left and right arrows move between them (Home and End jump to the ends), and a
// tab that can be closed has its own close button, also reached with Delete.
import { useRef, type ReactNode } from "react";
import { FOCUS_RING } from "./Button";

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shows a close button; `onClose` of the row is called with the tab's id. */
  closable?: boolean;
};

type TabsProps = {
  /** What the row of tabs chooses between ("Workspace", "Right panel"), for screen readers. */
  label: string;
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  /** `fill` shares the width equally (a narrow side panel); `fit` sizes each tab to its label. */
  layout?: "fit" | "fill";
  /** `sm`: small, single-line labels for a narrow panel; the row scrolls if they still do not fit. */
  size?: "md" | "sm";
  className?: string;
};

export function Tabs({ label, tabs, active, onSelect, onClose, layout = "fit", size = "md", className = "" }: TabsProps) {
  const row = useRef<HTMLDivElement>(null);

  const move = (to: number) => {
    const at = (to + tabs.length) % tabs.length;
    const t = tabs[at];
    if (!t) return;
    onSelect(t.id);
    row.current?.querySelectorAll<HTMLElement>('[role="tab"]')[at]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number, t: TabItem) => {
    if (e.key === "ArrowRight") { e.preventDefault(); move(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(tabs.length - 1); }
    else if (e.key === "Delete" && t.closable && onClose) { e.preventDefault(); onClose(t.id); }
  };

  return (
    <div ref={row} role="tablist" aria-label={label} className={`flex items-stretch border-b border-zinc-700 ${size === "sm" ? "overflow-x-auto" : ""} ${className}`}>
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <div key={t.id} className={`relative flex items-center ${layout === "fill" ? "flex-1 justify-center" : ""} ${on ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`}>
            <button type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => onSelect(t.id)} onKeyDown={(e) => onKeyDown(e, i, t)}
              className={`h-8 inline-flex items-center gap-1.5 whitespace-nowrap ${size === "sm" ? "text-ui-label" : "text-ui"} ${on ? "font-medium" : ""} ${t.closable ? "pl-3 pr-1" : size === "sm" ? "px-1.5" : "px-3"} ${layout === "fill" ? "flex-1 justify-center" : ""} ${FOCUS_RING}`}>
              {t.icon}
              {t.label}
            </button>
            {t.closable && onClose && (
              <button type="button" tabIndex={-1} aria-label={`Close ${t.label}`} onClick={() => onClose(t.id)}
                className="mr-1.5 h-5 w-5 inline-flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" style={{ stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", fill: "none" }}>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            )}
            {on && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-500" />}
          </div>
        );
      })}
    </div>
  );
}
