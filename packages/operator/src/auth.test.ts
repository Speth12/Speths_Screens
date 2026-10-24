import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, changePassword, getToken, login, onTokenChange, setToken, wsURL } from "./auth";
import { writeTag } from "./writeTag";

type Seen = { url: string; auth: string | null; body?: unknown };

// mockFetch answers with status/body and records each request's URL and
// Authorization header.
function mockFetch(status: number, body: unknown) {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    seen.push({ url, auth: h.get("Authorization"), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status });
  });
  return seen;
}

beforeEach(() => {
  vi.stubGlobal("location", { protocol: "http:", host: "plc:8080" });
});

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends no Authorization without a token", async () => {
    const seen = mockFetch(200, {});
    await apiFetch("/api/v1/project");
    expect(seen[0]!.auth).toBeNull();
  });

  it("sends the token once logged in", async () => {
    const seen = mockFetch(200, {});
    setToken("tok-1");
    await apiFetch("/api/v1/project");
    expect(seen[0]!.auth).toBe("Bearer tok-1");
  });

  it("logs out on 401 and tells listeners", async () => {
    mockFetch(401, { error: "invalid or expired token" });
    setToken("expired");
    const changes = vi.fn();
    const off = onTokenChange(changes);
    const resp = await apiFetch("/api/v1/project");
    off();
    expect(resp.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(changes).toHaveBeenCalledTimes(1);
  });
});

describe("wsURL", () => {
  it.each([
    [null, "ws://plc:8080/ws/tags"],
    ["a b/c", "ws://plc:8080/ws/tags?token=a%20b%2Fc"],
  ])("token %s", (tok, want) => {
    setToken(tok);
    expect(wsURL("/ws/tags")).toBe(want);
  });

  it("uses wss on https", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "hmi.plant" });
    expect(wsURL("/ws/alarms")).toBe("wss://hmi.plant/ws/alarms");
  });
});

describe("login", () => {
  it.each([
    ["accepted", 200, { token: "t", mustChangePassword: false }, { ok: true, token: "t", mustChangePassword: false }],
    ["first admin must change", 200, { token: "t", mustChangePassword: true }, { ok: true, token: "t", mustChangePassword: true }],
    ["refused", 401, { error: "invalid credentials" }, { ok: false, error: "invalid credentials" }],
  ])("%s", async (_name, status, body, want) => {
    mockFetch(status, body);
    expect(await login("admin", "pw")).toEqual(want);
  });

  it("reports an unreachable runtime", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await login("admin", "pw")).toEqual({ ok: false, error: "The runtime is not reachable" });
  });
});

describe("changePassword", () => {
  it("sends both passwords with the given token", async () => {
    const seen = mockFetch(200, { ok: true });
    expect(await changePassword("change-only", "old-pass", "new-pass-1")).toBeNull();
    expect(seen[0]).toMatchObject({
      url: "/api/v1/auth/password",
      auth: "Bearer change-only",
      body: { currentPassword: "old-pass", newPassword: "new-pass-1" },
    });
  });

  it("returns the runtime's reason when refused", async () => {
    mockFetch(400, { error: "the new password needs at least 8 characters" });
    expect(await changePassword("t", "old", "short")).toBe("the new password needs at least 8 characters");
  });
});

it("writes carry the login token", async () => {
  const seen = mockFetch(200, { status: "confirmed" });
  setToken("tok-w");
  await writeTag("plc:SP", 1);
  expect(seen[0]!.auth).toBe("Bearer tok-w");
});
