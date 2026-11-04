// The IDE's side of the widget library (@speths-screens/widgets): the
// host the canvas and preview draw with.
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
