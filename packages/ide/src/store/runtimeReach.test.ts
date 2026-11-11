// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { reachLabel, useReach, useRuntimeReach } from "./runtimeReach";
import { tagStoreClient } from "./tagStoreClient";

const answer = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  useReach.setState({ reachable: null, streaming: false, targetFormat: null });
  vi.spyOn(tagStoreClient, "isConnected").mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reachLabel", () => {
  it.each([
    [{ reachable: null, streaming: false }, "Checking…"],
    [{ reachable: true, streaming: false }, "Runtime ready"],
    [{ reachable: true, streaming: true }, "Runtime connected"],
    [{ reachable: false, streaming: false }, "No runtime"],
    [{ reachable: false, streaming: true }, "No runtime"],
  ])("%j is %s", (state, want) => expect(reachLabel(state)).toBe(want));
});

describe("useRuntimeReach", () => {
  it.each<[string, () => Promise<Response>, boolean]>([
    ["a runtime that answers", async () => new Response("[]"), true],
    ["a runtime that wants a login", async () => new Response("{}", { status: 401 }), true],
    ["a runtime with an error", async () => new Response("{}", { status: 500 }), false],
    ["nothing at the address", async () => { throw new Error("offline"); }, false],
  ])("%s", async (_, impl, want) => {
    answer(impl);
    const h = renderHook(() => useRuntimeReach());
    expect(h.result.current.reachable).toBeNull();
    await settle();
    expect(h.result.current.reachable).toBe(want);
    h.unmount();
  });

  it("reads which project format the runtime says it reads, and forgets it when the runtime goes", async () => {
    answer(async () => new Response(JSON.stringify({ ok: true, version: "v0.8.0", schemaVersion: 5 })));
    const h = renderHook(() => useRuntimeReach());
    await settle();
    expect(h.result.current).toMatchObject({ reachable: true, targetFormat: 5 });
    answer(async () => new Response(JSON.stringify({ ok: true }))); // an older runtime does not say
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(h.result.current).toMatchObject({ reachable: true, targetFormat: null });
    answer(async () => { throw new Error("offline"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(h.result.current).toMatchObject({ reachable: false, targetFormat: null });
    h.unmount();
  });

  it("asks again every few seconds, so a runtime that starts later is found", async () => {
    answer(async () => { throw new Error("offline"); });
    const h = renderHook(() => useRuntimeReach());
    await settle();
    expect(h.result.current.reachable).toBe(false);
    answer(async () => new Response("[]"));
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(h.result.current.reachable).toBe(true);
    h.unmount();
  });

  it("follows whether live values are streaming", async () => {
    answer(async () => new Response("[]"));
    const h = renderHook(() => useRuntimeReach());
    await settle();
    expect(h.result.current.streaming).toBe(false);
    vi.mocked(tagStoreClient.isConnected).mockReturnValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(h.result.current.streaming).toBe(true);
    h.unmount();
  });

  it("asks once however many places show the answer, and stops when the last goes", async () => {
    answer(async () => new Response("[]"));
    const a = renderHook(() => useRuntimeReach());
    const b = renderHook(() => useRuntimeReach());
    await settle();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    a.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);

    b.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});
