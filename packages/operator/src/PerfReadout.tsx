// A small readout of how smoothly the screen is drawing, for checking a screen on a real panel. It
// appears only when the address has ?perf (for example http://localhost:8090/?perf) and costs nothing
// without it. It reports the last 10 seconds: frames per second, how long the slowest frames took, and
// how long the browser was frozen. It only looks at the screen it is on and sends nothing anywhere.
import { useEffect, useState } from "react";

export const WINDOW_MS = 10_000;
/** A frame longer than two frames at 60 Hz is a visible hitch. */
export const SLOW_MS = 33.4;
/** A gap this long is a hidden tab or a sleeping device, not a slow frame. */
const GAP_MS = 2000;

export type FrameStats = {
  frames: number;
  fps: number;
  /** The frame time 99% of frames beat, in ms. */
  p99: number;
  worst: number;
  /** Frames slower than SLOW_MS. */
  slow: number;
  /** The display's own rate, from the typical frame time. */
  hz: number;
};

/** The frames of the last few seconds, as the time each one took. */
export class FrameWindow {
  private frames: { t: number; dt: number }[] = [];
  private last: number | null = null;

  constructor(private readonly spanMs = WINDOW_MS) {}

  /** Records a frame drawn at time t (ms, as requestAnimationFrame gives it). */
  push(t: number): void {
    const dt = this.last === null ? null : t - this.last;
    this.last = t;
    // The first frame has no interval, and a long gap is the page being hidden, not a slow frame.
    if (dt !== null && dt > 0 && dt < GAP_MS) this.frames.push({ t, dt });
    const cut = t - this.spanMs;
    while (this.frames.length && this.frames[0]!.t < cut) this.frames.shift();
  }

  stats(): FrameStats | null {
    if (this.frames.length < 2) return null;
    const dts = this.frames.map((f) => f.dt).sort((a, b) => a - b);
    const total = dts.reduce((a, b) => a + b, 0);
    const at = (q: number) => dts[Math.min(dts.length - 1, Math.floor(dts.length * q))]!;
    return {
      frames: dts.length,
      fps: dts.length / (total / 1000),
      p99: at(0.99),
      worst: dts[dts.length - 1]!,
      slow: dts.filter((d) => d > SLOW_MS).length,
      hz: Math.round(1000 / at(0.5)),
    };
  }
}

/** Whether the address asks for the readout. */
export function perfEnabled(search: string): boolean {
  return new URLSearchParams(search).has("perf");
}

type LongTask = { t: number; ms: number };

export function PerfReadout() {
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [freeze, setFreeze] = useState({ count: 0, ms: 0 });

  useEffect(() => {
    const win = new FrameWindow();
    const longTasks: LongTask[] = [];
    let raf = 0;
    const tick = (t: number) => {
      win.push(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push({ t: e.startTime, ms: e.duration });
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      /* this browser has no long task reports: the freeze figure stays 0 */
    }

    const timer = setInterval(() => {
      setStats(win.stats());
      const from = performance.now() - WINDOW_MS;
      while (longTasks.length && longTasks[0]!.t < from) longTasks.shift();
      setFreeze({ count: longTasks.length, ms: Math.round(longTasks.reduce((a, b) => a + b.ms, 0)) });
    }, 1000);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      clearInterval(timer);
    };
  }, []);

  const color = !stats ? "#cbd5e1" : stats.fps >= 50 && stats.slow === 0 ? "#86efac" : stats.fps >= 30 ? "#fcd34d" : "#fca5a5";
  return (
    <div data-testid="perf-readout" aria-hidden="true"
      style={{
        position: "fixed", right: 8, bottom: 8, zIndex: 9999, pointerEvents: "none", padding: "6px 10px",
        borderRadius: 6, background: "rgba(15, 23, 42, 0.88)", color, font: "13px/1.4 ui-monospace, Consolas, monospace",
        whiteSpace: "pre",
      }}>
      {stats
        ? `${stats.fps.toFixed(1)} fps   p99 ${stats.p99.toFixed(1)} ms   worst ${stats.worst.toFixed(1)} ms\nslow frames ${stats.slow} of ${stats.frames}   frozen ${freeze.count}x (${freeze.ms} ms)\ndisplay about ${stats.hz} Hz   last ${WINDOW_MS / 1000} s`
        : "measuring..."}
    </div>
  );
}
