// The tabs in the middle of the editor: the screen being designed is always the first, and every section of the
// project tree that needs room to work (the variables, later the datasources, scripts and the rest) opens as a tab
// beside it. Not part of the project; nothing here is saved or sent to the runtime.
import { create } from "zustand";

export type TabKind = "screen" | "variables";
export type Tab = { id: string; kind: TabKind; title: string };

export const SCREEN_TAB: Tab = { id: "screen", kind: "screen", title: "Screen" };

interface Workspace {
  tabs: Tab[];
  activeId: string;
  /** Opens a tab, or goes to it when it is already open. */
  open: (tab: Tab) => void;
  close: (id: string) => void;
  activate: (id: string) => void;
}

export const useWorkspace = create<Workspace>((set) => ({
  tabs: [SCREEN_TAB],
  activeId: SCREEN_TAB.id,
  open: (tab) => set((s) => ({ tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab], activeId: tab.id })),
  close: (id) => set((s) => {
    if (id === SCREEN_TAB.id) return s;
    const i = s.tabs.findIndex((t) => t.id === id);
    if (i < 0) return s;
    const tabs = s.tabs.filter((t) => t.id !== id);
    // Closing the tab being looked at goes to its neighbour on the left (the screen at worst).
    return { tabs, activeId: s.activeId === id ? (tabs[i - 1] ?? SCREEN_TAB).id : s.activeId };
  }),
  activate: (id) => set((s) => (s.tabs.some((t) => t.id === id) ? { activeId: id } : s)),
}));

export const VARIABLES_TAB: Tab = { id: "variables", kind: "variables", title: "Variables" };
