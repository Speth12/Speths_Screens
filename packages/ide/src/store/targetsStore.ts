// Deploy targets: the runtimes the IDE can deploy to and pull from.
//
// "local" is the program that served this page (the runtime on this PC, or the dev server's runtime); it is always
// there and cannot be removed. The others are saved by that program (GET/POST/PUT/DELETE /api/v1/targets), which
// also passes the IDE's requests on to them, so the browser never talks to another runtime itself.
//
// Targets used to be kept in the browser (localStorage); the first load hands those to the program once.

import { readStored } from "./storage";
import { authHeader } from "./runtimeAuth";
import { ACTIVE_TARGET_KEY, relayBase } from "./runtimeTarget";

export type Target = {
  id: string;
  name: string;
  /** The runtime's own address, for showing; "" for the program that served this page. */
  url: string;
};

const LOCAL: Target = { id: "local", name: import.meta.env.DEV ? "Local (dev)" : "This PC", url: "" };
const LEGACY_KEY = "speths-screens-targets-v1";

/** The base the IDE's requests to a target use: "" for local, the relay for any other. */
export const baseOf = (t: Target): string => (t.id === "local" ? "" : relayBase(t.id));

// In-memory state (module-level, triggers re-render via subscribeTargets).
let _targets: Target[] = [LOCAL];
let _activeId: string = readStored(ACTIVE_TARGET_KEY) ?? "local";
let _loaded = false;
/** Why other targets cannot be used, when they cannot ("" when they can, or it is not known yet). */
let _unavailable = "";
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function subscribeTargets(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getTargets(): Target[] {
  return _targets;
}

/** The active target. Until the list has loaded, a saved choice is kept under its id so requests already go there. */
let _pending: Target | null = null;
export function getActiveTarget(): Target {
  const found = _targets.find((t) => t.id === _activeId);
  if (found) return found;
  if (_loaded || _activeId === "local") return LOCAL;
  if (_pending?.id !== _activeId) _pending = { id: _activeId, name: "…", url: "" };
  return _pending;
}

export function getTargetsUnavailable(): string {
  return _unavailable;
}

export function setActiveTarget(id: string) {
  _activeId = id;
  try { localStorage.setItem(ACTIVE_TARGET_KEY, id); } catch { /* not kept; still active for this visit */ }
  notify();
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`/api/v1/targets${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...authHeader("") },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function failure(r: Response): Promise<Error> {
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  return new Error(data.error ?? `HTTP ${r.status}`);
}

/** Targets kept in the browser by earlier versions are handed to the program once, and the active one follows. */
async function adoptLegacy(list: Target[]): Promise<Target[]> {
  let legacy: Target[] = [];
  try { legacy = (JSON.parse(readStored(LEGACY_KEY) ?? "[]") as Target[]).filter((t) => t && t.id !== "local" && t.url); } catch { /* nothing to adopt */ }
  if (legacy.length === 0) return list;
  const out = [...list];
  let all = true;
  for (const old of legacy) {
    let now = out.find((t) => t.url === old.url.replace(/\/$/, ""));
    if (!now) {
      const r = await call("POST", "", { name: old.name, url: old.url });
      if (r.ok) { now = (await r.json()) as Target; out.push(now); } else all = false;
    }
    if (now && _activeId === old.id) setActiveTarget(now.id);
  }
  if (all) { try { localStorage.removeItem(LEGACY_KEY); } catch { /* tried again next time */ } }
  return out;
}

// Loads and changes run one after the other, so a load that started first cannot overwrite a change that
// finished before it.
let _queue: Promise<unknown> = Promise.resolve();
function inOrder<T>(work: () => Promise<T>): Promise<T> {
  const next = _queue.then(work, work);
  _queue = next.catch(() => undefined);
  return next;
}

/** Reads the saved targets from the program that served this page. Safe to call again (after a login, say). */
export function loadTargets(): Promise<void> {
  return inOrder(load);
}

async function load(): Promise<void> {
  try {
    const r = await call("GET", "");
    if (r.ok) {
      _targets = [LOCAL, ...(await adoptLegacy((await r.json()) as Target[]))];
      _unavailable = "";
    } else {
      _targets = [LOCAL];
      _unavailable = r.status === 404 ? "The runtime that serves this editor cannot pass requests on to other runtimes (it is older, or was started without the IDE)."
        : r.status === 401 ? "Log in to this runtime first (deploy to it once), then other targets can be used."
          : (await failure(r)).message;
    }
  } catch {
    _targets = [LOCAL];
    _unavailable = "The program that serves this editor is not answering.";
  }
  _loaded = true;
  if (!_targets.some((t) => t.id === _activeId)) setActiveTarget("local");
  else notify();
}

export function addTarget(name: string, url: string): Promise<Target> {
  return inOrder(() => add(name, url));
}

async function add(name: string, url: string): Promise<Target> {
  const r = await call("POST", "", { name, url });
  if (!r.ok) throw await failure(r);
  const t = (await r.json()) as Target;
  _targets = [..._targets, t];
  notify();
  return t;
}

export function updateTarget(id: string, patch: Pick<Target, "name" | "url">): Promise<void> {
  return inOrder(() => update(id, patch));
}

async function update(id: string, patch: Pick<Target, "name" | "url">): Promise<void> {
  if (id === "local") return;
  const r = await call("PUT", `/${encodeURIComponent(id)}`, patch);
  if (!r.ok) throw await failure(r);
  const t = (await r.json()) as Target;
  _targets = _targets.map((x) => (x.id === id ? t : x));
  notify();
}

export function removeTarget(id: string): Promise<void> {
  return inOrder(() => remove(id));
}

async function remove(id: string): Promise<void> {
  if (id === "local") return;
  const r = await call("DELETE", `/${encodeURIComponent(id)}`);
  if (!r.ok && r.status !== 404) throw await failure(r);
  _targets = _targets.filter((t) => t.id !== id);
  if (_activeId === id) setActiveTarget("local");
  else notify();
}

/** For tests: back to a fresh page. */
export function resetTargetsForTest(): void {
  _targets = [LOCAL];
  _activeId = "local";
  _loaded = false;
  _unavailable = "";
  _pending = null;
  _queue = Promise.resolve();
}
