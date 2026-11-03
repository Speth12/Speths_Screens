import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, clearToken, setToken } from "./runtimeAuth";
import { setApiBase } from "./runtimeTarget";

afterEach(() => {
  vi.unstubAllGlobals();
  clearToken("");
  clearToken("http://plc:8080");
  setApiBase("");
});

function stubFetch() {
  const f = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("apiFetch", () => {
  const cases = [
    { name: "local, logged in", base: "", token: "t1", url: "/api/v1/alarms", auth: "Bearer t1" },
    { name: "local, no token", base: "", token: "", url: "/api/v1/alarms", auth: null },
    { name: "remote target, logged in", base: "http://plc:8080", token: "t2", url: "http://plc:8080/api/v1/alarms", auth: "Bearer t2" },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const f = stubFetch();
      setApiBase(c.base);
      if (c.token) setToken(c.base, c.token);
      await apiFetch("/api/v1/alarms", { method: "POST", headers: { "Content-Type": "application/json" } });
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      const headers = new Headers(init.headers);
      expect(url).toBe(c.url);
      expect(init.method).toBe("POST");
      expect(headers.get("Authorization")).toBe(c.auth);
      expect(headers.get("Content-Type")).toBe("application/json");
    });
  }

  it("uses the token of the target active at call time", async () => {
    const f = stubFetch();
    setToken("", "local");
    setToken("http://plc:8080", "remote");
    setApiBase("http://plc:8080");
    await apiFetch("/api/v1/users");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer remote");
  });
});
