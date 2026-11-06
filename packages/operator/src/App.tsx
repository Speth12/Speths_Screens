import { useEffect, useRef, useState, useCallback } from "react";
import { WidgetHostProvider } from "@speths-screens/widgets";
import { useOperatorHost } from "./widgetHost";
import { usePageScript } from "./pageScript";
import { createProjectSync } from "./projectSync";
import { PageStage } from "./PageStage";
import { useElementSize } from "./useElementSize";
import { sessionStore } from "./store/session";
import { onWriteResult } from "./writeTag";
import { apiFetch, getToken, onTokenChange, setToken, wsURL } from "./auth";
import { LoginScreen } from "./LoginScreen";
import { applyAlarmMessage } from "./alarmMessages";
import { AlarmContext, type AlarmEvent } from "./alarmContext";
import { applyTheme, deviceFor, pickLanguage, resolveTheme, translator } from "@speths-screens/widgets";

// A browser's own theme choice, kept on this device only.
const THEME_KEY = "speths-screens-theme";
const LANGUAGE_KEY = "speths-screens-language";
const SCALE_KEY = "speths-screens-scale";
const AUTHED_KEY = "speths-screens-authed";
type Mode = "light" | "dark";
/** The browser's own light or dark choice; anything else saved (an old theme id) means none. */
const storedMode = (): Mode | null => {
  const v = readMigrated(THEME_KEY, "xhmi-theme");
  return v === "light" || v === "dark" ? v : null;
};

import type { Project, Recipe } from "@speths-screens/shared-types";
import { readMigrated } from "./storageKeys";
import { PageNav, navMode, useWindowWidth, type NavMode } from "./Nav";
import { TopBar } from "./TopBar";
import { SettingsScreen } from "./SettingsScreen";
import { PerfReadout, perfEnabled } from "./PerfReadout";



// ── Recipes panel ─────────────────────────────────────────────────────────
function RecipesPanel({ onClose }: { onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/recipes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Recipe[]) => setRecipes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const apply = async (r: Recipe) => {
    setApplying(r.id);
    setResult(null);
    try {
      const res = await apiFetch(`/api/v1/recipes/${encodeURIComponent(r.id)}/apply`, { method: "POST" });
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
  const windowWidth = useWindowWidth();
  const [error, setError] = useState("");
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [dsStatus, setDsStatus] = useState<Array<{ id: string; connected: boolean; tagCount: number; lastError?: string }>>([]);
  const wsAlarmRef = useRef<WebSocket | null>(null);

  // PIN auth
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTHED_KEY) === "1");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // Scale-to-fit: a page with a dynamic resolution is scaled to the window's width when on
  // (a fixed resolution always fits the window); the room is the canvas area without its padding.
  const [scaleToFit, setScaleToFit] = useState(() => readMigrated(SCALE_KEY, "xhmi-scale") === "1");
  const [canvasRef, viewport] = useElementSize();
  const toggleScale = () => setScaleToFit((s) => { localStorage.setItem(SCALE_KEY, s ? "0" : "1"); return !s; });

  // Theme — persisted in localStorage via applyTheme
  const [chosenMode, setChosenMode] = useState<Mode | null>(storedMode);
  const setMode = (v: string) => {
    const m: Mode | null = v === "light" || v === "dark" ? v : null;
    setChosenMode(m);
    try { if (m) localStorage.setItem(THEME_KEY, m); else localStorage.removeItem(THEME_KEY); } catch { /* private mode: not kept */ }
  };

  const [wantedLanguage, setWantedLanguage] = useState<string | null>(() => {
    try { return localStorage.getItem(LANGUAGE_KEY); } catch { return null; }
  });
  const language = pickLanguage(project ?? undefined, wantedLanguage);
  const chooseLanguage = (code: string) => {
    setWantedLanguage(code);
    try { localStorage.setItem(LANGUAGE_KEY, code); } catch { /* private mode: not kept */ }
  };

  const projectTheme = project?.theme;
  useEffect(() => {
    applyTheme(resolveTheme(projectTheme, chosenMode));
  }, [projectTheme, chosenMode]);

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
  const showPerf = perfEnabled(location.search);

  // Login: with security.mode "login" the runtime answers 401 without a
  // token (403 for a token that only allows a password change).
  const [needLogin, setNeedLogin] = useState(false);
  const [tokenRev, setTokenRev] = useState(0);
  useEffect(() => onTokenChange(() => setTokenRev((v) => v + 1)), []);

  // Load project every 5 s; a poll that finds the same project changes nothing
  const projectSync = useRef(createProjectSync());
  useEffect(() => {
    const sync = projectSync.current;
    const load = () =>
      apiFetch("/api/v1/project")
        .then((r) => {
          if (r.status === 401 || r.status === 403) { setNeedLogin(true); sync.reset(); return null; }
          setNeedLogin(false);
          return r.text();
        })
        .then((text) => {
          if (text === null) return;
          const poll = sync.accept(text);
          if (poll.kind === "changed") { sessionStore.define(poll.project.sessionVars ?? []); setProject(poll.project); setError(""); }
          else if (poll.kind === "same") setError("");
          else setError("No project deployed to this runtime.");
        })
        .catch(() => setError("Cannot reach runtime API."));

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [tokenRev]);

  // Datasource status — poll every 5 s
  useEffect(() => {
    const poll = () =>
      apiFetch("/api/v1/datasources")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Array<{ id: string; connected: boolean; tagCount: number; lastError?: string }>) => {
          if (Array.isArray(data)) setDsStatus(data);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [tokenRev]);

  // Alarm WebSocket (reconnects with a new token)
  useEffect(() => {
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(wsURL("/ws/alarms"));
      wsAlarmRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg: unknown = JSON.parse(e.data);
          setAlarms((prev) => applyAlarmMessage(prev, msg));
        } catch { /* ignore */ }
      };

      ws.onclose = () => setTimeout(connect, 3000);
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { stopped = true; wsAlarmRef.current?.close(); };
  }, [tokenRev]);

  const ack = async (eventId: string) => {
    try { await apiFetch(`/api/v1/alarms/${encodeURIComponent(eventId)}/ack`, { method: "POST" }); }
    catch { /* ignore */ }
  };

  const tryPin = useCallback(() => {
    if (pinInput === (project?.pin ?? "")) {
      setAuthed(true);
      sessionStorage.setItem(AUTHED_KEY, "1");
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

  const widgetHost = useOperatorHost(project, navigateToPage, language);

  // The open page's script, in a worker; navigate takes a page name or id.
  const navigateByName = useCallback((nameOrId: string) => {
    const p = project?.pages.find((pg) => pg.id === nameOrId || pg.name === nameOrId);
    if (p) navigateToPage(p.id);
  }, [project, navigateToPage]);
  const openPage = project?.pages[activePage] ?? project?.pages[0];
  usePageScript(openPage?.id, openPage?.script, navigateByName);

  // Tell the operator when a write did not go through.
  const [writeNotice, setWriteNotice] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWriteResult((r) => {
      if (r.status !== "failed" && r.status !== "not_confirmed") return;
      const what = r.status === "failed" ? "failed" : "was not confirmed";
      setWriteNotice(`Write of ${JSON.stringify(r.value)} to ${r.binding} ${what}${r.reason ? `: ${r.reason}` : ""}`);
      clearTimeout(timer);
      timer = setTimeout(() => setWriteNotice(null), 6000);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);

  const activeAlarms = alarms.filter((a) => a.active && !a.acked);

  if (needLogin) return <LoginScreen />;

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
  const tr = translator(project, language);
  const settingsIndex = project.pages.length;
  const settingsOpen = !isKiosk && activePage === settingsIndex;
  const navPages = [
    ...project.pages.map((p) => ({ ...p, name: tr(p.name), group: p.group ? tr(p.group) : p.group })),
    { id: "__settings", name: tr("Settings"), icon: "settings" as const, widgets: [] },
  ];
  const nav: NavMode = isKiosk ? "tabs" : navMode(project.shell?.nav, windowWidth);
  const phone = nav === "bottom";
  const securityOff = project.security?.mode !== "login";

  return (
    <AlarmContext.Provider value={{ alarms, ack }}>
    <WidgetHostProvider value={widgetHost}>
      {isKiosk && project.security?.mode !== "login" && (
        <div className="fixed top-1 right-1 z-50 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          Security off
        </div>
      )}
      {showPerf && <PerfReadout />}
      {writeNotice && (
        <div role="alert"
             className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded-md bg-red-900/90 text-red-100 text-sm px-4 py-2 shadow-lg">
          {writeNotice}
        </div>
      )}
      <div
        // h-screen in both modes: the canvas area scrolls and has a real height to fit a page to
        className={`${isKiosk ? "h-screen overflow-hidden" : "h-screen"} flex flex-col`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        {/* Top bar — hidden in kiosk mode */}
        {!isKiosk && (
          <TopBar
            projectName={project.name || "Speth's Screens"}
            pageName={settingsOpen ? tr("Settings") : page ? tr(page.name) : undefined}
            drivers={dsStatus.map((d) => ({ ...d, label: project.datasources.find((x) => x.id === d.id)?.label || d.id }))}
            phone={phone}
            menu={{ token: getToken(), loginRequired: !securityOff, onLogout: () => setToken(null) }}
          />
        )}
        {!isKiosk && nav === "tabs" && project.pages.length > 1 && (
          <div className="px-5 py-2 shrink-0" style={{ background: "var(--card)", borderBottom: "var(--line-width, 1px) solid var(--border)" }}>
            <PageNav mode="tabs" pages={navPages} active={activePage} onSelect={setActivePage} />
          </div>
        )}

        {!isKiosk && nav === "toolbar" && <PageNav mode="toolbar" pages={navPages} active={activePage} onSelect={setActivePage} />}

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

        <div className="flex flex-1 min-h-0">
        {!isKiosk && nav === "sidebar" && <PageNav mode="sidebar" pages={navPages} active={activePage} onSelect={setActivePage} />}
        {/* Canvas — responsive, swipe-enabled in kiosk */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto p-3"
          style={{ background: page.backgroundColor || undefined }}
          onTouchStart={isKiosk ? handleTouchStart : undefined}
          onTouchEnd={isKiosk ? handleTouchEnd : undefined}
        >
          {settingsOpen ? (
            <SettingsScreen
              t={tr}
              mode={chosenMode ?? ""}
              onMode={setMode}
              languages={project.languages}
              language={language}
              onLanguage={chooseLanguage}
              fit={project.canvasResolution?.type !== "fixed" && !phone ? { on: scaleToFit, toggle: toggleScale } : undefined}
              onRecipes={() => setShowRecipes(true)}
              onLock={project.pin ? () => { setAuthed(false); sessionStorage.removeItem(AUTHED_KEY); } : undefined}
            />
          ) : page.widgets.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-zinc-600 italic">No widgets on this page.</div>
          ) : (
            <PageStage
              widgets={page.widgets}
              resolution={project.canvasResolution}
              pixel={project.canvasSnap === "pixel"}
              fit={scaleToFit || phone}
              device={deviceFor(windowWidth)}
              viewport={viewport}
            />
          )}
        </div>

        </div>
        {!isKiosk && nav === "bottom" && <PageNav mode="bottom" pages={navPages} active={activePage} onSelect={setActivePage} />}

        {/* Kiosk status bar — clock + alarm count */}
        {isKiosk && (
          <KioskStatusBar alarmCount={activeAlarms.length} />
        )}
      </div>


      {/* Recipes slide-out panel */}
      {showRecipes && <RecipesPanel onClose={() => setShowRecipes(false)} />}

    </WidgetHostProvider>
    </AlarmContext.Provider>
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
