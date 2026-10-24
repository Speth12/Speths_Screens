import { afterEach, describe, expect, it, vi } from "vitest";
import { onWriteResult, setWriteToken, writeTag } from "./writeTag";

type Call = { url: string; body: Record<string, unknown>; auth?: string };

// mockFetch answers each request with the given reply after delayMs and
// records what was sent.
function mockFetch(reply: (n: number) => { status: number; body?: unknown }, delayMs = 0) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const n = calls.length;
    const headers = init.headers as Record<string, string>;
    calls.push({ url, body: JSON.parse(String(init.body)), auth: headers.Authorization });
    await new Promise((r) => setTimeout(r, delayMs));
    const { status, body } = reply(n);
    return new Response(body === undefined ? "not json" : JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setWriteToken(null);
});

describe("writeTag", () => {
  it.each([
    ["confirmed", 200, { ok: true, status: "confirmed" }, "confirmed", undefined],
    ["not confirmed", 409, { ok: false, status: "not_confirmed", reason: "the device holds 75" }, "not_confirmed", "the device holds 75"],
    ["failed with reason", 400, { ok: false, status: "failed", reason: "above the maximum 100" }, "failed", "above the maximum 100"],
    ["older runtime: ok only", 200, { ok: true }, "confirmed", undefined],
    ["older runtime: error only", 500, { error: "boom" }, "failed", "boom"],
    ["no JSON body", 502, undefined, "failed", "HTTP 502"],
  ])("%s", async (_name, status, body, wantStatus, wantReason) => {
    mockFetch(() => ({ status, body }));
    const r = await writeTag("plc:SP", 1);
    expect(r.status).toBe(wantStatus);
    expect(r.reason).toBe(wantReason);
  });

  it("sends datasource, path, value and widget id", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { status: "confirmed" } }));
    await writeTag("plc:Arp.Plc.Eclr/SP", 42, "w1");
    expect(calls[0]!.url).toBe("/api/v1/tag/Arp.Plc.Eclr%2FSP");
    expect(calls[0]!.body).toEqual({ datasource: "plc", value: 42, widgetId: "w1" });
    expect(calls[0]!.auth).toBeUndefined();
  });

  it("sends the login token when one is set", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { status: "confirmed" } }));
    setWriteToken("tok");
    await writeTag("plc:SP", 1);
    expect(calls[0]!.auth).toBe("Bearer tok");
  });

  it("reports an unreachable runtime without throwing", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const r = await writeTag("plc:SP", 1);
    expect(r).toMatchObject({ status: "failed", reason: "the runtime is not reachable" });
  });

  it("refuses a binding without a datasource", async () => {
    const r = await writeTag("SP", 1);
    expect(r.status).toBe("failed");
  });

  it("sends writes to one tag in order: a release never overtakes its press", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { status: "confirmed" } }), 20);
    const press = writeTag("plc:BTN", 1);
    const release = writeTag("plc:BTN", 0);
    await new Promise((r) => setTimeout(r, 5)); // both queued; the press is in flight
    expect(calls.length).toBe(1); // the release waits for the press
    await press;
    await release;
    expect(calls.map((c) => c.body.value)).toEqual([1, 0]);
  });

  it("does not hold up writes to other tags", async () => {
    const calls = mockFetch(() => ({ status: 200, body: { status: "confirmed" } }), 20);
    const a = writeTag("plc:A", 1);
    const b = writeTag("plc:B", 2);
    await new Promise((r) => setTimeout(r, 5)); // well before either answers
    expect(calls.length).toBe(2);
    await Promise.all([a, b]);
  });

  it("tells listeners about every result", async () => {
    mockFetch(() => ({ status: 409, body: { status: "not_confirmed", reason: "held" } }));
    const seen: string[] = [];
    const off = onWriteResult((r) => seen.push(`${r.binding}=${String(r.value)}:${r.status}`));
    await writeTag("plc:SP", 76);
    off();
    await writeTag("plc:SP", 77);
    expect(seen).toEqual(["plc:SP=76:not_confirmed"]);
  });
});
