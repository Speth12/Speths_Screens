// Named deploy targets — persisted to localStorage.
// A target is a name + base URL for a runtime instance.
// "local" is always present and cannot be deleted.

export type Target = {
  id: string;
  name: string;
  url: string; // "" = local Vite proxy, "http://host:port" = remote
};

const LOCAL: Target = { id: "local", name: "Local (dev)", url: "" };
const LS_KEY = "xhmi-targets-v1";
const LS_ACTIVE = "xhmi-active-target-v1";

function loadTargets(): Target[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [LOCAL];
    const parsed = JSON.parse(raw) as Target[];
    // Ensure local is always first and present.
    const withoutLocal = parsed.filter((t) => t.id !== "local");
    return [LOCAL, ...withoutLocal];
  } catch {
    return [LOCAL];
  }
}

function saveTargets(targets: Target[]) {
  const withoutLocal = targets.filter((t) => t.id !== "local");
  localStorage.setItem(LS_KEY, JSON.stringify(withoutLocal));
}

// In-memory state (module-level, triggers re-render via subscribeTargets).
let _targets: Target[] = loadTargets();
let _activeId: string = localStorage.getItem(LS_ACTIVE) ?? "local";
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

export function getActiveTarget(): Target {
  return _targets.find((t) => t.id === _activeId) ?? LOCAL;
}

export function setActiveTarget(id: string) {
  _activeId = id;
  localStorage.setItem(LS_ACTIVE, id);
  notify();
}

export function addTarget(name: string, url: string): Target {
  const id = `t-${Math.random().toString(36).slice(2, 8)}`;
  const t: Target = { id, name, url: url.replace(/\/$/, "") };
  _targets = [..._targets, t];
  saveTargets(_targets);
  notify();
  return t;
}

export function updateTarget(id: string, patch: Partial<Pick<Target, "name" | "url">>) {
  _targets = _targets.map((t) =>
    t.id === id && t.id !== "local" ? { ...t, ...patch, url: (patch.url ?? t.url).replace(/\/$/, "") } : t,
  );
  saveTargets(_targets);
  notify();
}

export function removeTarget(id: string) {
  if (id === "local") return;
  _targets = _targets.filter((t) => t.id !== id);
  if (_activeId === id) {
    _activeId = "local";
    localStorage.setItem(LS_ACTIVE, "local");
  }
  saveTargets(_targets);
  notify();
}
