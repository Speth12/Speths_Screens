// The trend widget: pens with their own style, a Y axis that follows the data or stays fixed, and a time axis
// that can run live, pause, and step back through the historian (a second, a minute, an hour, a day at a time).
import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendSeries, TypedWidget } from "@speths-screens/shared-types";
import { useHost, useTags } from "./host";

type Sample = { ts: number; v: number };
type Group = { lo: number; hi: number; ticks: number[] };

export const TREND_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];
export const DEFAULT_WINDOWS = [30, 60, 300, 3600];
const STEPS = [
  { label: "1 s", ms: 1000 },
  { label: "1 min", ms: 60_000 },
  { label: "1 hour", ms: 3_600_000 },
  { label: "1 day", ms: 86_400_000 },
];
const MAX_LIVE = 20_000;
/** Above this span the historian is asked for buckets instead of every sample. */
const RAW_SPAN_MS = 10 * 60_000;

export function windowLabel(sec: number): string {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/** Round limits and a tick list that land on tidy numbers (1, 2, 5 times a power of ten). */
export function niceScale(lo: number, hi: number, count = 5): Group {
  const range = hi - lo || 1;
  const rough = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const nlo = Math.floor(lo / step + 1e-9) * step;
  const nhi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = nlo; v <= nhi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo: nlo, hi: nhi, ticks };
}

/** The range of some values with a little room above and below; a flat line gets a range of its own. */
export function fitRange(values: number[], pad = 0.08): { lo: number; hi: number } {
  if (!values.length) return { lo: 0, hi: 100 };
  const lo = Math.min(...values), hi = Math.max(...values);
  if (hi === lo) { const d = Math.abs(lo) * 0.1 || 1; return { lo: lo - d, hi: hi + d }; }
  const room = (hi - lo) * pad;
  return { lo: lo - room, hi: hi + room };
}

const evenTicks = (lo: number, hi: number, n = 5) => Array.from({ length: n }, (_, k) => lo + ((hi - lo) * k) / (n - 1));

function tickText(v: number, range: number): string {
  const d = range >= 100 ? 0 : range >= 10 ? 1 : range >= 1 ? 2 : 3;
  return v.toFixed(d).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

/** Samples of one tag: what the historian holds for the window shown, then the live values on top. */
function useTrendData(bindings: (string | undefined)[], range: () => { tMin: number; tMax: number }, live: boolean, fetchKey: string) {
  const { apiFetch } = useHost();
  const key = bindings.join("|");
  const paths = useMemo(() => bindings.filter((b): b is string => !!b), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const states = useTags(paths);
  const [history, setHistory] = useState<Record<string, Sample[]>>({});
  const liveRef = useRef<Record<string, Sample[]>>({});
  const [version, setVersion] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      const { tMin, tMax } = range();
      const span = tMax - tMin;
      const from = (tMin - span * 0.1) * 1e6;
      const to = (live ? Date.now() : tMax + span * 0.02) * 1e6;
      const bucket = span > RAW_SPAN_MS ? `&bucket=${Math.max(1, Math.ceil(span / 400 / 1000))}s&limit=2000` : "&limit=5000";
      Promise.all(paths.map(async (path): Promise<[string, Sample[]]> => {
        try {
          const r = await apiFetch(`/api/v1/history?path=${encodeURIComponent(path)}&from=${Math.floor(from)}&to=${Math.floor(to)}${bucket}`);
          const rows: Array<{ ts: number; value?: unknown; avg?: number | null }> = r.ok ? await r.json() : [];
          const out: Sample[] = [];
          for (const s of Array.isArray(rows) ? rows : []) {
            const v = bucket.includes("bucket") ? s.avg : s.value;
            if (typeof v === "number") out.push({ ts: s.ts > 1e15 ? s.ts / 1e6 : s.ts, v });
          }
          return [path, out];
        } catch { return [path, []]; }
      })).then((all) => { if (mine === seq.current) setHistory(Object.fromEntries(all)); });
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchKey, key, apiFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  // A host may hand back a new object on every render, so the effect follows what the values say.
  const seen = paths.map((p) => `${states[p]?.value}@${states[p]?.ts}/${states[p]?.quality}`).join("|");
  useEffect(() => {
    let changed = false;
    for (const path of paths) {
      const t = states[path];
      if (!t || typeof t.value !== "number" || t.quality === "Unknown") continue;
      const now = t.ts > 1e15 ? t.ts / 1e6 : t.ts > 0 ? t.ts : Date.now();
      const buf = (liveRef.current[path] ??= []);
      if (buf.length && buf[buf.length - 1]!.ts >= now) continue;
      buf.push({ ts: now, v: t.value });
      if (buf.length > MAX_LIVE) buf.splice(0, buf.length - MAX_LIVE);
      changed = true;
    }
    if (changed) setVersion((n) => n + 1);
  }, [seen, paths]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => bindings.map((b): Sample[] => {
    if (!b) return [];
    const h = history[b] ?? [];
    const lastH = h.length ? h[h.length - 1]!.ts : -Infinity;
    return [...h, ...(liveRef.current[b] ?? []).filter((s) => s.ts > lastH)];
  }), [history, version, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function TrendWidget({ w }: { w: TypedWidget<"trend"> }) {
  const p = w.props ?? {};
  const windows = p.windows?.length ? p.windows : DEFAULT_WINDOWS;
  const [windowSec, setWindowSec] = useState(p.duration ?? 300);
  // null follows the present; a number holds the right edge of the window at that time.
  const [endMs, setEndMs] = useState<number | null>(p.live === false ? Date.now() : null);
  const [stepMs, setStepMs] = useState(STEPS[1]!.ms);
  const [now, setNow] = useState(Date.now());
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [plotW, setPlotW] = useState(400);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ x: number; end: number } | null>(null);

  useEffect(() => {
    if (endMs !== null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endMs]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPlotW(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const duration = windowSec * 1000;
  const tMax = endMs ?? now;
  const tMin = tMax - duration;
  const live = endMs === null;

  const series: TrendSeries[] = p.tags?.length ? p.tags
    : w.bindings?.value ? [{ binding: w.bindings.value, color: TREND_COLORS[0]! }] : [];
  const bindings = series.slice(0, 6).map((s) => s.binding || undefined);
  const rangeRef = useRef({ tMin, tMax });
  rangeRef.current = { tMin, tMax };
  const fetchKey = live ? `L${duration}` : `H${Math.round(tMin / Math.max(1000, duration / 20))}_${duration}`;
  const data = useTrendData(bindings, () => rangeRef.current, live, fetchKey);

  const colorOf = (i: number) => series[i]?.color || TREND_COLORS[i % TREND_COLORS.length]!;
  const inView = (q: Sample) => q.ts >= tMin - duration * 0.02 && q.ts <= tMax + duration * 0.02;
  // A pen holds its last value until the next sample, so a live line runs to the right edge.
  const shown = data.map((pts, i) => {
    const vis = pts.filter(inView);
    const before = pts.filter((q) => q.ts < tMin - duration * 0.02).at(-1);
    const lead = before && !vis.length ? [{ ts: tMin, v: before.v }] : [];
    const out = [...lead, ...vis];
    const last = out.at(-1);
    const style = series[i]?.style ?? "line";
    if (last && last.ts < tMax && (live || pts.at(-1) === last) && style !== "dots" && style !== "bars") out.push({ ts: tMax, v: last.v });
    return out;
  });

  // Y scales: pens that share an axis use one.
  const hasLimits = p.min !== undefined || p.max !== undefined || series.some((s) => s.yMin !== undefined || s.yMax !== undefined);
  const mode = p.autoscale ?? (hasLimits ? "fixed" : "fit");
  const groupKey = (i: number) => (series[i]?.axis === "shared" ? "shared" : `own${i}`);
  const groups = new Map<string, Group>();
  series.slice(0, 6).forEach((_, i) => {
    const k = groupKey(i);
    if (groups.has(k)) return;
    const members = series.slice(0, 6).map((__, j) => j).filter((j) => groupKey(j) === k);
    const vals = members.flatMap((j) => shown[j]!.map((q) => q.v));
    const fit = fitRange(vals);
    const limLo = members.map((j) => series[j]!.yMin).find((v) => v !== undefined) ?? p.min;
    const limHi = members.map((j) => series[j]!.yMax).find((v) => v !== undefined) ?? p.max;
    let g: Group;
    if (mode === "fixed") {
      const lo = limLo ?? fit.lo;
      let hi = limHi ?? fit.hi;
      if (hi <= lo) hi = lo + 1;
      g = { lo, hi, ticks: evenTicks(lo, hi) };
    } else if (mode === "nice") g = niceScale(fit.lo, fit.hi);
    else g = { lo: fit.lo, hi: fit.hi, ticks: evenTicks(fit.lo, fit.hi) };
    groups.set(k, g);
  });
  const gOf = (i: number): Group => groups.get(groupKey(i)) ?? { lo: 0, hi: 100, ticks: evenTicks(0, 100) };
  const toX = (ts: number) => ((ts - tMin) / duration) * 100;
  const toY = (v: number, i: number) => { const g = gOf(i); return 100 - ((v - g.lo) / (g.hi - g.lo || 1)) * 100; };
  const gridTicks = series.length ? gOf(0).ticks.map((t) => 100 - ((t - gOf(0).lo) / (gOf(0).hi - gOf(0).lo || 1)) * 100) : [0, 25, 50, 75, 100];

  const fmtTick = (ms: number): string => {
    const d = new Date(ms);
    const xFormat = p.xFormat ?? "time";
    if (xFormat === "relative") {
      const diff = Math.round((ms - tMax) / 1000);
      if (diff === 0) return live ? "now" : "0";
      const abs = Math.abs(diff);
      const sign = diff < 0 ? "−" : "+";
      return abs < 60 ? `${sign}${abs}s` : abs < 3600 ? `${sign}${Math.round(abs / 60)}m` : abs < 172800 ? `${sign}${Math.round(abs / 3600)}h` : `${sign}${Math.round(abs / 86400)}d`;
    }
    const day = d.toLocaleDateString([], { month: "numeric", day: "numeric" });
    const short = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (xFormat === "datetime" || duration > 86_400_000) return `${day} ${short}`;
    if ((xFormat === "time-short" && duration > 300_000) || duration > 3_600_000) return short;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  const fmtTime = (ms: number) => `${new Date(ms).toLocaleDateString([], { month: "numeric", day: "numeric" })} ${new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  const X_TICKS = Math.max(2, Math.min(6, Math.floor(plotW / 130) + 1));
  const xTicks = Array.from({ length: X_TICKS }, (_, k) => ({ frac: k / (X_TICKS - 1), ms: tMin + (k / (X_TICKS - 1)) * duration }));

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setWindowSec((s) => Math.max(5, Math.min(30 * 86400, Math.round(s * (e.deltaY > 0 ? 1.3 : 0.77)))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const fracAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return !r || r.width === 0 ? null : Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const goTo = (t: number) => setEndMs(t >= Date.now() - 500 ? null : t);
  const onMouseDown = (e: React.MouseEvent) => { panStart.current = { x: e.clientX, end: endMs ?? Date.now() }; setPanning(true); };
  const onMouseMove = (e: React.MouseEvent) => {
    const f = fracAt(e.clientX);
    if (f == null) return;
    setHoverFrac(f);
    const ps = panStart.current;
    if (ps) {
      const width = svgRef.current?.getBoundingClientRect().width || 1;
      goTo(ps.end - ((e.clientX - ps.x) / width) * duration);
    }
  };
  const onMouseUp = () => { panStart.current = null; setPanning(false); };

  const hoverTime = hoverFrac != null ? tMin + hoverFrac * duration : null;
  const nearest = (pts: Sample[]) => {
    if (hoverTime == null || !pts.length) return null;
    return pts.reduce((b, q) => (Math.abs(q.ts - hoverTime) < Math.abs(b.ts - hoverTime) ? q : b));
  };

  const pen = (pts: Sample[], i: number) => {
    const s = series[i]!;
    const color = colorOf(i);
    const style = s.style ?? "line";
    const width = s.width ?? 1.5;
    const dash = s.dash === "dashed" ? "6 4" : s.dash === "dotted" ? "1.5 4" : undefined;
    if (!pts.length) return null;
    const xy = pts.map((q) => [toX(q.ts), toY(q.v, i)] as const);
    const f = (n: number) => n.toFixed(2);
    if (style === "dots") {
      return <g key={i}>{xy.map(([x, y], k) => <line key={k} x1={f(x)} y1={f(y)} x2={f(x + 0.01)} y2={f(y)} stroke={color} strokeWidth={width * 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}</g>;
    }
    if (style === "bars") {
      return <path key={i} d={xy.map(([x, y]) => `M${f(x)},100 L${f(x)},${f(y)}`).join(" ")} stroke={color} strokeWidth={Math.max(1, width)} fill="none" vectorEffect="non-scaling-stroke" />;
    }
    let d = `M${f(xy[0]![0])},${f(xy[0]![1])}`;
    for (let k = 1; k < xy.length; k++) d += style === "step" ? ` L${f(xy[k]![0])},${f(xy[k - 1]![1])} L${f(xy[k]![0])},${f(xy[k]![1])}` : ` L${f(xy[k]![0])},${f(xy[k]![1])}`;
    const filled = style === "area" || s.fill;
    return (
      <g key={i}>
        {filled && <path d={`${d} L${f(xy.at(-1)![0])},100 L${f(xy[0]![0])},100 Z`} fill={color} fillOpacity="0.15" stroke="none" />}
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    );
  };

  const btn = "text-xs px-1.5 py-0.5 rounded transition-colors bg-zinc-800 text-zinc-500 hover:bg-zinc-700";
  const on = "text-xs px-1.5 py-0.5 rounded bg-blue-600 text-white";
  const stepBack = (dir: 1 | -1) => goTo((endMs ?? Date.now()) - dir * stepMs);
  const axes = [...new Set(series.slice(0, 6).map((_, i) => groupKey(i)))].map((k) => ({ k, i: series.slice(0, 6).findIndex((__, j) => groupKey(j) === k) }));

  return (
    <div className="flex flex-col h-full min-h-0">
      {(p.showToolbar ?? true) && (
        <div className="flex gap-1 items-center shrink-0 mb-0.5 flex-wrap">
          {windows.map((sec) => (
            <button key={sec} onClick={() => setWindowSec(sec)} className={windowSec === sec ? on : btn}>{windowLabel(sec)}</button>
          ))}
          <button onClick={() => (live ? setEndMs(Date.now()) : setEndMs(null))} title={live ? "Pause" : "Back to live"}
            className={live ? btn : "text-xs px-1.5 py-0.5 rounded bg-amber-700/80 text-amber-200"}>{live ? "⏸" : "▶ Live"}</button>
          <span className="flex items-center gap-0.5 ml-1">
            <button onClick={() => stepBack(1)} className={btn} title="Back one step">◀</button>
            <select value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))} className="text-xs rounded bg-zinc-800 text-zinc-500 px-0.5 py-0.5" aria-label="Step size">
              {STEPS.map((s) => <option key={s.ms} value={s.ms}>{s.label}</option>)}
            </select>
            <button onClick={() => stepBack(-1)} disabled={live} className={`${btn} disabled:opacity-40`} title="Forward one step">▶</button>
          </span>
          {!live && <button onClick={() => setEndMs(null)} className={btn}>↩ now</button>}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-1 min-w-0 pt-2">
        {axes.map(({ k, i }) => {
          const g = gOf(i);
          return (
            <div key={k} className="relative shrink-0 w-10 mb-4 text-xs tabular-nums text-right leading-none" style={{ color: colorOf(i) }}>
              {g.ticks.map((t, n) => (
                <span key={n} className="absolute right-0" style={{ top: `${100 - ((t - g.lo) / (g.hi - g.lo || 1)) * 100}%`, transform: "translateY(-50%)" }}>{tickText(t, g.hi - g.lo)}</span>
              ))}
            </div>
          );
        })}

        <div className="flex-1 relative min-w-0 min-h-0 flex flex-col">
          <div className="relative flex-1 min-h-0">
          <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ cursor: panning ? "grabbing" : "crosshair", display: "block" }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => { setHoverFrac(null); onMouseUp(); }}>
            {(p.showGrid ?? true) && gridTicks.map((y, n) => (
              <line key={n} x1="0" y1={y} x2="100" y2={y} style={{ stroke: "var(--border)" }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {shown.map((pts, i) => pen(pts, i))}
            {shown.map((pts, i) => {
              const last = pts.at(-1);
              return live && last && (series[i]?.style ?? "line") !== "bars" ? <line key={`d${i}`} x1={toX(last.ts)} y1={toY(last.v, i)} x2={toX(last.ts) + 0.01} y2={toY(last.v, i)} stroke={colorOf(i)} strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null;
            })}
            {(p.refLines ?? []).map((rl, i) => {
              const y = toY(rl.value, 0);
              if (y < -5 || y > 105) return null;
              return (
                <g key={`r${i}`}>
                  <line x1="0" y1={y} x2="100" y2={y} stroke={rl.color} strokeWidth="1" strokeDasharray="3,2" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
            {hoverFrac != null && (
              <>
                <line x1={hoverFrac * 100} y1="0" x2={hoverFrac * 100} y2="100" style={{ stroke: "var(--muted-foreground)" }} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />
                {shown.map((pts, i) => {
                  const near = nearest(pts);
                  return near ? <line key={`c${i}`} x1={toX(near.ts)} y1={toY(near.v, i)} x2={toX(near.ts) + 0.01} y2={toY(near.v, i)} stroke={colorOf(i)} strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null;
                })}
              </>
            )}
          </svg>
          {(p.refLines ?? []).map((rl, i) => {
            const y = toY(rl.value, 0);
            return rl.label && y >= 0 && y <= 100
              ? <span key={`rl${i}`} className="absolute left-1 text-xs pointer-events-none whitespace-nowrap" style={{ top: `${y}%`, color: rl.color, transform: "translateY(-100%)" }}>{rl.label}</span>
              : null;
          })}
          </div>

          <div className="relative shrink-0 h-4">
            {xTicks.map(({ frac, ms }) => (
              <span key={frac} className="absolute text-xs tabular-nums whitespace-nowrap"
                style={{ left: `${frac * 100}%`, color: "var(--muted-foreground)", transform: frac === 0 ? "none" : frac === 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
                {fmtTick(ms)}
              </span>
            ))}
          </div>

          {hoverFrac != null && hoverTime != null && (
            <div className="absolute top-0 pointer-events-none z-10 rounded px-2 py-1.5 text-xs tabular-nums space-y-0.5 shadow-xl"
              style={{
                background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", maxWidth: 180,
                left: hoverFrac > 0.65 ? undefined : `calc(${hoverFrac * 100}% + 6px)`,
                right: hoverFrac > 0.65 ? `calc(${(1 - hoverFrac) * 100}% + 6px)` : undefined,
              }}>
              <div style={{ color: "var(--muted-foreground)" }}>{fmtTime(hoverTime)}</div>
              {shown.map((pts, i) => {
                const near = nearest(pts);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-2 h-px inline-block" style={{ backgroundColor: colorOf(i) }} />
                    <span style={{ color: colorOf(i) }} className="font-semibold">{series[i]?.label || `s${i}`}:</span>
                    <span>{near ? tickText(near.v, 1) : "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(p.showLegend ?? true) && (
        <div className="flex items-center gap-2 text-xs tabular-nums mt-0.5 shrink-0 flex-wrap">
          {series.slice(0, 6).map((s, i) => {
            const last = data[i]?.at(-1);
            return (
              <span key={i} className="flex items-center gap-1">
                <span className="w-2 h-px inline-block rounded" style={{ backgroundColor: colorOf(i) }} />
                <span style={{ color: colorOf(i) }} className="font-semibold">{s.label || `s${i}`}</span>
                <span className="text-zinc-500">{last ? tickText(last.v, 1) : "—"}</span>
              </span>
            );
          })}
          {!live && <span className="text-zinc-500 ml-auto">{fmtTime(tMin)} – {fmtTime(tMax)}</span>}
        </div>
      )}
    </div>
  );
}
