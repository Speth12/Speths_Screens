/**
 * runtimeAuth: login tokens, keyed by the address base they are for ("" is the program that served this page).
 * Module-level so Header, LeftPanel, and any other panel can share tokens.
 *
 * A request through the relay can need two logins: this program's own (Authorization, which the relay never
 * passes on) and the target's (X-Target-Authorization, which the relay hands to the target as Authorization).
 */

import { apiBase, isRelayBase } from "./runtimeTarget";

/** The header the relay turns into the target's Authorization. */
export const TARGET_AUTH_HEADER = "X-Target-Authorization";
/** A response that came from the target, not from the program that served this page, carries this header. */
export const RELAYED_HEADER = "X-Speths-Relayed";

const _tokens = new Map<string, string>();

/** Get the stored JWT for a given base (empty string = the program that served this page). */
export function getToken(baseUrl: string): string {
  return _tokens.get(baseUrl) ?? "";
}

/** Store a JWT for a given base. */
export function setToken(baseUrl: string, token: string): void {
  _tokens.set(baseUrl, token);
}

/** Clear the JWT for a given base (on 401 / logout). */
export function clearToken(baseUrl: string): void {
  _tokens.delete(baseUrl);
}

/** The login headers for a request to a base; empty when no token is needed or known. */
export function authHeader(baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isRelayBase(baseUrl)) {
    const own = getToken("");
    if (own) headers.Authorization = `Bearer ${own}`;
    const target = getToken(baseUrl);
    if (target) headers[TARGET_AUTH_HEADER] = `Bearer ${target}`;
    return headers;
  }
  const t = getToken(baseUrl);
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

/** Which base a 401 asks a login for: the target's, or (a relayed request refused before it left) this program's. */
export function loginBaseFor(baseUrl: string, response: Response): string {
  return isRelayBase(baseUrl) && !response.headers.get(RELAYED_HEADER) ? "" : baseUrl;
}

/** fetch an API path (e.g. "/api/v1/alarms") on the active runtime, with its stored token. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(authHeader(apiBase))) headers.set(k, v);
  return fetch(apiBase + path, { ...init, headers });
}
