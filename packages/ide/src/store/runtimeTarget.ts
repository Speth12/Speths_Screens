/**
 * runtimeTarget: the address base the IDE's requests go to.
 *
 * ""                              = the program that served this page (the runtime on this PC, or the dev server)
 * "/api/v1/targets/<id>/relay"    = another runtime, reached through that program: the browser only ever talks to
 *                                   the program that served it, which passes the request on (no browser origin
 *                                   rules, so the other runtime needs no setting for the IDE)
 *
 * Every request is `apiBase + "/api/v1/..."` and every WebSocket `wsOrigin() + "/ws/..."`, so the two cases
 * need no other difference. Initialized from localStorage so the IDE starts pointed at the last target.
 */

/** Where the id of the active target is kept. */
export const ACTIVE_TARGET_KEY = "speths-screens-active-target-v1";

/** The base for requests to a saved target, by its id. */
export const relayBase = (id: string): string => `/api/v1/targets/${encodeURIComponent(id)}/relay`;

/** Whether a base goes through the relay (as opposed to the program that served the page). */
export const isRelayBase = (base: string): boolean => base.startsWith("/api/v1/targets/");

function computeBase(): string {
  try {
    const id = localStorage.getItem(ACTIVE_TARGET_KEY) ?? "";
    return !id || id === "local" ? "" : relayBase(id);
  } catch {
    return "";
  }
}

export let apiBase = computeBase();

export function setApiBase(base: string): void {
  apiBase = base;
}

/** The WebSocket form of a base: ws(s)://host[/api/v1/targets/<id>/relay]. */
export function wsOrigin(base: string = apiBase): string {
  if (/^https?:/.test(base)) return base.replace(/^http/, "ws");
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + base;
}

/** Build the WebSocket URL for the current target. */
export function wsUrl(): string {
  return wsOrigin() + "/ws/tags";
}

/** WebSocket URL for the runtime event bus (navigate, alarms, etc). */
export function wsEventsUrl(): string {
  return wsOrigin() + "/ws/events";
}
