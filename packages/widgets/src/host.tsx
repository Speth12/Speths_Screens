// The widget host: everything a widget needs from the app that draws it.
// The IDE (canvas, preview) and the operator screen each provide one; the
// widgets never import app code, so one library serves both.
import { createContext, useContext } from "react";
import type { Faceplate } from "@speths-screens/shared-types";

export type Quality = "Good" | "Bad" | "Uncertain" | "Unknown";

export type TagState = {
  value: unknown;
  quality: Quality;
  ts: number;
  reason?: string;
};

export type WriteRequest = {
  binding: string;
  value: unknown;
  /** Human-readable description of the value, e.g. "ON (1)". */
  label?: string;
  /** The writing widget, so its min/max apply on the runtime. */
  widgetId?: string;
};

/** One alarm as the banner shows it. */
export type AlarmView = {
  id: string;
  severity: string;
  ruleName?: string;
  message: string;
  value?: number;
  active: boolean;
  acked: boolean;
  /** When it started, ms since the epoch. */
  since?: number;
};

export interface WidgetHost {
  /** Live value of a tag; an empty path gives an Unknown state. */
  useTag(path: string | undefined): TagState;
  /** Live values of several tags, by path. */
  useTags(paths: string[]): Record<string, TagState>;
  /** A write the operator asked for (toggle, input, slider, action). The
   *  host may ask for confirmation, or refuse it for a view-only project. */
  requestWrite(req: WriteRequest): void;
  /** A write that must go out at once: a momentary button's press and
   *  release. The host still refuses it for a view-only project. */
  write(req: WriteRequest): void;
  navigate(pageId: string): void;
  /** fetch an API path on the runtime, with the login token. */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
  useAlarms(): { alarms: AlarmView[]; ack?: (id: string) => void };
  /** The data URL of a project library image. */
  useImage(id: string): string | undefined;
  useFaceplate(id: string | undefined): Faceplate | undefined;
}

export const EMPTY_TAG: TagState = { value: null, quality: "Unknown", ts: 0 };
const NO_ALARMS = { alarms: [] as AlarmView[] };

/** A host with nothing behind it: no values, writes go nowhere. */
export const inertHost: WidgetHost = {
  useTag: () => EMPTY_TAG,
  useTags: () => ({}),
  requestWrite: () => {},
  write: () => {},
  navigate: () => {},
  apiFetch: () => Promise.resolve(new Response("[]", { status: 200 })),
  useAlarms: () => NO_ALARMS,
  useImage: () => undefined,
  useFaceplate: () => undefined,
};

const HostContext = createContext<WidgetHost>(inertHost);

export const WidgetHostProvider = HostContext.Provider;

export function useHost(): WidgetHost {
  return useContext(HostContext);
}

export function useTag(path: string | undefined): TagState {
  return useHost().useTag(path);
}

export function useTags(paths: string[]): Record<string, TagState> {
  return useHost().useTags(paths);
}
