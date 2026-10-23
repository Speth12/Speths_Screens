import { useEffect, useRef, useState, useCallback } from "react";
import { useProject } from "../store/projectStore";
import { runPageScript } from "../store/scriptRuntime";
import { useShallow } from "zustand/react/shallow";
import { WidgetRenderer } from "../widgets";
import { wsEventsUrl } from "../store/runtimeTarget";

const COL_W = 80;
const ROW_H = 64;
const GAP   = 8;

/** Convert grid position to px (same formula as Canvas.tsx) */
function gx(col: number, span: number) {
  return { left: col * (COL_W + GAP), width: span * (COL_W + GAP) - GAP };
}
function gy(row: number, span: number) {
  return { top: row * (ROW_H + GAP), height: span * (ROW_H + GAP) - GAP };
}

type Props = { onExit: () => void };

export function PreviewMode({ onExit }: Props) {
  const { project, activePageId, setActivePage } = useProject(
    useShallow((s) => ({
      project:      s.project,
      activePageId: s.activePageId,
      setActivePage: s.setActivePage,
    }))
  );

  const page = project.pages.find((p) => p.id === activePageId) ?? project.pages[0];
  const resolution = project.canvasResolution ?? { type: "dynamic" };

  // ── PIN gate ──────────────────────────────────────────────────────────────
  const [pinOk, setPinOk] = useState(!project.pin);
  const [pinDraft, setPinDraft] = useState("");
  const [pinErr, setPinErr] = useState(false);

  const submitPin = (draft = pinDraft) => {
    if (draft === project.pin) { setPinOk(true); }
    else { setPinErr(true); setPinDraft(""); setTimeout(() => setPinErr(false), 800); }
  };

  const pinAppend = (d: string) => {
    setPinDraft((prev) => {
      const next = prev + d;
      if (project.pin && next.length >= project.pin.length) {
        setTimeout(() => submitPin(next), 50);
      }
      return next;
    });
  };
  const pinBackspace = () => setPinDraft((p) => p.slice(0, -1));

  // ── Runtime events WS (navigate_page from MCP / scripts) ─────────────────
  useEffect(() => {
    const url = wsEventsUrl();
    let ws: WebSocket;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data as string) as { type: string; target?: string; payload?: { pageId?: string } };
          if (ev.type === "hmi:navigate") {
            const pageId = ev.payload?.pageId ?? ev.target ?? "";
            const { project: p, setActivePage } = useProject.getState();
            const found = p.pages.find((pg) => pg.id === pageId || pg.name === pageId);
            if (found) setActivePage(found.id);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!closed) setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Page script execution ─────────────────────────────────────────────────
  useEffect(() => {
    if (!page?.script) return;
    const cleanup = runPageScript(page.script);
    return cleanup;
  }, [page?.id, page?.script]); // re-run when page changes or script changes

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // ── Scale calculation ─────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [canvasW, setCanvasW] = useState<number | undefined>();
  const [canvasH, setCanvasH] = useState<number | undefined>();

  const recalc = useCallback(() => {
    if (!containerRef.current) return;
    const { width: vw, height: vh } = containerRef.current.getBoundingClientRect();

    if (resolution.type === "fixed") {
      const fw = resolution.width;
      const fh = resolution.height;
      const s = Math.min(vw / fw, vh / fh);
      setScale(s);
      setCanvasW(fw);
      setCanvasH(fh);
    } else {
      // Dynamic: fit all widgets, scale to viewport
      const widgets = page?.widgets ?? [];
      const maxCol = widgets.reduce((m, w) => Math.max(m, w.x + w.w), 12);
      const maxRow = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 6);
      const naturalW = maxCol * (COL_W + GAP) - GAP;
      const naturalH = maxRow * (ROW_H + GAP) - GAP;
      const s = Math.min(vw / naturalW, vh / naturalH, 1);
      setScale(s);
      setCanvasW(naturalW);
      setCanvasH(naturalH);
    }
  }, [resolution, page]);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc]);

  // ── Toolbar auto-hide ─────────────────────────────────────────────────────
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToolbar = () => {
    setToolbarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToolbarVisible(false), 3000);
  };

  useEffect(() => {
    showToolbar();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PIN screen ────────────────────────────────────────────────────────────
  if (!pinOk) {
    const dots = Array.from({ length: Math.max(4, pinDraft.length) }, (_, i) =>
      i < pinDraft.length ? "●" : "○"
    );
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900 border border-zinc-700 w-64 shadow-2xl">
          <div className="text-sm font-semibold text-zinc-200">Operator Login</div>
          <div className={`flex gap-3 text-2xl tracking-widest transition-colors ${pinErr ? "text-red-400" : "text-zinc-100"}`}>
            {dots.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-3 gap-2 w-full">
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
              k === "" ? <div key={i} /> :
              <button
                key={i}
                onClick={() => k === "⌫" ? pinBackspace() : pinAppend(k)}
                className="py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-lg font-medium transition-all"
              >
                {k}
              </button>
            ))}
          </div>
          <button onClick={onExit} className="w-full py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-xs text-zinc-400">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Runtime view ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onMouseMove={showToolbar}
    >
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {page && (
          <div
            style={{
              position: "relative",
              width:  canvasW,
              height: canvasH,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              flexShrink: 0,
              background: page.backgroundColor ?? "var(--canvas-bg, #09090b)",
            }}
          >
            {page.widgets.map((w) => {
              const { left, width } = gx(w.x, w.w);
              const { top, height } = gy(w.y, w.h);
              return (
                <div
                  key={w.id}
                  style={{ position: "absolute", left, top, width, height }}
                >
                  <WidgetRenderer w={w} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toolbar — auto-hides after 3 s */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-black/70 backdrop-blur-sm transition-opacity duration-500 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Page tabs */}
        <div className="flex items-center gap-1">
          {project.pages.map((pg) => (
            <button
              key={pg.id}
              onClick={() => setActivePage(pg.id)}
              className={`text-[11px] px-3 py-1 rounded-full transition-colors ${
                pg.id === activePageId
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              {pg.name}
            </button>
          ))}
        </div>

        {/* Project name + exit */}
        <div className="flex items-center gap-3">
          {project.name && (
            <span className="text-[11px] text-zinc-500">{project.name}</span>
          )}
          <button
            onClick={onExit}
            className="text-[11px] px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
          >
            ✕ Exit Preview
          </button>
        </div>
      </div>
    </div>
  );
}
