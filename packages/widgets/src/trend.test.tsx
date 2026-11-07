import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, inertHost, type WidgetHost } from "./host";
import { WidgetRenderer } from "./widgets";
import { fitRange, niceScale, windowLabel } from "./trend";

afterEach(cleanup);

function host(extra: Partial<WidgetHost> = {}): WidgetHost {
  return { ...inertHost, useTag: () => ({ value: 5, quality: "Good", ts: 1 }), useTags: (paths) => Object.fromEntries(paths.map((p) => [p, { value: 5, quality: "Good", ts: 1 }])), ...extra };
}
function draw(w: Omit<Partial<Widget>, "type"> & { type: string }, h: WidgetHost) {
  const widget = { id: "w1", x: 0, y: 0, w: 8, h: 4, ...w } as Widget;
  return render(<WidgetHostProvider value={h}><WidgetRenderer w={widget} /></WidgetHostProvider>);
}

describe("trend scales", () => {
  it("fitRange leaves room around the data, and gives a flat line a range", () => {
    const r = fitRange([10, 20]);
    expect(r.lo).toBeLessThan(10);
    expect(r.hi).toBeGreaterThan(20);
    const flat = fitRange([5, 5]);
    expect(flat.hi).toBeGreaterThan(flat.lo);
    expect(fitRange([])).toEqual({ lo: 0, hi: 100 });
  });
  it("niceScale rounds to 1, 2 or 5 times a power of ten", () => {
    const s = niceScale(3.2, 97);
    expect(s.lo).toBe(0);
    expect(s.hi).toBe(100);
    expect(s.ticks).toEqual([0, 50, 100]);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks.at(-1)).toBe(100);
  });
  it("window labels", () => {
    expect(["30s", "1m", "5m", "1h", "1d"]).toEqual([30, 60, 300, 3600, 86400].map(windowLabel));
  });
});

describe("trend widget", () => {
  const trend = { type: "trend", bindings: { value: "plc:T" }, props: { duration: 60 } };
  const rows = [{ ts: (Date.now() - 30_000) * 1e6, value: 1, quality: "Good" }, { ts: (Date.now() - 20_000) * 1e6, value: 2, quality: "Good" }];

  it("asks the historian for the window it shows, and for an earlier one after stepping back", async () => {
    const urls: string[] = [];
    const apiFetch = vi.fn(async (u: string) => { urls.push(u); return new Response(JSON.stringify(rows), { status: 200 }); });
    draw(trend, host({ apiFetch: apiFetch as never }));
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    const from = (u: string) => Number(new URL(u, "http://x").searchParams.get("from"));
    const first = from(urls[0]!);
    fireEvent.click(screen.getByTitle("Back one step")); // one minute
    await waitFor(() => expect(urls.length).toBeGreaterThan(1));
    expect(first - from(urls.at(-1)!)).toBeGreaterThanOrEqual(59_000 * 1e6);
    expect(screen.getByText("▶ Live")).toBeTruthy();
    fireEvent.click(screen.getByText("▶ Live"));
    expect(screen.queryByText("▶ Live")).toBeNull();
  });

  it("long windows ask for buckets, short ones for samples", async () => {
    const urls: string[] = [];
    const apiFetch = vi.fn(async (u: string) => { urls.push(u); return new Response("[]", { status: 200 }); });
    draw({ ...trend, props: { duration: 3600 } }, host({ apiFetch: apiFetch as never }));
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls[0]).toContain("bucket=");
    cleanup();
    urls.length = 0;
    draw(trend, host({ apiFetch: apiFetch as never }));
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls[0]).not.toContain("bucket=");
  });

  it("the settings pick the window buttons, the pen style and what is shown", () => {
    const { container } = draw({ ...trend, props: { duration: 60, windows: [60, 7200], showLegend: false, showGrid: false,
      tags: [{ binding: "plc:T", color: "#ff0000", label: "T", style: "bars", dash: "dashed", width: 3 }] } }, host());
    expect(screen.getByText("2h")).toBeTruthy();
    expect(screen.queryByText("5m")).toBeNull();
    expect(container.querySelectorAll("svg line").length).toBe(0); // no grid
    cleanup();
    draw({ ...trend, props: { showToolbar: false, windows: [60] } }, host());
    expect(screen.queryByText("1m")).toBeNull();
  });

  it("starts paused when live is off", () => {
    draw({ ...trend, props: { live: false } }, host());
    expect(screen.getByText("▶ Live")).toBeTruthy();
  });
});

describe("frame settings", () => {
  const nd = (props: Record<string, unknown>) => draw({ type: "numericDisplay", bindings: { value: "plc:T" }, props: { label: "Temp", unit: "°C", ...props } }, host({ useTag: () => ({ value: 42.5, quality: "Good", ts: 1 }) }));
  it("a number-only widget: no label, no unit, no quality", () => {
    nd({ showLabel: false, showUnit: false });
    expect(screen.queryByText("Temp")).toBeNull();
    expect(screen.queryByText("°C")).toBeNull();
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.getByText("42.50")).toBeTruthy();
  });
  it("size, padding, corners and color come from the settings", () => {
    const { container } = nd({ fontPx: 48, padding: 2, radius: 0, borderWidth: 0, shadow: false, bgColor: "#112233", textColor: "#ffeedd", valign: "top" });
    const frame = container.querySelector(".select-none") as HTMLElement;
    expect(frame.style.padding).toBe("2px");
    expect(frame.style.borderRadius).toBe("0px");
    expect(frame.style.boxShadow).toBe("none");
    expect(frame.style.background).toContain("rgb(17, 34, 51)");
    expect(frame.innerHTML).toContain("font-size: 48px");
    expect(frame.innerHTML).toContain("justify-content: flex-start");
  });
  it("fit grows the text with its card", () => {
    const { container } = nd({ fontSize: "fit" });
    expect(container.innerHTML).not.toContain("text-3xl"); // the card sets the size, not the widget's own class
  });
});
