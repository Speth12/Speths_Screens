import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOnRuntime, entryValueText, parseEntryValue } from "./recipeApply";
import { clearToken, setToken } from "./runtimeAuth";

afterEach(() => {
  vi.unstubAllGlobals();
  clearToken("");
});

describe("applyOnRuntime", () => {
  const cases = [
    { name: "all applied", status: 200, body: { ok: true, applied: 3 }, want: { errors: [], applied: 3 } },
    { name: "some failed", status: 207, body: { ok: false, applied: 1, errors: ["x: not_confirmed"] }, want: { errors: ["x: not_confirmed"], applied: 1 } },
    { name: "not deployed", status: 404, body: { error: "recipe not found" }, want: { errors: ["the runtime doesn't have this recipe; deploy the project first"], applied: 0 } },
    { name: "no login", status: 401, body: {}, want: { errors: ["not allowed: log in as a user who can apply recipes"], applied: 0 } },
    { name: "no permission", status: 403, body: {}, want: { errors: ["not allowed: log in as a user who can apply recipes"], applied: 0 } },
    { name: "server error", status: 500, body: {}, want: { errors: ["HTTP 500"], applied: 0 } },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(c.body), { status: c.status })));
      expect(await applyOnRuntime("rec-1")).toEqual(c.want);
    });
  }

  it("posts to the runtime's recipe route with the token", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, applied: 0 })));
    vi.stubGlobal("fetch", f);
    setToken("", "tok");
    await applyOnRuntime("rec 1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/recipes/rec%201/apply");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    expect(await applyOnRuntime("rec-1")).toEqual({ errors: ["Failed to fetch"], applied: 0 });
  });
});

describe("parseEntryValue", () => {
  it.each<[string, number | string]>([
    ["12", 12],
    ["-3.5", -3.5],
    ["0", 0],
    ["1e3", 1000],
    [" 7 ", 7],
    ["12abc", "12abc"],
    ["", ""],
    [" ", " "],
    ["on", "on"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
  ])("%j is %j", (raw, want) => expect(parseEntryValue(raw)).toBe(want));
});

describe("entryValueText", () => {
  it.each<[unknown, string]>([[undefined, ""], [null, ""], [0, "0"], [2.5, "2.5"], ["hot", "hot"], [false, "false"]])("%j is %j", (v, want) => expect(entryValueText(v)).toBe(want));
});
