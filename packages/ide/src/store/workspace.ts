// The tabs in the middle of the editor: the screen being designed is always the first, and every section of the
// project tree that needs room to work (the variables, the pages, a datasource, the alarms, recipes, scripts and
// custom widgets) opens as a tab beside it. Not part of the project; nothing here is saved or sent to the runtime.
import { create } from "zustand";

export type TabKind = "screen" | "variables" | "pages" | "datasource" | "alarms" | "recipes" | "scripts" | "customWidgets";
export type Tab = { id: string; kind: TabKind; title: string };

/** The selection that means "a new item being made", in a tab that adds items from a draft. */
export const NEW_ITEM = "+new";

export const SCREEN_TAB: Tab = { id: "screen", kind: "screen", title: "Screen" };
export const VARIABLES_TAB: Tab = { id: "variables", kind: "variables", title: "Variables" };
export const PAGES_TAB: Tab = { id: "pages", kind: "pages", title: "Pages" };
export const ALARMS_TAB: Tab = { id: "alarms", kind: "alarms", title: "Alarms" };
export const RECIPES_TAB: Tab = { id: "recipes", kind: "recipes", title: "Recipes" };
export const SCRIPTS_TAB: Tab = { id: "scripts", kind: "scripts", title: "Scripts" };
export const CUSTOM_WIDGETS_TAB: Tab = { id: "customWidgets", kind: "customWidgets", title: "Custom widgets" };
export const datasourceTab = (id: string, label: string): Tab => ({ id: `ds:${id}`, kind: "datasource", title: label || id });
/** The datasource a datasource tab is about. */
export const datasourceOf = (tab: Tab): string => tab.id.slice("ds:".length);

interface Workspace {
  tabs: Tab[];
  activeId: string;
  /** The datasource the Variables tab should show, when it was opened from that datasource ("" shows all). */
  variablesDs: string;
  /** The item chosen in each list-and-detail tab (an alarm rule, a recipe, a script, a custom widget), kept while the
   *  tab is closed or behind another so it is there when the person comes back. Empty: none chosen. */
  selection: Partial<Record<TabKind, string>>;
  /** Chooses an item in a tab, without opening the tab. */
  select: (kind: TabKind, id: string) => void;
  /** Opens a tab with an item chosen (a custom widget from a page, say). */
  openWith: (tab: Tab, id: string) => void;
  /** Opens a tab, or goes to it when it is already open. */
  open: (tab: Tab) => void;
  /** Opens the Variables tab, showing the variables of one datasource. */
  openVariables: (dsId?: string) => void;
  close: (id: string) => void;
  activate: (id: string) => void;
  /** Keeps a datasource tab's title in step with the datasource's label. */
  retitle: (id: string, title: string) => void;
}

export const useWorkspace = create<Workspace>((set) => ({
  tabs: [SCREEN_TAB],
  activeId: SCREEN_TAB.id,
  variablesDs: "",
  selection: {},
  select: (kind, id) => set((s) => (s.selection[kind] === id ? s : { selection: { ...s.selection, [kind]: id } })),
  openWith: (tab, id) => set((s) => ({
    tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab],
    activeId: tab.id,
    selection: { ...s.selection, [tab.kind]: id },
  })),
  open: (tab) => set((s) => ({ tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab], activeId: tab.id })),
  openVariables: (dsId = "") => set((s) => ({
    tabs: s.tabs.some((t) => t.id === VARIABLES_TAB.id) ? s.tabs : [...s.tabs, VARIABLES_TAB],
    activeId: VARIABLES_TAB.id,
    variablesDs: dsId,
  })),
  close: (id) => set((s) => {
    if (id === SCREEN_TAB.id) return s;
    const i = s.tabs.findIndex((t) => t.id === id);
    if (i < 0) return s;
    const tabs = s.tabs.filter((t) => t.id !== id);
    // Closing the tab being looked at goes to its neighbour on the left (the screen at worst).
    return { tabs, activeId: s.activeId === id ? (tabs[i - 1] ?? SCREEN_TAB).id : s.activeId };
  }),
  activate: (id) => set((s) => (s.tabs.some((t) => t.id === id) ? { activeId: id } : s)),
  retitle: (id, title) => set((s) => (s.tabs.some((t) => t.id === id && t.title !== title) ? { tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) } : s)),
}));
