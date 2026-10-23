// In-memory tag store for virtual datasources.
// Paths are "dsId:tagPath". Any datasource with type "virtual" is registered
// here; scripts and dynamics read/write through the normal tag APIs.

import { type TagState } from "./tagStoreClient";

type Listener = (s: TagState) => void;

class VirtualTagStore {
  private values   = new Map<string, TagState>();
  private listeners = new Map<string, Set<Listener>>();
  private prefixes  = new Set<string>(); // "dsId:" for every virtual ds

  registerDatasource(id: string)   { this.prefixes.add(id + ":"); }
  unregisterDatasource(id: string) { this.prefixes.delete(id + ":"); }

  isVirtual(path: string): boolean {
    for (const p of this.prefixes) if (path.startsWith(p)) return true;
    return false;
  }

  get(path: string): TagState | undefined { return this.values.get(path); }

  set(path: string, value: unknown): void {
    const state: TagState = { value, quality: "Good", ts: Date.now() * 1e6 };
    this.values.set(path, state);
    this.listeners.get(path)?.forEach((fn) => fn(state));
  }

  subscribe(path: string, fn: Listener): () => void {
    let set = this.listeners.get(path);
    if (!set) { set = new Set(); this.listeners.set(path, set); }
    set.add(fn);
    const cached = this.values.get(path);
    if (cached) fn(cached);
    return () => {
      const s = this.listeners.get(path);
      if (s) { s.delete(fn); if (s.size === 0) this.listeners.delete(path); }
    };
  }
}

export const virtualTagStore = new VirtualTagStore();
