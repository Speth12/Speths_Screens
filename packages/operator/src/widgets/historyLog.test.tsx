// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { WidgetRenderer, type Widget } from ".";
import { setToken } from "../auth";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setToken(null);
});

const historyLog = (pageSize: number): Widget =>
  ({ id: "h1", type: "historyLog", x: 0, y: 0, w: 6, h: 4, binding: "plc:temp", config: { pageSize } }) as Widget;

it("refetches with the token when the page size changes", async () => {
  const f = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", f);
  setToken("tok");
  const historyCalls = () => (f.mock.calls as unknown as [string, RequestInit][]).filter(([u]) => u.startsWith("/api/v1/history"));

  const { rerender } = render(<WidgetRenderer w={historyLog(100)} />);
  await waitFor(() => expect(historyCalls().some(([u]) => u.includes("limit=100"))).toBe(true));

  rerender(<WidgetRenderer w={historyLog(25)} />);
  await waitFor(() => expect(historyCalls().some(([u]) => u.includes("limit=25"))).toBe(true));

  for (const [, init] of historyCalls()) {
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  }
});
