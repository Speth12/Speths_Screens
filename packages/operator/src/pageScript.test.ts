import { afterEach, expect, it, vi } from "vitest";
import { operatorPageHost } from "./pageScript";

afterEach(() => vi.unstubAllGlobals());

it("page script writes go through writeTag and answer with its result", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push(`${url} ${String(init.body)}`);
    return new Response(JSON.stringify({ ok: false, status: "failed", reason: "above the maximum 100" }), { status: 400 });
  });
  const host = operatorPageHost(() => {}, () => {});
  expect(await host.write("plc:SP", 500)).toEqual({ status: "failed", reason: "above the maximum 100" });
  expect(calls[0]).toContain('"value":500');
});

it("emit reaches the page's on listeners until they stop", () => {
  const host = operatorPageHost(() => {}, () => {});
  const got: unknown[] = [];
  const stop = host.on("batch", (p) => got.push(p));
  host.emit("batch", 1);
  host.emit("other", 2);
  stop();
  host.emit("batch", 3);
  expect(got).toEqual([1]);
});
