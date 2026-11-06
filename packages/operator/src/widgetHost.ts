// The operator screen's side of the widget library: tag values from the
// runtime's WebSocket, writes through the write pipeline client, alarms from
// the runtime with acknowledge, and the project's images and custom widgets.
import { useMemo } from "react";
import { appTag, deviceFor, findCustomWidget, splitApp, translator, type AppValues, type DriverInfo, type AlarmView, type Device, type WidgetHost, type WriteRequest } from "@speths-screens/widgets";
import type { Project } from "@speths-screens/shared-types";
import { useTag } from "./hooks/useTag";
import { useTags } from "./hooks/useTags";
import { writeTag } from "./writeTag";
import { apiFetch } from "./auth";
import { useAlarms } from "./alarmContext";
import { useWindowWidth } from "./useWindowWidth";
import { tokenUser } from "./user";

const NO_DRIVERS: DriverInfo[] = [];
const NO_PAGES: Project["pages"] = [];
/** The id the built-in Settings screen goes by in the page list. */
export const SETTINGS_PAGE_ID = "settings";
const SETTINGS_PAGE = { id: SETTINGS_PAGE_ID, name: "Settings", icon: "settings" as const, widgets: [] };
const NO_RECIPES: NonNullable<Project["recipes"]> = [];

/** The screen size, from the window's width (the same rule the operator draws pages by). */
function useOperatorDevice(): Device {
  return deviceFor(useWindowWidth());
}

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
/** What the header widgets show that the project does not hold: the datasources' state and who is signed in. */
export type OperatorShell = { drivers?: DriverInfo[]; token?: string | null; loginRequired?: boolean; onLogout?: () => void;
  /** The page list also offers the built-in Settings screen, which navigate("settings") opens. */
  settings?: boolean };

export function useOperatorHost(project: Project | null, navigate: (pageId: string) => void, language?: string, app: AppValues = {}, shell: OperatorShell = {}): WidgetHost {
  const viewOnly = !!project?.viewOnly;
  const images = project?.images;
  const customWidgets = project?.customWidgets;
  const languages = project?.languages;
  const translations = project?.translations;
  const { pageName, pageId, projectName } = app;
  const pages = project?.pages;
  const recipes = project?.recipes ?? NO_RECIPES;
  const { drivers = NO_DRIVERS, token = null, loginRequired = false, onLogout, settings = false } = shell;
  return useMemo(() => {
    const translate = translator({ languages, translations }, language);
    const send = (req: WriteRequest) => {
      if (!viewOnly) void writeTag(req.binding, req.value, req.widgetId);
    };
    // app:pageName and the like are answered here; the page name reads in the language shown.
    const values: AppValues = { pageName: pageName === undefined ? undefined : translate(pageName), pageId, projectName };
    const useAppTag = (path: string | undefined) => {
      const mine = appTag(path, values);
      const live = useTag(mine ? undefined : path);
      return mine ?? live;
    };
    const useAppTags = (paths: string[]) => {
      const { app: mine, rest } = splitApp(paths, values);
      const live = useTags(rest);
      return useMemo(() => ({ ...live, ...mine }), [live, mine]);
    };
    return {
      useTag: useAppTag,
      useTags: useAppTags,
      requestWrite: send,
      write: send,
      navigate,
      apiFetch,
      useAlarms: useOperatorAlarms,
      useImage: (id: string) => (id ? images?.find((img) => img.id === id)?.dataUrl : undefined),
      useCustomWidget: (id: string | undefined) => findCustomWidget({ customWidgets }, id),
      useTranslate: () => translate,
      useDevice: useOperatorDevice,
      usePages: () => ({ pages: settings ? [...(pages ?? NO_PAGES), SETTINGS_PAGE] : pages ?? NO_PAGES, activeId: pageId }),
      useDrivers: () => drivers,
      useRecipes: () => recipes,
      useUser: () => {
        const user = tokenUser(token);
        return { name: user?.name, role: user?.role, loginRequired, logout: user ? onLogout : undefined };
      },
    };
  }, [viewOnly, images, customWidgets, languages, translations, language, navigate, pageName, pageId, projectName, pages, recipes, drivers, token, loginRequired, onLogout, settings]);
}
