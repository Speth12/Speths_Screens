// Messages between a page script's worker and the page that runs it.

import type { CommonApi, PageScriptApi, WriteResult } from "../api";

export type { CommonApi, PageScriptApi, WriteResult };

/** What page scripts get: the common names and the page-only ones. */
export type PageApi = CommonApi & PageScriptApi;

export interface TagState {
  value: unknown;
  quality: string;
}

/** Page to worker. */
export type HostMessage =
  | { t: "ping" }
  | { t: "tags"; tags: Record<string, TagState> }
  | { t: "writeResult"; id: number; result: WriteResult }
  | { t: "event"; type: string; payload: unknown };

/** Worker to page. */
export type WorkerMessage =
  | { t: "pong" }
  | { t: "watch"; paths: string[] }
  | { t: "write"; id: number; path: string; value: unknown }
  | { t: "log"; line: string }
  | { t: "emit"; type: string; payload: unknown }
  | { t: "on"; type: string }
  | { t: "navigate"; page: string }
  | { t: "error"; message: string };

/** The parts of a worker's global scope the worker side uses. */
export interface WorkerScope {
  postMessage(m: WorkerMessage): void;
  onmessage: ((e: { data: HostMessage }) => void) | null;
  setInterval(fn: () => void, ms: number): unknown;
  setTimeout(fn: () => void, ms: number): unknown;
}

/** The parts of a Worker the page side uses. */
export interface WorkerLike {
  postMessage(m: HostMessage): void;
  onmessage: ((e: { data: WorkerMessage }) => void) | null;
  onerror: ((e: { message: string; lineno?: number }) => void) | null;
  terminate(): void;
}
