// The middle of the editor: a tab strip, the screen being designed as the first tab, and the sections opened from
// the project tree as the others. The screen stays mounted while another tab is in front, so its zoom and selection
// are where they were when the user comes back.
import type { ReactNode } from "react";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";
import { VariablesTab } from "./VariablesTab";

export function Workspace({ screen }: { screen: ReactNode }) {
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const activate = useWorkspace((s) => s.activate);
  const close = useWorkspace((s) => s.close);
  const active = tabs.find((t) => t.id === activeId) ?? SCREEN_TAB;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div role="tablist" className="flex items-end border-b border-zinc-800 bg-zinc-900/60 shrink-0 overflow-x-auto overflow-y-hidden">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-xs border-r border-zinc-800 cursor-pointer select-none shrink-0 ${
              t.id === active.id ? "bg-zinc-950 text-zinc-100 border-t-2 border-t-blue-500 -mb-px" : "text-zinc-500 hover:text-zinc-300 border-t-2 border-t-transparent"
            }`}
            role="tab" aria-selected={t.id === active.id} onClick={() => activate(t.id)}
            onAuxClick={(e) => { if (e.button === 1 && t.id !== SCREEN_TAB.id) close(t.id); }}
          >
            <span>{t.title}</span>
            {t.id !== SCREEN_TAB.id && (
              <button
                onClick={(e) => { e.stopPropagation(); close(t.id); }}
                className="w-4 h-4 leading-none rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
                aria-label={`Close ${t.title}`} title="Close"
              >×</button>
            )}
          </div>
        ))}
      </div>
      <div className={active.kind === "screen" ? "flex-1 flex flex-col min-h-0 min-w-0" : "hidden"}>{screen}</div>
      {active.kind === "variables" && <VariablesTab />}
    </div>
  );
}
