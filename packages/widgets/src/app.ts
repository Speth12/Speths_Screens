// Values the app itself knows, read like a tag as `app:name` so a custom widget can show them
// without a parameter: the project's name and the page being shown. A host answers these paths from
// its own state before it asks the runtime, which has no datasource called "app".
import type { TagState } from "./host";

export const APP_PREFIX = "app:";

/** The names a project can read: `app:pageName`, `app:pageId`, `app:projectName`. */
export type AppValues = { pageName?: string; pageId?: string; projectName?: string };

export const APP_NAMES = ["pageName", "pageId", "projectName"] as const;

export const isAppPath = (path: string | undefined): path is string => !!path && path.startsWith(APP_PREFIX);

/** What `path` reads, or undefined when it is not an app value. A name the app has no value for is Bad. */
export function appTag(path: string | undefined, values: AppValues): TagState | undefined {
  if (!isAppPath(path)) return undefined;
  const v = (values as Record<string, string | undefined>)[path.slice(APP_PREFIX.length)];
  return v === undefined ? { value: null, quality: "Bad", ts: 0 } : { value: v, quality: "Good", ts: 0 };
}

/** The app values among `paths`, and the rest. */
export function splitApp(paths: string[], values: AppValues): { app: Record<string, TagState>; rest: string[] } {
  const app: Record<string, TagState> = {};
  const rest: string[] = [];
  for (const p of paths) {
    const t = appTag(p, values);
    if (t) app[p] = t; else rest.push(p);
  }
  return { app, rest };
}
