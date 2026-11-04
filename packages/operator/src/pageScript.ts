// Page scripts on the operator screen (Phase 4): the open page's script
// runs in a Web Worker through @speths-screens/script-api, with the same
// names as in the IDE preview. Writes go through writeTag, so they are
// queued, audited and answered like a widget's. The worker ends when the
// page changes or closes.
import { useEffect } from "react";
import { startPageScript } from "@speths-screens/script-api";
import type { PageHost } from "@speths-screens/script-api";
import { tagStoreClient } from "./store/tagStoreClient";
import { writeTag } from "./writeTag";

/** The page's own event bus: emit and on between page scripts. */
const listeners = new Map<string, Set<(payload: unknown) => void>>();

/** What an operator page script gets; `navigate` takes a page name or id. */
export function operatorPageHost(navigate: (page: string) => void, error: (message: string) => void): PageHost {
  return {
    get: (path) => tagStoreClient.get(path),
    watch: (paths, fn) => {
      const unsubs = paths.map((p) => tagStoreClient.subscribe(p, (s) => fn(p, s)));
      return () => unsubs.forEach((u) => u());
    },
    write: async (path, value) => {
      const r = await writeTag(path, value);
      return { status: r.status, reason: r.reason };
    },
    navigate,
    log: (line) => console.log("[Script]", line),
    emit: (type, payload) => listeners.get(type)?.forEach((fn) => fn(payload)),
    on: (type, fn) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
      return () => set.delete(fn);
    },
    error,
  };
}

/** Runs the open page's script while the page is open. */
export function usePageScript(pageId: string | undefined, script: string | undefined, navigate: (page: string) => void): void {
  useEffect(() => {
    if (!script?.trim()) return;
    return startPageScript(script, operatorPageHost(navigate, (m) => console.error("[Script]", m)));
  }, [pageId, script, navigate]);
}
