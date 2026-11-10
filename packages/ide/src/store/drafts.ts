// Unsaved edits of the tabs that save explicitly (an alarm rule, a custom widget). A tab is unmounted when another
// is in front, so a draft kept in the tab would be lost; it is kept here instead, by key, until it is saved,
// reverted or goes stale. Not part of the project; nothing here is saved or sent to the runtime.
//
// A draft remembers what it was made from. If that has since changed (an undo, a pull from the runtime, another
// project opened), the draft is not shown any more: it would overwrite something it never saw.
import { useCallback, useRef } from "react";
import { create } from "zustand";

type Entry = { base: string; value: unknown };

interface Drafts {
  entries: Record<string, Entry>;
  put: (key: string, entry: Entry) => void;
  drop: (key: string) => void;
}

export const useDrafts = create<Drafts>((set) => ({
  entries: {},
  put: (key, entry) => set((s) => ({ entries: { ...s.entries, [key]: entry } })),
  drop: (key) => set((s) => {
    if (!(key in s.entries)) return s;
    const { [key]: _gone, ...rest } = s.entries;
    return { entries: rest };
  }),
}));

/** True when `key` has a draft that is still current for `stored`. */
export function isDirty(entries: Record<string, Entry>, key: string, stored: unknown): boolean {
  const e = entries[key];
  return !!e && e.base === JSON.stringify(stored);
}

export type DraftHandle<T> = {
  /** The draft while there is one, otherwise what is stored. */
  value: T;
  /** There is a draft that differs from what is stored. */
  dirty: boolean;
  /** Changes the draft; a function gets the latest one. A draft equal to what is stored is dropped. */
  set: (next: T | ((current: T) => T)) => void;
  /** Throws the draft away. */
  revert: () => void;
};

/** The draft of `stored` under `key`. */
export function useDraft<T>(key: string, stored: T): DraftHandle<T> {
  const base = JSON.stringify(stored);
  const entry = useDrafts((s) => s.entries[key]);
  const live = entry && entry.base === base ? (entry.value as T) : undefined;

  // The handlers are stable, so a drag that outlives a render still changes the latest draft.
  const latest = useRef({ key, stored, base });
  latest.current = { key, stored, base };

  const set = useCallback((next: T | ((current: T) => T)) => {
    const { key: k, stored: s, base: b } = latest.current;
    const e = useDrafts.getState().entries[k];
    const current = e && e.base === b ? (e.value as T) : s;
    const value = typeof next === "function" ? (next as (c: T) => T)(current) : next;
    if (JSON.stringify(value) === b) useDrafts.getState().drop(k);
    else useDrafts.getState().put(k, { base: b, value });
  }, []);
  const revert = useCallback(() => useDrafts.getState().drop(latest.current.key), []);

  return { value: live ?? stored, dirty: live !== undefined, set, revert };
}
