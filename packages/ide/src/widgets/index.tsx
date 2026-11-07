// The IDE's side of the widget library (@speths-screens/widgets): the
// host the canvas and preview draw with.
import { useMemo } from "react";
import {
  WidgetHostProvider, WidgetRenderer as LibraryRenderer, appTag, findCustomWidget, pickLanguage, splitApp, translator,
  type AlarmView, type AppValues, type DriverInfo, type UserInfo, type WidgetHost, type WriteRequest,
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

function useIdeCustomWidget(id: string | undefined) {
  const customWidgets = useProject((s) => s.project.customWidgets);
  return findCustomWidget({ customWidgets }, id);
}

const isSession = (path: string) => sessionName(path) !== undefined;

/** app:pageName and the like, for the page open in the editor. */
function useAppValues(): AppValues {
  const name = useProject((s) => s.project.name);
  const page = useProject((s) => s.project.pages.find((p) => p.id === s.activePageId) ?? s.project.pages[0]);
  return useMemo(() => ({ projectName: name, pageName: page?.name, pageId: page?.id }), [name, page?.name, page?.id]);
}

/** A tag's value: the runtime's, or a made-up one while the editor shows made-up data. A session
 *  variable is always the tab's own. */
function useIdeTag(path: string | undefined) {
  const app = useAppValues();
  const mine = appTag(path, app);
  const dummy = useEditorView((s) => s.data === "dummy") && !!path && !isSession(path) && !mine;
  const live = useTag(dummy || mine ? undefined : path);
  const fake = useDummyTag(dummy ? path : undefined);
  return mine ?? (dummy ? fake : live);
}

function useIdeTags(paths: string[]) {
  const app = useAppValues();
  const { app: mine, rest } = splitApp(paths, app);
  const dummy = useEditorView((s) => s.data === "dummy");
  const live = useTags(dummy ? rest.filter(isSession) : rest);
  const fake = useDummyTags(dummy ? rest.filter((p) => !isSession(p)) : []);
  return useMemo(() => ({ ...live, ...fake, ...mine }), [live, fake, mine]);
}

/** The text in the language the editor is showing (Preview language), from the project's table. */
function useIdeTranslate() {
  const languages = useProject((s) => s.project.languages);
  const translations = useProject((s) => s.project.translations);
  const wanted = useEditorView((s) => s.language);
  return useMemo(() => translator({ languages, translations }, pickLanguage({ languages }, wanted)), [languages, translations, wanted]);
}

/** The pages, with the one open in the editor as the active one, and the operator's Settings screen
 *  last, as the operator lists it (the editor has no Settings screen to open). */
const SETTINGS_PAGE = { id: "settings", name: "Settings", icon: "settings" as const, widgets: [] };
function useIdePages() {
  const pages = useProject((s) => s.project.pages);
  const activeId = useProject((s) => s.activePageId);
  return useMemo(() => ({ pages: [...pages, SETTINGS_PAGE], activeId }), [pages, activeId]);
}

/** The datasources, drawn as connected: the editor does not know the runtime's state. */
function useIdeDrivers(): DriverInfo[] {
  const datasources = useProject((s) => s.project.datasources);
  return useMemo(() => datasources.map((d) => ({ id: d.id, label: d.label, connected: true })), [datasources]);
}

function useIdeRecipes() {
  return useProject((s) => s.project.recipes) ?? NO_RECIPES;
}
const NO_RECIPES: never[] = [];

function useIdeUser(): UserInfo {
  const loginRequired = useProject((s) => s.project.security?.mode === "login");
  return useMemo(() => ({ loginRequired }), [loginRequired]);
}

export const ideHost: WidgetHost = {
  useTag: useIdeTag,
  useTags: useIdeTags,
  requestWrite: (req) => void writeTag(req),
  write: (req) => void writeTag(req),
  navigate: (pageId) => { if (useProject.getState().project.pages.some((p) => p.id === pageId)) useProject.getState().setActivePage(pageId); },
  apiFetch,
  useAlarms: useIdeAlarms,
  useImage: useIdeImage,
  useCustomWidget: useIdeCustomWidget,
  useDevice: () => useEditorView((s) => s.device),
  usePages: useIdePages,
  useDrivers: useIdeDrivers,
  useUser: useIdeUser,
  useRecipes: useIdeRecipes,
  useTranslate: useIdeTranslate,
};

export function WidgetRenderer({ w }: { w: Widget }) {
  return (
    <WidgetHostProvider value={ideHost}>
      <LibraryRenderer w={w} />
    </WidgetHostProvider>
  );
}
