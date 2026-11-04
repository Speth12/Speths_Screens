import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// MOCK the WebSocket-backed client to keep the hook test pure.
vi.mock("../store/tagStoreClient", () => {
  type TagState = { value: unknown; quality: string; ts: number };
  const cache = new Map<string, TagState>();
  const listeners = new Map<string, Set<(s: TagState) => void>>();
  return {
    tagStoreClient: {
      get: (p: string) => cache.get(p),
      subscribe: (p: string, fn: (s: TagState) => void) => {
        let set = listeners.get(p);
        if (!set) { set = new Set(); listeners.set(p, set); }
        set.add(fn);
        const c = cache.get(p);
        if (c) fn(c);
        return () => set!.delete(fn);
      },
      // test helper: push a value
      __push: (p: string, s: TagState) => {
        cache.set(p, s);
        listeners.get(p)?.forEach((fn) => fn(s));
      },
      __reset: () => { cache.clear(); listeners.clear(); },
    },
  };
});

import { useTag } from "./useTag";
import { tagStoreClient } from "../store/tagStoreClient";

const tsc = tagStoreClient as unknown as {
  __push: (p: string, s: { value: unknown; quality: string; ts: number }) => void;
  __reset: () => void;
};

describe("useTag", () => {
  beforeEach(() => tsc.__reset());

  it("returns cached value immediately", () => {
    tsc.__push("x", { value: 42, quality: "Good", ts: 1 });
    const { result } = renderHook(() => useTag("x"));
    expect(result.current.value).toBe(42);
    expect(result.current.quality).toBe("Good");
  });

  it("updates when a new value arrives", () => {
    const { result } = renderHook(() => useTag("y"));
    expect(result.current.value).toBe(null);

    act(() => tsc.__push("y", { value: 7, quality: "Good", ts: 1 }));
    expect(result.current.value).toBe(7);

    act(() => tsc.__push("y", { value: 8, quality: "Good", ts: 2 }));
    expect(result.current.value).toBe(8);
  });

  it("returns empty state when path is undefined", () => {
    const { result } = renderHook(() => useTag(undefined));
    expect(result.current.value).toBe(null);
    expect(result.current.quality).toBe("Unknown");
  });
});

describe("changing the path", () => {
  beforeEach(() => tsc.__reset());

  it.each([
    ["to a tag with no value yet shows Unknown, not the old value", undefined, null, "Unknown"],
    ["to a tag with a value shows that value", { value: 7, quality: "Good", ts: 2 }, 7, "Good"],
  ])("%s", (_, next, value, quality) => {
    act(() => tsc.__push("plc:A", { value: 75, quality: "Good", ts: 1 }));
    if (next) act(() => tsc.__push("plc:B", next));
    const { result, rerender } = renderHook(({ p }) => useTag(p), { initialProps: { p: "plc:A" } });
    expect(result.current.value).toBe(75);
    rerender({ p: "plc:B" });
    expect(result.current).toMatchObject({ value, quality });
  });

  it("useTags drops the old paths' values", async () => {
    const { useTags } = await import("./useTags");
    act(() => tsc.__push("plc:A", { value: 75, quality: "Good", ts: 1 }));
    const { result, rerender } = renderHook(({ ps }) => useTags(ps), { initialProps: { ps: ["plc:A"] } });
    expect(result.current["plc:A"]!.value).toBe(75);
    rerender({ ps: ["plc:B"] });
    expect(result.current).toEqual({ "plc:B": { value: null, quality: "Unknown", ts: 0 } });
  });
});
