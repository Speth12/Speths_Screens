import { useSyncExternalStore } from "react";
import { eventBus } from "./eventBus";

export type AuditEntry = {
  id: string;
  ts: number;
  type: string;
  summary: string;
  payload: unknown;
};

const MAX_ENTRIES = 500;
let _entries: AuditEntry[] = [];
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function push(type: string, summary: string, payload: unknown) {
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    type,
    summary,
    payload,
  };
  _entries = [entry, ..._entries].slice(0, MAX_ENTRIES);
  notify();
}

function summarize(type: string, payload: unknown): string {
  const p = payload as Record<string, unknown> | undefined;
  switch (type) {
    case "alarm:triggered":
      return `Alarm "${p?.name}" triggered (${p?.severity})`;
    case "alarm:cleared":
      return `Alarm "${p?.name}" cleared`;
    case "recipe:applied":
      return `Recipe "${p?.name}" applied — ${p?.writes} write(s)`;
    case "page:changed":
      return `Page changed: ${p?.fromName ?? "?"} → ${p?.toName ?? "?"}`;
    case "tag:written":
      return `Tag written: ${p?.binding} = ${JSON.stringify(p?.value)}`;
    case "script:error":
      return `Script error on "${p?.page}": ${p?.error}`;
    default:
      return type + (payload !== undefined ? `: ${JSON.stringify(payload).slice(0, 80)}` : "");
  }
}

export function subscribeAudit(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getAudit(): AuditEntry[] {
  return _entries;
}

export function clearAudit(): void {
  _entries = [];
  notify();
}

export function useAuditTrail(): AuditEntry[] {
  return useSyncExternalStore(subscribeAudit, getAudit);
}

export function bootAuditTrail(): void {
  const TRACKED = [
    "alarm:triggered", "alarm:cleared", "recipe:applied",
    "page:changed", "tag:written", "script:error",
  ];
  for (const t of TRACKED) {
    eventBus.on(t, (payload) => push(t, summarize(t, payload), payload));
  }
  eventBus.on("*", (raw) => {
    const { type, payload } = raw as { type: string; payload: unknown };
    if (!TRACKED.includes(type)) {
      push(type, summarize(type, payload), payload);
    }
  });
}
