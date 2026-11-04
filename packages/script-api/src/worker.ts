// The page script's side of the worker (Phase 4, decision 5).
//
// workerMain is turned into text (Function.prototype.toString) and put in
// the worker's source in front of the script, so it must be self-contained:
// no imports, no outside names, nothing a bundler would rewrite into a
// helper. Types are fine; they are gone by then.

import type { HostMessage, PageApi, TagState, WorkerMessage, WorkerScope } from "./protocol";

/** Runs in the worker: removes the network, builds the API, runs `run`. */
export function workerMain(scope: WorkerScope, run: (api: PageApi) => unknown): void {
  // A page script reaches the plant only through this API.
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"]) {
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
    } catch {
      // Not there, or already locked: either way the script cannot use it.
    }
  }

  const post = (m: WorkerMessage) => scope.postMessage(m);
  const tags = new Map<string, TagState>();
  const watched = new Set<string>();
  const onTag = new Map<string, ((value: unknown) => void)[]>();
  const onEvent = new Map<string, ((payload: unknown) => void)[]>();
  const writes = new Map<number, (r: { status: string; reason?: string }) => void>();
  let nextId = 1;

  const watch = (path: string) => {
    if (!watched.has(path)) {
      watched.add(path);
      post({ t: "watch", paths: [path] });
    }
  };
  const text = (v: unknown) => {
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return String(v);
    }
  };
  const report = (err: unknown) => post({ t: "error", message: err instanceof Error ? err.message : text(err) });
  const safely = (fn: () => unknown) => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch(report);
    } catch (err) {
      report(err);
    }
  };

  scope.onmessage = (e: { data: HostMessage }) => {
    const m = e.data;
    switch (m.t) {
      case "ping":
        post({ t: "pong" });
        break;
      case "tags":
        for (const [path, state] of Object.entries(m.tags)) {
          tags.set(path, state);
          for (const fn of onTag.get(path) ?? []) safely(() => fn(state.value));
        }
        break;
      case "writeResult": {
        const resolve = writes.get(m.id);
        writes.delete(m.id);
        resolve?.(m.result);
        break;
      }
      case "event":
        for (const fn of onEvent.get(m.type) ?? []) safely(() => fn(m.payload));
        break;
    }
  };

  const every = (ms: number, fn: () => void) => { scope.setInterval(() => safely(fn), Math.max(10, ms)); };
  const after = (ms: number, fn: () => void) => { scope.setTimeout(() => safely(fn), ms); };
  const api: PageApi = {
    readTag(path) {
      watch(path);
      return tags.get(path)?.value ?? null;
    },
    quality(path) {
      watch(path);
      return (tags.get(path)?.quality as "Good" | "Uncertain" | "Bad" | undefined) ?? "Bad";
    },
    writeTag(path, value) {
      const id = nextId++;
      return new Promise((resolve) => {
        writes.set(id, resolve as (r: { status: string; reason?: string }) => void);
        post({ t: "write", id, path, value });
      });
    },
    log(...args) { post({ t: "log", line: args.map(text).join(" ") }); },
    emit(type, payload) { post({ t: "emit", type, payload }); },
    navigate(page) { post({ t: "navigate", page }); },
    every,
    after,
    onTagChange(path, fn) {
      watch(path);
      const fns = onTag.get(path) ?? [];
      fns.push(fn);
      onTag.set(path, fns);
    },
    on(type, fn) {
      const fns = onEvent.get(type) ?? [];
      if (fns.length === 0) post({ t: "on", type });
      fns.push(fn);
      onEvent.set(type, fns);
    },
    onTimer: every,
    afterDelay: after,
  };
  safely(() => run(api));
}
