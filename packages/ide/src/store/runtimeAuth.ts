/**
 * runtimeAuth — stores JWT tokens keyed by runtime URL.
 * Module-level so Header, LeftPanel, and any other panel can share tokens.
 */

import { apiBase } from "./runtimeTarget";

const _tokens = new Map<string, string>();

/** Get the stored JWT for a given base URL (empty string = local). */
export function getToken(baseUrl: string): string {
  return _tokens.get(baseUrl) ?? "";
}

/** Store a JWT for a given base URL. */
export function setToken(baseUrl: string, token: string): void {
  _tokens.set(baseUrl, token);
}

/** Clear the JWT for a given base URL (on 401 / logout). */
export function clearToken(baseUrl: string): void {
  _tokens.delete(baseUrl);
}

/** Build an Authorization header value, or empty string if no token. */
export function authHeader(baseUrl: string): Record<string, string> {
  const t = getToken(baseUrl);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** fetch an API path (e.g. "/api/v1/alarms") on the active runtime, with its stored token. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = authHeader(apiBase);
  if (auth.Authorization) headers.set("Authorization", auth.Authorization);
  return fetch(apiBase + path, { ...init, headers });
}
