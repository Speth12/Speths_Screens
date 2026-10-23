// Zustand store for the in-memory project (the JSON edited by the IDE).
import { create } from "zustand";

export type NamespaceNodeType = "folder" | "asset" | "tag" | "virtual";

export type NamespaceNode = {
  path: string;
  type: NamespaceNodeType;
  dataType?: string;
  description?: string;
  unit?: string;
  driverId?: string;
  driverAddr?: string;
  expression?: string;
  meta?: Record<string, string>;
};

export type WidgetType =
  | "gauge" | "trend" | "led" | "button" | "numericInput"
  | "numericDisplay" | "textInput" | "textDisplay" | "historyLog"
  | "tank" | "setpoint" | "multiState" | "alarmBanner" | "image" | "symbol"
  | "faceplate" | "table";

export type UDTField = {
  name: string;
  type: "bool" | "int" | "real" | "string";
  unit?: string;
  description?: string;
};

export type UDT = {
  id: string;
  name: string;
  description?: string;
  fields: UDTField[];
};

export type AssetNode = {
  id: string;
  name: string;
  parentId?: string;
  description?: string;
  tagPrefix?: string;
  udtId?: string;
  iconType?: "plant" | "area" | "unit" | "device" | "sensor";
};

export type FaceplateParam = { name: string; description?: string };
export type FaceplateWidget = Omit<Widget, "id"> & { localId: string };
export type Faceplate = {
  id: string;
  name: string;
  description?: string;
  params: FaceplateParam[];
  widgets: FaceplateWidget[];
};

export type DynActionType =
  | "writeValue" | "toggleValue" | "incrementValue"
  | "navigate" | "openUrl";

export type Dynamic = {
  id: string;
  kind: "visibility" | "colorFill" | "blink" | "rotation" | "disable"
      | "onClick" | "onPressed" | "onReleased" | "script";
  // property dynamics — tag binding
  binding?: string;
  // colorFill: truthy/falsy → color ring
  trueColor?: string;
  falseColor?: string;
  // blink: flash when tag is truthy
  blinkPeriodMs?: number;
  blinkColor?: string;
  // rotation: map value range → angle range
  minValue?: number;
  maxValue?: number;
  minAngle?: number;
  maxAngle?: number;
  // action dynamics
  actionType?: DynActionType;
  writeTo?: string;       // binding to write to (may differ from read binding)
  writeValue?: unknown;   // for writeValue
  step?: number;          // for incrementValue
  pageId?: string;        // for navigate
  url?: string;           // for openUrl
  // script dynamic — JS expression evaluated with `value` = tag value
  expression?: string;    // e.g. "value > 5000"
  targetProp?: string;    // config key to override: "bgColor" | "borderColor" | "textColor" | "visible"
  trueValue?: string;     // applied when expression is truthy
  falseValue?: string;    // applied when expression is falsy
};

export type Widget = {
  id: string;
  type: WidgetType;
  x: number; y: number; w: number; h: number;
  binding?: string;
  visibleBinding?: string;
  locked?: boolean;
  groupId?: string;
  config?: Record<string, unknown>;
  dynamics?: Dynamic[];
};

export type Page = { id: string; name: string; widgets: Widget[]; backgroundColor?: string; script?: string };

export type DatasourceType = "opcua" | "mbtcp" | "mqtt" | "rest" | "virtual";
export type Datasource = {
  id: string;
  type: DatasourceType;
  label: string;
  config: Record<string, unknown>;
};

export type AlarmCondition = "gt" | "gte" | "lt" | "lte" | "eq" | "ne";
export type AlarmSeverity = "critical" | "warning" | "info";

export type AlarmRule = {
  id: string;
  name: string;
  binding: string;      // "dsId:tagPath"
  condition: AlarmCondition;
  threshold: number;
  severity: AlarmSeverity;
  message: string;
};

export type RecipeEntry = {
  binding: string;   // "dsId:tagPath"
  value: unknown;    // value to write
};

export type Recipe = {
  id: string;
  name: string;
  description?: string;
  entries: RecipeEntry[];
};

export type ImageAsset = {
  id: string;
  name: string;
  dataUrl: string;   // base64 data URL
  mimeType: string;
  width: number;
  height: number;
  size: number;      // bytes (original file size)
};

export type CanvasResolution =
  | { type: "dynamic" }
  | { type: "fixed"; width: number; height: number };

export type CanvasSnap = "grid" | "pixel";

export type UserRole = "admin" | "operator" | "viewer";
export type ProjectUser = { id: string; name: string; pin: string; role: UserRole };

export type Project = {
  version: string;
  name?: string;
  pin?: string;
  viewOnly?: boolean;
  datasources: Datasource[];
  pages: Page[];
  alarmRules?: AlarmRule[];
  recipes?: Recipe[];
  images?: ImageAsset[];
  canvasResolution?: CanvasResolution;
  canvasSnap?: CanvasSnap;
  enabledSymbolPacks?: string[];
  users?: ProjectUser[];
  udts?: UDT[];
  assets?: AssetNode[];
  faceplates?: Faceplate[];
  namespace?: NamespaceNode[];
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

  addDatasource: (ds: Datasource) => void;
  removeDatasource: (id: string) => void;

  addWidget: (pageId: string, w: Widget) => void;
  updateWidget: (pageId: string, id: string, patch: Partial<Widget>) => void;
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

  importImage: (asset: ImageAsset) => void;
  deleteImage: (id: string) => void;
  renameImage: (id: string, name: string) => void;

  addUDT: (udt: UDT) => void;
  updateUDT: (id: string, patch: Partial<UDT>) => void;
  removeUDT: (id: string) => void;

  addAsset: (node: AssetNode) => void;
  updateAsset: (id: string, patch: Partial<AssetNode>) => void;
  removeAsset: (id: string) => void;

  addFaceplate: (fp: Faceplate) => void;
  updateFaceplate: (id: string, patch: Partial<Faceplate>) => void;
  removeFaceplate: (id: string) => void;

  upsertNamespaceNode: (node: NamespaceNode) => void;
  removeNamespaceNode: (path: string) => void;

  loadProject: (p: Project) => void;
  newProject: () => void;
  exportJSON: () => string;
};

const blankProject = (): Project => ({
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
              : { ...p, widgets: p.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) },
          ),
        },
      }));
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
                return patch ? { ...w, ...patch } : w;
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

    addUDT: (udt) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, udts: [...(s.project.udts ?? []), udt] } }));
    },
    updateUDT: (id, patch) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, udts: (s.project.udts ?? []).map((u) => u.id === id ? { ...u, ...patch } : u) } }));
    },
    removeUDT: (id) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, udts: (s.project.udts ?? []).filter((u) => u.id !== id) } }));
    },

    addAsset: (node) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, assets: [...(s.project.assets ?? []), node] } }));
    },
    updateAsset: (id, patch) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, assets: (s.project.assets ?? []).map((a) => a.id === id ? { ...a, ...patch } : a) } }));
    },
    removeAsset: (id) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, assets: (s.project.assets ?? []).filter((a) => a.id !== id) } }));
    },

    addFaceplate: (fp) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, faceplates: [...(s.project.faceplates ?? []), fp] } }));
    },
    updateFaceplate: (id, patch) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, faceplates: (s.project.faceplates ?? []).map((f) => f.id === id ? { ...f, ...patch } : f) } }));
    },
    removeFaceplate: (id) => {
      pushHistory();
      set((s) => ({ project: { ...s.project, faceplates: (s.project.faceplates ?? []).filter((f) => f.id !== id) } }));
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
    removeNamespaceNode: (path) => {
      pushHistory();
      set((s) => ({
        project: {
          ...s.project,
          namespace: (s.project.namespace ?? []).filter((n) => !n.path.startsWith(path)),
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

    newProject: () =>
      set({
        project: blankProject(),
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

const LS_KEY = "xhmi-project-v1";

/** Restore any previously saved project from localStorage on startup. */
(function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Project;
    if (saved && saved.version && Array.isArray(saved.pages)) {
      useProject.getState().loadProject(saved);
    }
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
