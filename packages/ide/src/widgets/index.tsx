// The IDE's side of the widget library (@speths-screens/widgets): the
// host the canvas and preview draw with.
import { useMemo } from "react";
import {
  WidgetHostProvider, WidgetRenderer as LibraryRenderer, pickLanguage, translator,
  type AlarmView, type WidgetHost, type WriteRequest,
} from "@speths-screens/widgets";
import type { Widget } from "../store/projectStore";
import { useProject } from "../store/projectStore";
import { useTag } from "../hooks/useTag";
import { useTags } from "../hooks/useTags";
import { useDummyTag, useDummyTags } from "../hooks/useDummy";
import { apiFetch } from "../store/runtimeAuth";
import { sessionName } from "@speths-screens/script-api";
import { sessionStore } from "../store/session";
import { useClientAlarms } from "../store/alarmEngine";
import { useEditorView } from "../store/editorView";

/** POST a value to the runtime's write pipeline. Binding is "dsId:tagPath".
 *  Failures show up as the value not changing; a view-only project writes nothing. */
async function writeTag(req: WriteRequest): Promise<void> {
  if (useProject.getState().project.viewOnly) return;
  const session = sessionName(req.binding);
  if (session !== undefined) { sessionStore.set(session, req.value); return; }
  // Made-up values are not the plant's: a write must not reach a real PLC.
  if (useEditorView.getState().data === "dummy") return;
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

const isSession = (path: string) => sessionName(path) !== undefined;

/** A tag's value: the runtime's, or a made-up one while the editor shows made-up data. A session
 *  variable is always the tab's own. */
function useIdeTag(path: string | undefined) {
  const dummy = useEditorView((s) => s.data === "dummy") && !!path && !isSession(path);
  const live = useTag(dummy ? undefined : path);
  const fake = useDummyTag(dummy ? path : undefined);
  return dummy ? fake : live;
}

function useIdeTags(paths: string[]) {
  const dummy = useEditorView((s) => s.data === "dummy");
  const live = useTags(dummy ? paths.filter(isSession) : paths);
  const fake = useDummyTags(dummy ? paths.filter((p) => !isSession(p)) : []);
  return useMemo(() => ({ ...live, ...fake }), [live, fake]);
}

/** The text in the language the editor is showing (Preview language), from the project's table. */
function useIdeTranslate() {
  const languages = useProject((s) => s.project.languages);
  const translations = useProject((s) => s.project.translations);
  const wanted = useEditorView((s) => s.language);
  return useMemo(() => translator({ languages, translations }, pickLanguage({ languages }, wanted)), [languages, translations, wanted]);
}

export const ideHost: WidgetHost = {
  useTag: useIdeTag,
  useTags: useIdeTags,
  requestWrite: (req) => void writeTag(req),
  write: (req) => void writeTag(req),
  navigate: (pageId) => useProject.getState().setActivePage(pageId),
  apiFetch,
  useAlarms: useIdeAlarms,
  useImage: useIdeImage,
  useFaceplate: useIdeFaceplate,
  useTranslate: useIdeTranslate,
};

export function WidgetRenderer({ w }: { w: Widget }) {
  return (
    <WidgetHostProvider value={ideHost}>
      <LibraryRenderer w={w} />
    </WidgetHostProvider>
  );
}
