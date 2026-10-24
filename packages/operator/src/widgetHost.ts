// The operator screen's side of the widget library: tag values from the
// runtime's WebSocket, writes through the write pipeline client, alarms from
// the runtime with acknowledge, and the project's images and faceplates.
import { useMemo } from "react";
import type { AlarmView, WidgetHost, WriteRequest } from "@speths-screens/widgets";
import type { Project } from "@speths-screens/shared-types";
import { useTag } from "./hooks/useTag";
import { useTags } from "./hooks/useTags";
import { writeTag } from "./writeTag";
import { apiFetch } from "./auth";
import { useAlarms } from "./alarmContext";

function useOperatorAlarms(): { alarms: AlarmView[]; ack: (id: string) => void } {
  const { alarms, ack } = useAlarms();
  return useMemo(() => ({
    alarms: alarms.map((a) => ({
      id: a.id, severity: a.severity, ruleName: a.ruleName, message: a.message,
      value: a.value, active: a.active, acked: a.acked,
    })),
    ack,
  }), [alarms, ack]);
}

/** The host for the loaded project. A view-only project writes nothing,
 *  momentary button presses included. */
export function useOperatorHost(project: Project | null, navigate: (pageId: string) => void): WidgetHost {
  const viewOnly = !!project?.viewOnly;
  const images = project?.images;
  const faceplates = project?.faceplates;
  return useMemo(() => {
    const send = (req: WriteRequest) => {
      if (!viewOnly) void writeTag(req.binding, req.value, req.widgetId);
    };
    return {
      useTag,
      useTags,
      requestWrite: send,
      write: send,
      navigate,
      apiFetch,
      useAlarms: useOperatorAlarms,
      useImage: (id: string) => (id ? images?.find((img) => img.id === id)?.dataUrl : undefined),
      useFaceplate: (id: string | undefined) => (id ? faceplates?.find((f) => f.id === id) : undefined),
    };
  }, [viewOnly, images, faceplates, navigate]);
}
