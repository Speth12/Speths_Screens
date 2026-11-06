// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { FrameWindow, PerfReadout, SLOW_MS, WINDOW_MS, perfEnabled } from "./PerfReadout";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Frames at a steady interval, starting at t = 0. */
function steady(win: FrameWindow, intervalMs: number, count: number, start = 0): number {
  let t = start;
  for (let i = 0; i < count; i++, t += intervalMs) win.push(t);
  return t - intervalMs;
}

describe("perfEnabled", () => {
  it.each([
    ["?perf", true], ["?perf=1", true], ["?kiosk&perf", true], ["?kiosk", false], ["", false], ["?performance", false],
  ])("%s is %s", (search, want) => expect(perfEnabled(search)).toBe(want));
});

describe("FrameWindow", () => {
  it("has nothing to report before it has two frames", () => {
    const w = new FrameWindow();
    expect(w.stats()).toBeNull();
    w.push(0);
    expect(w.stats()).toBeNull();
  });

  it("a steady 60 Hz is 60 fps, no slow frames, and a 60 Hz display", () => {
    const w = new FrameWindow();
    steady(w, 1000 / 60, 300);
    const s = w.stats()!;
    expect(s.fps).toBeCloseTo(60, 0);
    expect(s.slow).toBe(0);
    expect(s.hz).toBe(60);
    expect(s.worst).toBeCloseTo(16.7, 1);
    expect(s.p99).toBeCloseTo(16.7, 1);
  });

  it("counts a hitch: one 100 ms frame is slow, is the worst, and lowers the fps", () => {
    const w = new FrameWindow();
    const t = steady(w, 1000 / 60, 100);
    w.push(t + 100);
    steady(w, 1000 / 60, 100, t + 100 + 1000 / 60);
    const s = w.stats()!;
    expect(s.slow).toBe(1);
    expect(s.worst).toBeCloseTo(100, 0);
    expect(s.fps).toBeLessThan(60);
    expect(s.hz).toBe(60); // the display rate is the typical frame, not the hitch
  });

  it("a frame of exactly the limit is not slow, one just over is", () => {
    const w = new FrameWindow();
    w.push(0); w.push(SLOW_MS); w.push(SLOW_MS + SLOW_MS + 1);
    expect(w.stats()!.slow).toBe(1);
  });

  it("forgets frames older than the window", () => {
    const w = new FrameWindow();
    const t = steady(w, 100, 50); // slow frames, long ago
    const later = t + WINDOW_MS + 5000;
    steady(w, 1000 / 60, 120, later);
    const s = w.stats()!;
    expect(s.slow).toBe(0);
    expect(s.fps).toBeCloseTo(60, 0);
  });

  it("does not count a hidden tab's long gap as a slow frame", () => {
    const w = new FrameWindow();
    const t = steady(w, 1000 / 60, 60);
    steady(w, 1000 / 60, 60, t + 30_000);
    const s = w.stats()!;
    expect(s.slow).toBe(0);
    expect(s.worst).toBeLessThan(20);
  });
});

describe("PerfReadout", () => {
  it("says it is measuring, then shows frames per second once frames arrive", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let cb: FrameRequestCallback = () => {};
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { cb = f; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render(<PerfReadout />);
    expect(screen.getByTestId("perf-readout").textContent).toBe("measuring...");
    for (let i = 0; i < 90; i++) act(() => cb(i * (1000 / 60)));
    act(() => { vi.advanceTimersByTime(1000); });
    const text = screen.getByTestId("perf-readout").textContent!;
    expect(text).toMatch(/60\.\d fps/);
    expect(text).toContain("slow frames 0 of");
    expect(text).toContain("display about 60 Hz");
  });

  it("is hidden from assistive technology and does not catch clicks", () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render(<PerfReadout />);
    const el = screen.getByTestId("perf-readout");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.pointerEvents).toBe("none");
  });

  it("stops measuring when it goes away", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", () => 7);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { unmount } = render(<PerfReadout />);
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
