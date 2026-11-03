// Login for the operator app. With security.mode "login" the runtime
// answers API calls without a token with 401 and refuses WebSockets; the
// app then shows the login screen. The token is kept for the browser
// session (sessionStorage) and sent with every API call, write and
// WebSocket. With security.mode "none" no token is needed.
import { setWriteToken } from "./writeTag";

const KEY = "speths-screens.token";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let token: string | null = read();
setWriteToken(token);
const listeners = new Set<() => void>();

export function getToken(): string | null {
  return token;
}

/** Stores the token (null logs out) and tells everyone who reconnects with it. */
export function setToken(t: string | null): void {
  if (t === token) return;
  token = t;
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: keep it in memory only */
  }
  setWriteToken(t);
  listeners.forEach((fn) => fn());
}

/** Calls fn whenever the token changes; returns an unsubscribe function. */
export function onTokenChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** fetch with the token. A 401 means the token is gone or expired: log out. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401 && token) setToken(null);
  return resp;
}

/** WebSocket URL on this runtime, with the token (browsers cannot set headers). */
export function wsURL(path: string): string {
  const base = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + path;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export type LoginResult =
  | { ok: true; token: string; mustChangePassword: boolean }
  | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const resp = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = (await resp.json().catch(() => ({}))) as {
      token?: string;
      mustChangePassword?: boolean;
      error?: string;
    };
    if (!resp.ok || !body.token) return { ok: false, error: body.error ?? "Wrong username or password" };
    return { ok: true, token: body.token, mustChangePassword: !!body.mustChangePassword };
  } catch {
    return { ok: false, error: "The runtime is not reachable" };
  }
}

/**
 * Changes the password with a token from login (which may only allow this).
 * Returns an error message, or null when it worked.
 */
export async function changePassword(withToken: string, current: string, next: string): Promise<string | null> {
  try {
    const resp = await fetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${withToken}` },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    if (resp.ok) return null;
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `HTTP ${resp.status}`;
  } catch {
    return "The runtime is not reachable";
  }
}
