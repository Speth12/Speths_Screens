/**
 * runtimeTarget — the URL base for the active runtime.
 *
 * ""                      = local dev  (Vite proxy → :3001, relative URLs)
 * "http://10.0.0.210:8080" = remote PLC (direct cross-origin fetch + WS)
 *
 * Initialized from localStorage so the IDE starts pointed at the last target
 * without waiting for the Header component to mount.
 */

const LOCAL_SENTINEL = "/api/v1";

function computeBase(): string {
  try {
    const stored = localStorage.getItem("deployTarget") ?? "";
    return !stored || stored === LOCAL_SENTINEL ? "" : stored.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export let apiBase = computeBase();

export function setApiBase(base: string): void {
  apiBase = base;
}

/** Build the WebSocket URL for the current target. */
export function wsUrl(): string {
  if (apiBase) {
    return apiBase.replace(/^http/, "ws") + "/ws/tags";
  }
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/tags";
}

/** WebSocket URL for the runtime event bus (navigate, alarms, etc). */
export function wsEventsUrl(): string {
  if (apiBase) {
    return apiBase.replace(/^http/, "ws") + "/ws/events";
  }
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/events";
}
