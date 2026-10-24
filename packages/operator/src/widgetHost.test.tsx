// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WidgetHostProvider, WidgetRenderer } from "@speths-screens/widgets";
import type { Project, Widget } from "@speths-screens/shared-types";
import { useOperatorHost } from "./widgetHost";
import { AlarmContext, type AlarmEvent } from "./alarmContext";
import { setToken } from "./auth";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setToken(null);
});

function project(extra: Partial<Project> = {}): Project {
  return { schemaVersion: 2, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...extra };
}

function Screen({ p, w, alarms = [], ack = () => {} }: { p: Project; w: Widget; alarms?: AlarmEvent[]; ack?: (id: string) => void }) {
  const host = useOperatorHost(p, () => {});
  return (
    <AlarmContext.Provider value={{ alarms, ack }}>
      <WidgetHostProvider value={host}><WidgetRenderer w={w} /></WidgetHostProvider>
    </AlarmContext.Provider>
  );
}

function stubFetch() {
  const f = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", f);
  return (prefix: string) => (f.mock.calls as unknown as [string, RequestInit][]).filter(([u]) => u.startsWith(prefix));
}

const widget = (type: string, extra: Partial<Widget> = {}): Widget =>
  ({ id: "w1", type, x: 0, y: 0, w: 4, h: 2, ...extra }) as Widget;

it("history log refetches with the token when the page size changes", async () => {
  const calls = stubFetch();
  setToken("tok");
  const hist = (pageSize: number) => widget("historyLog", { bindings: { value: "plc:temp" }, props: { pageSize } });
  const { rerender } = render(<Screen p={project()} w={hist(100)} />);
  await waitFor(() => expect(calls("/api/v1/history").some(([u]) => u.includes("limit=100"))).toBe(true));
  rerender(<Screen p={project()} w={hist(25)} />);
  await waitFor(() => expect(calls("/api/v1/history").some(([u]) => u.includes("limit=25"))).toBe(true));
  for (const [, init] of calls("/api/v1/history")) {
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  }
});

describe("momentary button", () => {
  const button = widget("button", { bindings: { value: "plc:Start" }, props: { label: "Start" },
    events: { onPress: [{ type: "write", value: 1 }], onRelease: [{ type: "write", value: 0 }] } });
  const cases = [
    { name: "writes press and release with the widget id", viewOnly: false, writes: 2 },
    { name: "a view-only project writes nothing", viewOnly: true, writes: 0 },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const calls = stubFetch();
      render(<Screen p={project({ viewOnly: c.viewOnly })} w={button} />);
      fireEvent.pointerDown(screen.getByRole("button"));
      fireEvent.pointerUp(screen.getByRole("button"));
      await new Promise((r) => setTimeout(r, 20));
      const writes = calls("/api/v1/tag/");
      expect(writes.length).toBe(c.writes);
      for (const [, init] of writes) expect(JSON.parse(String(init.body))).toMatchObject({ datasource: "plc", widgetId: "w1" });
    });
  }
});

it("image widget shows a project library image", () => {
  stubFetch();
  const p = project({ images: [{ id: "img1", name: "logo", dataUrl: "data:image/png;base64,AAAA" } as NonNullable<Project["images"]>[number]] });
  render(<Screen p={p} w={widget("image", { props: { src: "lib:img1", label: "logo" } })} />);
  expect((screen.getByAltText("logo") as HTMLImageElement).src).toBe("data:image/png;base64,AAAA");
});

it("alarm banner shows the runtime's alarms and acknowledges them", () => {
  stubFetch();
  const ack = vi.fn();
  const alarms: AlarmEvent[] = [
    { id: "e1", ruleName: "Tank high", severity: "critical", message: "level 98", binding: "plc:L", value: 98, active: true, acked: false, triggeredAt: "2026-10-24T10:00:00Z" },
  ];
  render(<Screen p={project()} w={widget("alarmBanner")} alarms={alarms} ack={ack} />);
  expect(screen.getByText("Tank high — level 98")).toBeTruthy();
  fireEvent.click(screen.getByText("ACK"));
  expect(ack).toHaveBeenCalledWith("e1");
});
