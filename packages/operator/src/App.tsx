import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { WidgetRenderer, ProjectImagesProvider, type Widget } from "./widgets";
import { WriteConfirmContext, NavigateContext, type WriteRequest } from "./writeContext";
import { AlarmContext, type AlarmEvent } from "./alarmContext";
import { themes, applyTheme, getThemeById, getStoredThemeId } from "./store/themes";

type Page = { id: string; name: string; widgets: Widget[]; backgroundColor?: string; script?: string };
type ProjectImage = { id: string; dataUrl: string };
type Project = {
  version: string;
  name?: string;
  pages: Page[];
  datasources: unknown[];
  images?: ProjectImage[];
  pin?: string;
  viewOnly?: boolean;
};

type Recipe = {
  id: string;
  name: string;
  description?: string;
  entries: Array<{ binding: string; value: unknown }>;
};


const COLS = 12;
const ROW_H = 72;

const severityBg: Record<string, string> = {
  critical: "bg-red-900/80 border-red-700",
  warning:  "bg-amber-900/80 border-amber-700",
  info:     "bg-blue-900/80 border-blue-700",
};


// ── Alarm log panel ────────────────────────────────────────────────────────
const severityRowBg: Record<string, string> = {
  critical: "border-red-800 bg-red-950/30",
  warning:  "border-amber-800 bg-amber-950/30",
  info:     "border-blue-800 bg-blue-950/30",
};
const severityText: Record<string, string> = {
  critical: "text-red-400",
  warning:  "text-amber-400",
  info:     "text-blue-400",
};

function AlarmLogPanel({ alarms, onAck, onClose }: {
  alarms: AlarmEvent[];
  onAck: (id: string) => void;
  onClose: () => void;
}) {
  const sorted = [...alarms].sort((a, b) =>
    new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-96 bg-zinc-900 border-l border-zinc-700 flex flex-col h-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-semibold">Alarm Log</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-500">{alarms.length} events</span>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {sorted.length === 0 && (
            <div className="text-zinc-600 text-xs italic text-center pt-6">No alarm events</div>
          )}
          {sorted.map((ev) => (
            <div
              key={ev.id}
              className={`rounded border px-3 py-2 ${ev.active && !ev.acked ? severityRowBg[ev.severity] ?? "border-zinc-700" : "border-zinc-800 bg-zinc-900/40"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${ev.active ? (severityText[ev.severity] ?? "text-zinc-400") : "text-zinc-600"}`}>
                  {ev.active ? "●" : "○"} {ev.severity.toUpperCase()}
                </span>
                <span className="text-[11px] font-medium flex-1 truncate">{ev.ruleName}</span>
                {ev.active && !ev.acked && (
                  <button
                    onClick={() => onAck(ev.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 shrink-0"
                  >
                    ACK
                  </button>
                )}
                {ev.acked && <span className="text-[10px] text-zinc-600 shrink-0">acked</span>}
                {!ev.active && !ev.acked && <span className="text-[10px] text-emerald-700 shrink-0">normal</span>}
              </div>
              {ev.message && <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{ev.message}</div>}
              <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                {`val=${ev.value.toFixed(2)} · ${new Date(ev.triggeredAt).toLocaleTimeString()}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Recipes panel ─────────────────────────────────────────────────────────
function RecipesPanel({ onClose }: { onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/recipes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Recipe[]) => setRecipes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const apply = async (r: Recipe) => {
    setApplying(r.id);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/recipes/${encodeURIComponent(r.id)}/apply`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; applied?: number; errors?: string[] };
      setResult({ id: r.id, ok: data.ok, msg: data.ok ? `Applied ${data.applied ?? "?"} tag${(data.applied ?? 1) !== 1 ? "s" : ""}` : (data.errors?.join(", ") ?? "Error") });
    } catch {
      setResult({ id: r.id, ok: false, msg: "Network error" });
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-80 bg-zinc-900 border-l border-zinc-700 flex flex-col h-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-semibold">Recipes</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {recipes.length === 0 && (
            <div className="text-zinc-600 text-xs italic text-center pt-6">No recipes configured</div>
          )}
          {recipes.map((rec) => {
            const res = result?.id === rec.id ? result : null;
            return (
              <div key={rec.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 space-y-2">
                <div className="font-medium text-sm">{rec.name}</div>
                {rec.description && <div className="text-[11px] text-zinc-500">{rec.description}</div>}
                <div className="text-[10px] text-zinc-600 font-mono space-y-0.5">
                  {rec.entries.map((e, i) => (
                    <div key={i}>{e.binding.split(":").pop()} = {String(e.value)}</div>
                  ))}
                </div>
                {res && (
                  <div className={`text-[11px] font-medium ${res.ok ? "text-emerald-400" : "text-red-400"}`}>
                    {res.ok ? "✓ " : "✗ "}{res.msg}
                  </div>
                )}
                <button
                  onClick={() => apply(rec)}
                  disabled={applying === rec.id}
                  className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold transition-colors"
                >
                  {applying === rec.id ? "Applying…" : "Apply Recipe"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [error, setError] = useState("");
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [showAlarmLog, setShowAlarmLog] = useState(false);
  const [dsStatus, setDsStatus] = useState<Array<{ id: string; connected: boolean; tagCount: number }>>([]);
  const wsAlarmRef = useRef<WebSocket | null>(null);

  // PIN auth
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("xhmi-authed") === "1");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Scale-to-fit: dynamically compute cell size from container width
  const [scaleToFit, setScaleToFit] = useState(() => localStorage.getItem("xhmi-scale") === "1");
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setContainerW(entries[0]!.contentRect.width - 24); // subtract p-3 * 2
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const cellPx = scaleToFit && containerW > 0 ? Math.max(40, Math.floor(containerW / COLS)) : 80;
  const toggleScale = () => setScaleToFit((s) => { localStorage.setItem("xhmi-scale", s ? "0" : "1"); return !s; });

  // Theme — persisted in localStorage via applyTheme
  const [themeId, setThemeId] = useState(getStoredThemeId);

  useEffect(() => {
    applyTheme(getThemeById(themeId));
  }, [themeId]);

  // Kiosk swipe — touch start X ref
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!project) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 60) return;
    setActivePage((p) => dx < 0
      ? Math.min(p + 1, project.pages.length - 1)
      : Math.max(p - 1, 0));
  }, [project]);

  // Kiosk mode: ?kiosk or ?kiosk=1 hides nav bar and page switcher.
  const isKiosk = new URLSearchParams(location.search).has("kiosk");

  // Load project every 5 s
  useEffect(() => {
    const load = () =>
      fetch("/api/v1/project")
        .then((r) => r.json())
        .then((p) => {
          if (p && p.pages) { setProject(p); setError(""); }
          else setError("No project deployed to this runtime.");
        })
        .catch(() => setError("Cannot reach runtime API."));

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  // Datasource status — poll every 5 s
  useEffect(() => {
    const poll = () =>
      fetch("/api/v1/datasources")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Array<{ id: string; connected: boolean; tagCount: number }>) => {
          if (Array.isArray(data)) setDsStatus(data);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  // Alarm WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws/alarms`);
      wsAlarmRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const ev: AlarmEvent = JSON.parse(e.data);
          setAlarms((prev) => {
            const idx = prev.findIndex((x) => x.id === ev.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = ev;
              return next;
            }
            return [...prev, ev];
          });
        } catch { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { wsAlarmRef.current?.close(); };
  }, []);

  const ack = async (eventId: string) => {
    try { await fetch(`/api/v1/alarms/${encodeURIComponent(eventId)}/ack`, { method: "POST" }); }
    catch { /* ignore */ }
  };

  const tryPin = useCallback(() => {
    if (pinInput === (project?.pin ?? "")) {
      setAuthed(true);
      sessionStorage.setItem("xhmi-authed", "1");
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 800);
    }
    setPinInput("");
  }, [pinInput, project]);

  const navigateToPage = useCallback((pageId: string) => {
    if (!project) return;
    const idx = project.pages.findIndex((p) => p.id === pageId);
    if (idx >= 0) setActivePage(idx);
  }, [project]);

  /** Write handler — blocked in viewOnly mode, executes immediately otherwise. */
  const requestWrite = useCallback(async (req: WriteRequest) => {
    if (project?.viewOnly) return;
    const sep = req.binding.indexOf(":");
    if (sep < 0) return;
    const datasource = req.binding.slice(0, sep);
    const path = req.binding.slice(sep + 1);
    try {
      await fetch(`/api/v1/tag/${encodeURIComponent(path)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasource, value: req.value }),
      });
    } catch { /* swallow */ }
  }, []);

  const activeAlarms = alarms.filter((a) => a.active && !a.acked);
  const hasAlarm = activeAlarms.length > 0;
  const worstSeverity = activeAlarms.some((a) => a.severity === "critical")
    ? "critical"
    : activeAlarms.some((a) => a.severity === "warning")
    ? "warning"
    : activeAlarms.length > 0 ? "info" : null;

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="text-center space-y-2"><div className="text-4xl">⚠</div><div>{error}</div></div>
      </div>
    );
  }

  if (!project) {
    return <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div>;
  }

  // PIN gate — show lock screen if project has a PIN and user hasn't authenticated
  if (project.pin && !authed) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-80 space-y-4 shadow-2xl text-center">
          <div className="text-2xl font-bold text-zinc-100">{project.name ?? "Speth's Screens"}</div>
          <div className="text-sm text-zinc-500">Enter PIN to continue</div>
          <input
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryPin()}
            placeholder="••••"
            autoFocus
            className={`w-full text-center text-xl tracking-[0.5em] bg-zinc-800 border rounded-lg px-4 py-3 outline-none transition-colors ${
              pinError ? "border-red-500 text-red-400 animate-pulse" : "border-zinc-600 focus:border-blue-500 text-zinc-100"
            }`}
          />
          <button onClick={tryPin}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors">
            Unlock
          </button>
        </div>
      </div>
    );
  }

  const page = project.pages[activePage] ?? project.pages[0];

  return (
    <ProjectImagesProvider value={project.images ?? []}>
    <AlarmContext.Provider value={{ alarms, ack }}>
    <NavigateContext.Provider value={navigateToPage}>
    <WriteConfirmContext.Provider value={requestWrite}>
      <div
        className={`${isKiosk ? "h-screen overflow-hidden" : "min-h-screen"} flex flex-col`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        {/* Header — hidden in kiosk mode */}
        {!isKiosk && (
          <div className="flex items-center gap-3 px-4 py-2 shrink-0"
               style={{ borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
            <span className="font-semibold text-sm">
              {project.name
                ? <>{project.name} <span className="text-zinc-500 font-normal text-xs">· Speth's Screens</span></>
                : <>Speth's Screens <span className="text-zinc-500 font-normal">Operator</span></>
              }
            </span>
            {/* Datasource connection status dots */}
            {dsStatus.length > 0 && (
              <div className="flex gap-1.5 items-center">
                {dsStatus.map((d) => (
                  <div
                    key={d.id}
                    title={`${d.id}: ${d.connected ? `connected (${d.tagCount} tags)` : "disconnected"}`}
                    className="flex items-center gap-1"
                  >
                    <div className={`w-2 h-2 rounded-full ${d.connected ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ boxShadow: d.connected ? "0 0 4px #22c55e88" : undefined }} />
                    <span className="text-[10px] text-zinc-500 font-mono">{d.id}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              {project.pages.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setActivePage(i)}
                  className="text-xs px-3 py-1 rounded transition-colors"
                  style={i === activePage
                    ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                    : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {hasAlarm && (
              <div className={`text-xs font-semibold px-2 py-0.5 rounded ${
                worstSeverity === "critical" ? "bg-red-700 animate-pulse" : worstSeverity === "warning" ? "bg-amber-700" : "bg-blue-700"
              }`}>
                ⚠ {activeAlarms.length} alarm{activeAlarms.length !== 1 ? "s" : ""}
              </div>
            )}
            <button
              onClick={() => setShowAlarmLog(true)}
              title="Open alarm log"
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{ background: alarms.length > 0 ? "var(--warning)" : "var(--secondary)", color: alarms.length > 0 ? "#000" : "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              🔔 Alarm Log
            </button>
            <button
              onClick={() => setShowRecipes(true)}
              title="Open recipes panel"
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
            >
              ⚙ Recipes
            </button>
            <button
              onClick={toggleScale}
              title={scaleToFit ? "Fixed cell size (80px)" : "Scale widgets to fit window"}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{
                background: scaleToFit ? "var(--primary)" : "var(--secondary)",
                color: scaleToFit ? "var(--primary-foreground)" : "var(--muted-foreground)",
                border: "1px solid var(--border)",
              }}
            >
              {scaleToFit ? "⤢ Fit" : "⤢ Fit"}
            </button>
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              className="text-[11px] rounded px-1.5 py-0.5 max-w-[140px] truncate"
              style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", border: "1px solid" }}
              title="Switch theme"
            >
              {themes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {project.pin && (
              <button
                onClick={() => { setAuthed(false); sessionStorage.removeItem("xhmi-authed"); }}
                title="Lock screen"
                className="text-xs px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              >
                🔒
              </button>
            )}
          </div>
        )}

        {/* Kiosk page switcher — touch-friendly tab bar at the top */}
        {isKiosk && project.pages.length > 1 && (
          <div className="flex shrink-0 border-b border-zinc-800">
            {project.pages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActivePage(i)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  i === activePage
                    ? "bg-blue-700 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Canvas — responsive, swipe-enabled in kiosk */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto p-3"
          style={{ background: page.backgroundColor || undefined }}
          onTouchStart={isKiosk ? handleTouchStart : undefined}
          onTouchEnd={isKiosk ? handleTouchEnd : undefined}
        >
          {page.widgets.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 italic">No widgets on this page.</div>
          ) : (
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${COLS}, ${cellPx}px)`,
                gridAutoRows: `${cellPx}px`,
              }}
            >
              {page.widgets.map((w) => (
                <div key={w.id} style={{
                  gridColumn: `${(w.x ?? 0) + 1} / span ${w.w}`,
                  gridRow: `${(w.y ?? 0) + 1} / span ${w.h}`,
                }}>
                  <WidgetRenderer w={w} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kiosk status bar — clock + alarm count */}
        {isKiosk && (
          <KioskStatusBar alarmCount={activeAlarms.length} />
        )}
      </div>


      {/* Recipes slide-out panel */}
      {showRecipes && <RecipesPanel onClose={() => setShowRecipes(false)} />}

      {/* Alarm log slide-out panel */}
      {showAlarmLog && (
        <AlarmLogPanel
          alarms={alarms}
          onAck={ack}
          onClose={() => setShowAlarmLog(false)}
        />
      )}
    </WriteConfirmContext.Provider>
    </NavigateContext.Provider>
    </AlarmContext.Provider>
    </ProjectImagesProvider>
  );
}

function KioskStatusBar({ alarmCount }: { alarmCount: number }) {
  const [now, setNow] = useState(new Date());
  const [fs, setFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFs = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900/60 border-t border-zinc-800 shrink-0 text-[11px] font-mono text-zinc-500">
      <button onClick={toggleFs} title={fs ? "Exit fullscreen" : "Enter fullscreen"}
        className="text-zinc-600 hover:text-zinc-300 transition-colors text-xs">
        {fs ? "⊡" : "⊞"}
      </button>
      {alarmCount > 0
        ? <span className="text-red-400 font-semibold">⚠ {alarmCount} active alarm{alarmCount !== 1 ? "s" : ""}</span>
        : <span>Speth's Screens</span>
      }
      <span>{now.toLocaleTimeString()}</span>
    </div>
  );
}
