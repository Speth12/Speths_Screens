// The IDE's side of the widget library (@speths-screens/widgets): the
// host the canvas and preview draw with, and the palette registrations.
import { useMemo } from "react";
import {
  WidgetHostProvider, WidgetRenderer as LibraryRenderer,
  type AlarmView, type WidgetHost, type WriteRequest,
} from "@speths-screens/widgets";
import type { Widget } from "../store/projectStore";
import { useProject } from "../store/projectStore";
import { useTag } from "../hooks/useTag";
import { useTags } from "../hooks/useTags";
import { apiFetch } from "../store/runtimeAuth";
import { useClientAlarms } from "../store/alarmEngine";
import { registerWidget } from "./widgetRegistry";

/** POST a value to the runtime's write pipeline. Binding is "dsId:tagPath".
 *  Failures show up as the value not changing; a view-only project writes nothing. */
async function writeTag(req: WriteRequest): Promise<void> {
  if (useProject.getState().project.viewOnly) return;
  const sep = req.binding.indexOf(":");
  if (sep < 0) return;
  const datasource = req.binding.slice(0, sep);
  const path = req.binding.slice(sep + 1);
  try {
    await apiFetch(`/api/v1/tag/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasource, value: req.value, widgetId: req.widgetId }),
    });
  } catch {
    // swallow — write failures visible as stale read values
  }
}

/** The IDE previews alarms with its own client-side engine; no acknowledge. */
function useIdeAlarms(): { alarms: AlarmView[] } {
  const active = useClientAlarms();
  return useMemo(() => ({
    alarms: active.map((a) => ({
      id: a.ruleId, severity: a.severity, ruleName: a.name, message: a.message,
      value: a.value, active: true, acked: false, since: a.since,
    })),
  }), [active]);
}

function useIdeImage(id: string): string | undefined {
  return useProject((s) => (id ? s.project.images?.find((img) => img.id === id)?.dataUrl : undefined));
}

function useIdeFaceplate(id: string | undefined) {
  return useProject((s) => (id ? s.project.faceplates?.find((f) => f.id === id) : undefined));
}

export const ideHost: WidgetHost = {
  useTag,
  useTags,
  requestWrite: (req) => void writeTag(req),
  write: (req) => void writeTag(req),
  navigate: (pageId) => useProject.getState().setActivePage(pageId),
  apiFetch,
  useAlarms: useIdeAlarms,
  useImage: useIdeImage,
  useFaceplate: useIdeFaceplate,
};

export function WidgetRenderer({ w }: { w: Widget }) {
  return (
    <WidgetHostProvider value={ideHost}>
      <LibraryRenderer w={w} />
    </WidgetHostProvider>
  );
}

// ── registrations ─────────────────────────────────────────────────────────
// Palette metadata. PropertiesPanel is registered separately in Properties.tsx.

registerWidget({ type: "gauge",          label: "Gauge",       defaultW: 4, defaultH: 3 });
registerWidget({ type: "numericDisplay", label: "Numeric",     defaultW: 3, defaultH: 2 });
registerWidget({ type: "textDisplay",    label: "Text",        defaultW: 4, defaultH: 2 });
registerWidget({ type: "led",            label: "LED",         defaultW: 2, defaultH: 2 });
registerWidget({ type: "tank",           label: "Tank",        defaultW: 2, defaultH: 4 });
registerWidget({ type: "button",         label: "Button",      defaultW: 3, defaultH: 2 });
registerWidget({ type: "setpoint",       label: "Setpoint",    defaultW: 4, defaultH: 2 });
registerWidget({ type: "multiState",     label: "Multi-State", defaultW: 3, defaultH: 2 });
registerWidget({ type: "trend",          label: "Trend",       defaultW: 6, defaultH: 4 });
registerWidget({ type: "numericInput",   label: "Numeric In",  defaultW: 3, defaultH: 2 });
registerWidget({ type: "textInput",      label: "Text In",     defaultW: 3, defaultH: 2 });
registerWidget({ type: "historyLog",     label: "History",     defaultW: 6, defaultH: 4 });
registerWidget({ type: "alarmBanner",    label: "Alarms",      defaultW: 6, defaultH: 3 });
registerWidget({ type: "image",          label: "Image",       defaultW: 4, defaultH: 3 });
registerWidget({ type: "faceplate",      label: "Faceplate",   defaultW: 4, defaultH: 4 });
registerWidget({ type: "table",          label: "Table",       defaultW: 4, defaultH: 4 });
