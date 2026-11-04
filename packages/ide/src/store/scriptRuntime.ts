// Page scripts in the IDE preview (Phase 4): each runs in a Web Worker
// through @speths-screens/script-api, with the same names as on the
// operator screen. The worker ends when the page is left.
import { sessionName, startPageScript } from "@speths-screens/script-api";
import { sessionStore } from "./session";
import type { WriteResult } from "@speths-screens/script-api";
import { useProject } from "./projectStore";
import { tagStoreClient } from "./tagStoreClient";
import { virtualTagStore } from "./virtualTagStore";
import { eventBus } from "./eventBus";
import { apiFetch } from "./runtimeAuth";

export type ScriptCleanup = () => void;

/** Writes through the runtime's write pipeline and returns its answer;
 *  calculated tags simulated in the IDE and session variables are set here. */
export async function previewWrite(binding: string, value: unknown): Promise<WriteResult> {
  if (useProject.getState().project.viewOnly) return { status: "failed", reason: "the project is view-only" };
  const session = sessionName(binding);
  if (session !== undefined) return sessionStore.set(session, value);
  if (virtualTagStore.isVirtual(binding)) {
    virtualTagStore.set(binding, value);
    return { status: "confirmed" };
  }
  const sep = binding.indexOf(":");
  if (sep < 0) return { status: "failed", reason: `${binding} does not name a tag` };
  try {
    const res = await apiFetch(`/api/v1/tag/${encodeURIComponent(binding.slice(sep + 1))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasource: binding.slice(0, sep), value }),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: WriteResult["status"]; reason?: string; error?: string };
    return { status: body.status ?? (res.ok ? "confirmed" : "failed"), reason: body.reason ?? body.error };
  } catch (err) {
    return { status: "failed", reason: `no answer from the runtime (${String(err)})` };
  }
}

export function runPageScript(script: string): ScriptCleanup {
  return startPageScript(script, {
    get: (path) => tagStoreClient.get(path),
    watch: (paths, fn) => {
      const unsubs = paths.map((p) => tagStoreClient.subscribe(p, (s) => fn(p, s)));
      return () => unsubs.forEach((u) => u());
    },
    write: previewWrite,
    navigate(nameOrId) {
      const { project, setActivePage } = useProject.getState();
      const page = project.pages.find((p) => p.id === nameOrId || p.name === nameOrId);
      if (page) setActivePage(page.id);
      else console.warn(`[Script] navigate: page not found: "${nameOrId}"`);
    },
    log: (line) => console.log("[Script]", line),
    emit: (type, payload) => eventBus.emit(type, payload),
    on: (type, fn) => eventBus.on(type, fn),
    error: (message) => console.error("[Script]", message),
  });
}
