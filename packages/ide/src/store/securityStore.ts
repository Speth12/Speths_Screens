import { useSyncExternalStore } from "react";

export type UserRole = "admin" | "operator" | "viewer";
export type ProjectUser = { id: string; name: string; pin: string; role: UserRole };

export type SessionState = { role: UserRole; userName: string };

const SESSION_KEY = "xhmi-session";

function loadSession(): SessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch { /* ignore */ }
  return { role: "admin", userName: "admin" };
}

let _session: SessionState = loadSession();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function persist(s: SessionState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function getSession(): SessionState {
  return _session;
}

export function login(user: ProjectUser): void {
  _session = { role: user.role, userName: user.name };
  persist(_session);
  notify();
}

export function logout(): void {
  _session = { role: "viewer", userName: "" };
  persist(_session);
  notify();
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (fn) => { _listeners.add(fn); return () => _listeners.delete(fn); },
    getSession,
  );
}

export function canWrite(session: SessionState): boolean {
  return session.role === "admin" || session.role === "operator";
}

export function canEdit(session: SessionState): boolean {
  return session.role === "admin";
}
