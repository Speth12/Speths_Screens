// Central widget registry — palette metadata + renderer lookup.
// Add a new widget type by calling registerWidget() from any module that
// is transitively imported by the app (index.tsx → canvas/palette → App).

import type { Widget, Project, Page } from "../store/projectStore";

// Props passed to every per-widget Properties panel component.
export type PropertiesPanelProps = {
  w: Widget;
  page: Page;
  project: Project;
  setConfig: (k: string, v: unknown) => void;
  cfgStr: (k: string, def?: string) => string;
  cfgNum: (k: string, def?: number) => number | undefined;
  cfgBool: (k: string, def?: boolean) => boolean;
  inp: string;
  numInp: string;
  label: (text: string) => React.ReactNode;
};

export type WidgetDef = {
  type: string;
  label: string;
  defaultW: number;
  defaultH: number;
  // Optional custom properties panel shown in the IDE sidebar.
  PropertiesPanel?: React.FC<PropertiesPanelProps>;
};

const _registry = new Map<string, WidgetDef>();

// Register or extend a widget definition. Calling twice with the same type
// merges the definitions (later call wins per-key), so palette metadata and
// PropertiesPanel can be registered from separate modules.
export const registerWidget = (def: WidgetDef): void => {
  const existing = _registry.get(def.type);
  _registry.set(def.type, existing ? { ...existing, ...def } : def);
};

export const getWidget = (type: string): WidgetDef | undefined => _registry.get(type);

export const allWidgets = (): WidgetDef[] => [..._registry.values()];
