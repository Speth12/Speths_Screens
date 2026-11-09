// Zustand store for the in-memory project (the JSON edited by the IDE).
import { create } from "zustand";
import { openProject } from "./openProject";

// Project types are generated from schema.json (npm run gen:types).
import type {
  Action, ActionType, AlarmRule, AlarmSeverity, CanvasResolution, CanvasSnap,
  Datasource, DatasourceType, Drive, CustomWidget, CustomWidgetParam,
  CustomWidgetPart, ImageAsset, NamespaceNode, NamespaceNodeType, Page, Preset, Project, Recipe,
  RecipeEntry, Role, RuntimeScript, SessionVar, Shell, Theme, Widget, WidgetBindings, WidgetEvents, WidgetType,
} from "@speths-screens/shared-types";
import { placeFor } from "@speths-screens/widgets";
import { readStored } from "./storage";
import { useEditorView } from "./editorView";
import { moveNsNode } from "./namespaceOps";
import { defaultCustomWidgets, defaultFrame, missingDefaults } from "@speths-screens/widgets";

export type {
  Action, ActionType, AlarmRule, AlarmSeverity, CanvasResolution, CanvasSnap,
  Datasource, DatasourceType, Drive, CustomWidget, CustomWidgetParam, CustomWidgetPart,
  ImageAsset, NamespaceNode, NamespaceNodeType, Page, Preset, Project, Recipe, RecipeEntry,
  Widget, WidgetBindings, WidgetEvents, WidgetType,
};

const MAX_HISTORY = 50;

type State = {
  project: Project;
  activePageId: string;
  selectedWidgetId: string | null;

  // Undo/redo stacks (editor-only, not serialised)
  _past: Project[];
  _future: Project[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  setActivePage: (id: string) => void;
  selectWidget: (id: string | null) => void;

  addPage: (name?: string) => void;
  renamePage: (id: string, name: string) => void;
  removePage: (id: string) => void;
  /** A copy of a page (new widget ids, new groups) placed after it; returns the copy's id. */
  duplicatePage: (id: string) => string | undefined;
  /** Moves a page up (-1) or down (+1) in the list, which is the order of the navigation. */
  movePage: (id: string, delta: -1 | 1) => void;

  addDatasource: (ds: Datasource) => void;
  removeDatasource: (id: string) => void;
  updateDatasource: (id: string, patch: Partial<Datasource>) => void;

  addWidget: (pageId: string, w: Widget) => void;
  /** Several widgets in one undo step (an inserted preset); selects the first. */
  addWidgets: (pageId: string, ws: Widget[]) => void;
  updateWidget: (pageId: string, id: string, patch: Partial<Widget>) => void;
  /** Sets one tag slot of a widget, keeping the others; "" clears it. */
  setWidgetTag: (pageId: string, id: string, slot: keyof WidgetBindings, tag: string) => void;
  updateWidgets: (pageId: string, patches: { id: string; patch: Partial<Widget> }[]) => void;
  removeWidget: (pageId: string, id: string) => void;
  removeWidgets: (pageId: string, ids: string[]) => void;
  reorderWidget: (pageId: string, id: string, dir: "front" | "back" | "forward" | "backward") => void;
  groupWidgets: (pageId: string, ids: string[]) => void;
  ungroupWidgets: (pageId: string, groupId: string) => void;
  updatePage: (id: string, patch: Partial<Omit<Page, "id" | "widgets">>) => void;

  addAlarmRule: (rule: AlarmRule) => void;
  updateAlarmRule: (id: string, patch: Partial<AlarmRule>) => void;
  removeAlarmRule: (id: string) => void;

  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: string, patch: Partial<Recipe>) => void;
  removeRecipe: (id: string) => void;

  addScript: (script: RuntimeScript) => void;
  updateScript: (id: string, patch: Partial<RuntimeScript>) => void;
  removeScript: (id: string) => void;
  setScriptRole: (role: Role | undefined) => void;
  setSessionVars: (vars: SessionVar[]) => void;
  /** The project's look; an empty theme (no elements) removes it, which means the calm preset. */
  setTheme: (theme: Theme | undefined) => void;
  /** The frame around the pages; an empty shell removes it, which means tabs. */
  setShell: (shell: Shell | undefined) => void;
  /** Shows or hides a widget on the screen size being edited (not the desktop). */
  setWidgetHidden: (pageId: string, id: string, hidden: boolean) => void;
  /** Takes a widget's layout for the screen size being edited back to what it inherits. */
  resetWidgetLayout: (pageId: string, id: string) => void;
  /** The languages the screens can be shown in (the first is the one the text is written in). */
  setLanguages: (languages: string[]) => void;
  /** One translation; an empty value removes it. */
  setTranslation: (language: string, text: string, value: string) => void;

  importImage: (asset: ImageAsset) => void;
  deleteImage: (id: string) => void;
  renameImage: (id: string, name: string) => void;



  addCustomWidget: (fp: CustomWidget) => void;
  updateCustomWidget: (id: string, patch: Partial<CustomWidget>) => void;
  removeCustomWidget: (id: string) => void;
  addPreset: (p: Preset) => void;
  updatePreset: (id: string, patch: Partial<Preset>) => void;
  removePreset: (id: string) => void;

  upsertNamespaceNode: (node: NamespaceNode) => void;
  /** Adds or replaces several nodes as one change (one undo step). */
  upsertNamespaceNodes: (nodes: NamespaceNode[]) => void;
  removeNamespaceNode: (path: string) => void;
  /** Moves or renames a node (and what is under it) and points every `ns:` use of it at the new path. Says why when it cannot. */
  moveNamespaceNode: (from: string, to: string) => { error?: string };

  loadProject: (p: Project) => void;
  /** A blank project. With chrome "custom" it starts with the default header and navigation as custom widgets. */
  newProject: (opts?: { chrome?: "builtin" | "custom" }) => void;
  /** Adds the default header and navigation that the project lacks and switches to custom chrome. */
  addDefaultChrome: () => void;
  exportJSON: () => string;
};

/** A widget change as it is stored: while a tablet or phone is being edited, a new x, y, w or h is
 *  that size's layout and not the widget's own. */
function forDevice(w: Widget, patch: Partial<Widget>): Partial<Widget> {
  const device = useEditorView.getState().device;
  if (device === "desktop" || (patch.x === undefined && patch.y === undefined && patch.w === undefined && patch.h === undefined)) return patch;
  const { x, y, w: width, h, ...rest } = patch;
  return { ...rest, ...placeFor(w, device, { x, y, w: width, h }) };
}

const blankProject = (): Project => ({
  schemaVersion: 6,
  version: "0.1.0",
  datasources: [],
  pages: [{ id: "p1", name: "Main", widgets: [] }],
});

const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/** Deep-clone a project so history snapshots are independent. */
const cloneProject = (p: Project): Project => JSON.parse(JSON.stringify(p)) as Project;

export const useProject = create<State>((set, get) => {
  /** Save current project to undo stack before a mutation. */
  const pushHistory = () => {
    const s = get();
    const past = [...s._past, cloneProject(s.project)].slice(-MAX_HISTORY);
    set({ _past: past, _future: [], canUndo: true, canRedo: false });
  };

  return {
    project: blankProject(),
    activePageId: "p1",
    selectedWidgetId: null,
    _past: [],
    _future: [],
    canUndo: false,
    canRedo: false,

    undo: () => {
      const s = get();
      if (s._past.length === 0) return;
      const past = [...s._past];
      const restored = past.pop()!;
      const future = [cloneProject(s.project), ...s._future].slice(0, MAX_HISTORY);
      set({
        project: restored,
        _past: past,
        _future: future,
        canUndo: past.length > 0,
        canRedo: true,
        selectedWidgetId: null,
      });
    },

    redo: () => {
      const s = get();
      if (s._future.length === 0) return;
      const future = [...s._future];
      const restored = future.shift()!;
      const past = [...s._past, cloneProject(s.project)].slice(-MAX_HISTORY);
      set({
        project: restored,
        _past: past,
        _future: future,
        canUndo: true,
        canRedo: future.length > 0,
        selectedWidgetId: null,
      });
    },

    setActivePage: (id) => set({ activePageId: id, selectedWidgetId: null }),
    selectWidget: (id) => set({ selectedWidgetId: id }),

    addPage: (name) => {
      pushHistory();
      set((s) => {
        const id = uid("page");
        const page: Page = { id, name: name || `Page ${s.project.pages.length + 1}`, widgets: [] };
        return { project: { ...s.project, pages: [...s.project.pages, page] }, activePageId: id };
      });
    },

    duplicatePage: (id) => {
      const src = get().project.pages.find((p) => p.id === id);
      if (!src) return undefined;
      pushHistory();
      const copyId = uid("page");
      const groups = new Map<string, string>();
      const widgets = src.widgets.map((w) => {
        const groupId = w.groupId ? (groups.get(w.groupId) ?? groups.set(w.groupId, `grp-${Math.random().toString(36).slice(2, 8)}`).get(w.groupId)) : undefined;
        return { ...JSON.parse(JSON.stringify(w)) as Widget, id: newWidgetId(), ...(groupId ? { groupId } : {}) };
      });
      set((s) => {
        const i = s.project.pages.findIndex((p) => p.id === id);
        const copy: Page = { ...JSON.parse(JSON.stringify(src)) as Page, id: copyId, name: `${src.name} copy`, widgets };
        const pages = [...s.project.pages.slice(0, i + 1), copy, ...s.project.pages.slice(i + 1)];
        return { project: { ...s.project, pages } };
      });
      return copyId;
    },

    movePage: (id, delta) => {
      const pages = get().project.pages;
      const i = pages.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= pages.length) return;
      pushHistory();
      set((s) => {
        const next = [...s.project.pages];
        [next[i], next[j]] = [next[j]!, next[i]!];
        return { project: { ...s.project, pages: next } };
      });
    },

    renamePage: (id, name) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) => (p.id === id ? { ...p, name } : p)),
        },
      }));
    },

    removePage: (id) => {
      pushHistory();
      set((s) => {
        const pages = s.project.pages.filter((p) => p.id !== id);
        return {
          project: { ...s.project, pages: pages.length ? pages : blankProject().pages },
          activePageId: pages[0]?.id ?? "p1",
        };
      });
    },

    addDatasource: (ds) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, datasources: [...s.project.datasources, ds] } }));
    },

    removeDatasource: (id) => {
      pushHistory();
      set((s) => ({
        project: { ...s.project, datasources: s.project.datasources.filter((d) => d.id !== id) },
      }));
    },

    updateDatasource: (id, patch) => {
      pushHistory();
      set((s) => ({
        project: { ...s.project, datasources: s.project.datasources.map((d) => (d.id === id ? { ...d, ...patch } : d)) },
      }));
    },

    addWidgets: (pageId, ws) => {
      if (!ws.length) return;
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) => p.id === pageId ? { ...p, widgets: [...p.widgets, ...ws] } : p),
        },
        selectedWidgetId: ws[0]!.id,
      }));
    },
    addWidget: (pageId, w) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id === pageId ? { ...p, widgets: [...p.widgets, w] } : p,
          ),
        },
        selectedWidgetId: w.id,
      }));
    },

    updateWidget: (pageId, id, patch) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId
              ? p
              : { ...p, widgets: p.widgets.map((w) => (w.id === id ? { ...w, ...forDevice(w, patch) } : w)) },
          ),
        },
      }));
    },

    setWidgetHidden: (pageId, id, hidden) => {
      const device = useEditorView.getState().device;
      if (device === "desktop") return;
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId ? p : { ...p, widgets: p.widgets.map((w) => (w.id === id ? { ...w, ...placeFor(w, device, { hidden }) } : w)) },
          ),
        },
      }));
    },

    resetWidgetLayout: (pageId, id) => {
      const device = useEditorView.getState().device;
      if (device === "desktop") return;
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId ? p : {
              ...p,
              widgets: p.widgets.map((w) => {
                if (w.id !== id || !w.layout) return w;
                const layout = { ...w.layout };
                delete layout[device];
                const { layout: _old, ...rest } = w;
                return Object.keys(layout).length ? { ...rest, layout } : rest;
              }),
            },
          ),
        },
      }));
    },

    setWidgetTag: (pageId, id, slot, tag) => {
      const w = get().project.pages.find((p) => p.id === pageId)?.widgets.find((x) => x.id === id);
      if (!w) return;
      const bindings: WidgetBindings = { ...w.bindings };
      if (tag) bindings[slot] = tag;
      else delete bindings[slot];
      get().updateWidget(pageId, id, { bindings: Object.keys(bindings).length ? bindings : undefined });
    },

    updateWidgets: (pageId, patches) => {
      pushHistory();
      const patchMap = new Map(patches.map(({ id, patch }) => [id, patch]));
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId ? p : {
              ...p,
              widgets: p.widgets.map((w) => {
                const patch = patchMap.get(w.id);
                return patch ? { ...w, ...forDevice(w, patch) } : w;
              }),
            },
          ),
        },
      }));
    },

    removeWidget: (pageId, id) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id === pageId ? { ...p, widgets: p.widgets.filter((w) => w.id !== id) } : p,
          ),
        },
        selectedWidgetId: null,
      }));
    },

    removeWidgets: (pageId, ids) => {
      pushHistory();
      const idSet = new Set(ids);
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id === pageId ? { ...p, widgets: p.widgets.filter((w) => !idSet.has(w.id)) } : p,
          ),
        },
        selectedWidgetId: null,
      }));
    },

    reorderWidget: (pageId, id, dir) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) => {
            if (p.id !== pageId) return p;
            const ws = [...p.widgets];
            const i = ws.findIndex((w) => w.id === id);
            if (i < 0) return p;
            const item = ws.splice(i, 1)[0]!;
            if (dir === "front")    ws.push(item);
            else if (dir === "back") ws.unshift(item);
            else if (dir === "forward") ws.splice(Math.min(ws.length, i + 1), 0, item);
            else ws.splice(Math.max(0, i - 1), 0, item);
            return { ...p, widgets: ws };
          }),
        },
      }));
    },

    groupWidgets: (pageId, ids) => {
      pushHistory();
      const groupId = `grp-${Math.random().toString(36).slice(2, 8)}`;
      const idSet = new Set(ids);
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId ? p : {
              ...p,
              widgets: p.widgets.map((w) => idSet.has(w.id) ? { ...w, groupId } : w),
            }
          ),
        },
      }));
    },

    ungroupWidgets: (pageId, groupId) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) =>
            p.id !== pageId ? p : {
              ...p,
              widgets: p.widgets.map((w) => w.groupId === groupId ? { ...w, groupId: undefined } : w),
            }
          ),
        },
      }));
    },

    updatePage: (id, patch) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          pages: s.project.pages.map((p) => p.id === id ? { ...p, ...patch } : p),
        },
      }));
    },

    addAlarmRule: (rule) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, alarmRules: [...(s.project.alarmRules ?? []), rule] } }));
    },

    updateAlarmRule: (id, patch) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          alarmRules: (s.project.alarmRules ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        },
      }));
    },

    removeAlarmRule: (id) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          alarmRules: (s.project.alarmRules ?? []).filter((r) => r.id !== id),
        },
      }));
    },

    addRecipe: (recipe) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, recipes: [...(s.project.recipes ?? []), recipe] } }));
    },

    updateRecipe: (id, patch) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          recipes: (s.project.recipes ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
        },
      }));
    },

    addScript: (script) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, scripts: [...(s.project.scripts ?? []), script] } }));
    },

    updateScript: (id, patch) => {
      pushHistory();
      set((s) => ({
        project: { ...s.project, scripts: (s.project.scripts ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) },
      }));
    },

    removeScript: (id) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, scripts: (s.project.scripts ?? []).filter((r) => r.id !== id) } }));
    },

    setSessionVars: (vars) => {
      pushHistory();
      set((s) => {
        const { sessionVars: _old, ...rest } = s.project;
        return { project: vars.length ? { ...rest, sessionVars: vars } : rest };
      });
    },

    setTheme: (theme) => {
      pushHistory();
      set((s) => {
        const { theme: _old, ...rest } = s.project;
        return { project: theme && Object.keys(theme).length ? { ...rest, theme } : rest };
      });
    },

    setShell: (shell) => {
      pushHistory();
      set((s) => {
        const { shell: _old, ...rest } = s.project;
        return { project: shell && Object.keys(shell).length ? { ...rest, shell } : rest };
      });
    },

    setLanguages: (languages) => {
      pushHistory();
      set((s) => {
        const { languages: _l, translations: _t, ...rest } = s.project;
        const keep = Object.fromEntries(Object.entries(s.project.translations ?? {}).filter(([code]) => languages.includes(code) && code !== languages[0]));
        return {
          project: {
            ...rest,
            ...(languages.length ? { languages } : {}),
            ...(Object.keys(keep).length ? { translations: keep } : {}),
          },
        };
      });
    },

    setTranslation: (language, text, value) => {
      pushHistory();
      set((s) => {
        const { translations: old, ...rest } = s.project;
        const table = { ...(old?.[language] ?? {}) };
        if (value) table[text] = value; else delete table[text];
        const all = { ...(old ?? {}), [language]: table };
        if (!Object.keys(table).length) delete all[language];
        return { project: Object.keys(all).length ? { ...rest, translations: all } : rest };
      });
    },

    setScriptRole: (role) => {
      pushHistory();
      set((s) => {
        const { scriptRole: _old, ...rest } = s.project;
        return { project: role ? { ...rest, scriptRole: role } : rest };
      });
    },

    removeRecipe: (id) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          recipes: (s.project.recipes ?? []).filter((r) => r.id !== id),
        },
      }));
    },

    importImage: (asset) => {
      pushHistory();
      set((s) => ({
        project: { ...s.project, images: [...(s.project.images ?? []), asset] },
      }));
    },

    deleteImage: (id) => {
      pushHistory();
      set((s) => ({
        project: { ...s.project, images: (s.project.images ?? []).filter((img) => img.id !== id) },
      }));
    },

    renameImage: (id, name) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          images: (s.project.images ?? []).map((img) => img.id === id ? { ...img, name } : img),
        },
      }));
    },

    addCustomWidget: (fp) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, customWidgets: [...(s.project.customWidgets ?? []), fp] } }));
    },
    updateCustomWidget: (id, patch) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, customWidgets: (s.project.customWidgets ?? []).map((f) => f.id === id ? { ...f, ...patch } : f) } }));
    },
    removeCustomWidget: (id) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, customWidgets: (s.project.customWidgets ?? []).filter((f) => f.id !== id) } }));
    },

    addPreset: (p) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, presets: [...(s.project.presets ?? []), p] } }));
    },
    updatePreset: (id, patch) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, presets: (s.project.presets ?? []).map((p) => p.id === id ? { ...p, ...patch } : p) } }));
    },
    removePreset: (id) => {
      pushHistory();
      set((s) => {
        const presets = (s.project.presets ?? []).filter((p) => p.id !== id);
        return { project: { ...s.project, presets: presets.length ? presets : undefined } };
      });
    },
    upsertNamespaceNode: (node) => {
      pushHistory();
      set((s) => {
        const existing = s.project.namespace ?? [];
        const idx = existing.findIndex((n) => n.path === node.path);
        const next = idx >= 0
          ? existing.map((n, i) => i === idx ? node : n)
          : [...existing, node];
        return { project: { ...s.project, namespace: next } };
      });
    },
    upsertNamespaceNodes: (nodes) => {
      if (!nodes.length) return;
      pushHistory();
      set((s) => {
        const byPath = new Map((s.project.namespace ?? []).map((n) => [n.path, n] as const));
        for (const n of nodes) byPath.set(n.path, n);
        return { project: { ...s.project, namespace: [...byPath.values()] } };
      });
    },
    moveNamespaceNode: (from, to) => {
      const moved = moveNsNode(get().project, from, to);
      if (moved.error) return { error: moved.error };
      if (from === to) return {};
      pushHistory();
      set({ project: moved.project });
      return {};
    },
    removeNamespaceNode: (path) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          // The node and its children; "plant.pump1" leaves "plant.pump10" alone.
          namespace: (s.project.namespace ?? []).filter((n) => n.path !== path && !n.path.startsWith(`${path}.`)),
        },
      }));
    },

    loadProject: (p) =>
      set({
        project: p,
        activePageId: p.pages[0]?.id ?? "p1",
        selectedWidgetId: null,
        _past: [],
        _future: [],
        canUndo: false,
        canRedo: false,
      }),

    addDefaultChrome: () => {
      pushHistory();
      set((s) => {
        const have = { customWidgets: s.project.customWidgets, frame: s.project.shell?.frame };
        const add = missingDefaults(have);
        return { project: {
          ...s.project,
          customWidgets: [...(s.project.customWidgets ?? []), ...add.customWidgets],
          shell: { ...s.project.shell, chrome: "custom", frame: [...(s.project.shell?.frame ?? []), ...add.frame] },
        } };
      });
    },

    newProject: (opts) =>
      set({
        project: opts?.chrome === "custom"
          ? { ...blankProject(), customWidgets: defaultCustomWidgets(), shell: { chrome: "custom", frame: defaultFrame() } }
          : blankProject(),
        activePageId: "p1",
        selectedWidgetId: null,
        _past: [],
        _future: [],
        canUndo: false,
        canRedo: false,
      }),

    exportJSON: () => {
      // Exclude internal undo state from export.
      const { project } = get();
      return JSON.stringify(project, null, 2);
    },
  };
});

export const newWidgetId = () => uid("w");

// ── Virtual datasource sync ────────────────────────────────────────────────
import { virtualTagStore } from "./virtualTagStore";

let _lastVirtualIds: string[] = [];
useProject.subscribe((state) => {
  const ids = state.project.datasources
    .filter((d) => d.type === "virtual")
    .map((d) => d.id);
  const added   = ids.filter((id) => !_lastVirtualIds.includes(id));
  const removed = _lastVirtualIds.filter((id) => !ids.includes(id));
  added.forEach((id)   => virtualTagStore.registerDatasource(id));
  removed.forEach((id) => virtualTagStore.unregisterDatasource(id));
  _lastVirtualIds = ids;
});

// ── LocalStorage auto-save / auto-restore ──────────────────────────────────

const LS_KEY = "speths-screens-project-v1";

/** Restore any previously saved project from localStorage on startup. */
(function restoreFromStorage() {
  try {
    const raw = readStored(LS_KEY);
    if (!raw) return;
    const o = openProject(JSON.parse(raw));
    if (o.ok) useProject.getState().loadProject(o.project);
    else console.warn("[IDE] the autosaved project was not restored:", o.problems);
  } catch {
    // ignore parse errors — blank project is fine
  }
})();

/** Auto-save whenever anything in state changes (debounced 1 s, saves only project). */
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
useProject.subscribe((state) => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.project));
    } catch { /* storage full or private mode */ }
  }, 1000);
});
