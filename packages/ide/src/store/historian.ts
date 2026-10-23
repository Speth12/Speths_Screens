import { useSyncExternalStore } from "react";
import { tagStoreClient } from "./tagStoreClient";
import { useProject } from "./projectStore";

export type HistorianSample = { ts: number; value: number };

const MAX_SAMPLES = 1000;
const _buffers = new Map<string, HistorianSample[]>();
const _unsubs = new Map<string, () => void>();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function append(binding: string, value: number) {
  let buf = _buffers.get(binding);
  if (!buf) { buf = []; _buffers.set(binding, buf); }
  buf.push({ ts: Date.now(), value });
  if (buf.length > MAX_SAMPLES) buf.splice(0, buf.length - MAX_SAMPLES);
  notify();
}

export function getHistory(binding: string, fromTs?: number, toTs?: number): HistorianSample[] {
  const buf = _buffers.get(binding) ?? [];
  return buf.filter((s) => {
    if (fromTs !== undefined && s.ts < fromTs) return false;
    if (toTs !== undefined && s.ts > toTs) return false;
    return true;
  });
}

export function subscribeHistory(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function startHistorian(bindings: string[]): () => void {
  const added: string[] = [];
  for (const b of bindings) {
    if (_unsubs.has(b)) continue;
    added.push(b);
    const u = tagStoreClient.subscribe(b, (s) => {
      const n = typeof s.value === "number" ? s.value : parseFloat(String(s.value));
      if (!isNaN(n)) append(b, n);
    });
    _unsubs.set(b, u);
  }
  return () => {
    for (const b of added) {
      _unsubs.get(b)?.();
      _unsubs.delete(b);
    }
  };
}

export function useHistorianBinding(binding: string | undefined, limit = 200): HistorianSample[] {
  return useSyncExternalStore(
    subscribeHistory,
    () => binding ? getHistory(binding).slice(-limit) : [],
  );
}

let _watchedBindings: string[] = [];

export function bootHistorian(): void {
  useProject.subscribe((state) => {
    const bindings = new Set<string>();
    for (const page of state.project.pages) {
      for (const w of page.widgets) {
        if (w.binding) bindings.add(w.binding);
        if (w.config?.tags && Array.isArray(w.config.tags)) {
          for (const t of w.config.tags as Array<{ binding?: string }>) {
            if (t.binding) bindings.add(t.binding);
          }
        }
      }
    }
    const next = Array.from(bindings);
    const added = next.filter((b) => !_watchedBindings.includes(b));
    if (added.length > 0) startHistorian(added);
    _watchedBindings = next;
  });
}
