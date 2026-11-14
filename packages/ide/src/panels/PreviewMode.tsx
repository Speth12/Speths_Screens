import { useEffect, useRef, useState, useCallback } from "react";
import { useProject } from "../store/projectStore";
import { PREVIEW_MINIMUM, PopupLayer, WidgetHostProvider, fitScale, placement, stageSize, pageBackground, resolveTheme, themeVars } from "@speths-screens/widgets";
import { runPageScript } from "../store/scriptRuntime";
import { useShallow } from "zustand/react/shallow";
import { WidgetRenderer, ideHost } from "../widgets";
import { wsEventsUrl } from "../store/runtimeTarget";
import type { CanvasResolution } from "@speths-screens/shared-types";
import { CloseIcon } from "../ui/icons";

const DYNAMIC: CanvasResolution = { type: "dynamic" };

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
  const resolution = project.canvasResolution ?? DYNAMIC;
  const pixel = project.canvasSnap === "pixel";

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
  }, []);

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

    // The same stage and fit as the operator screen (packages/widgets/src/layout.ts); a fixed
    // resolution fits the window, a dynamic one only shrinks to it.
    const stage = stageSize(resolution, page?.widgets ?? [], pixel, PREVIEW_MINIMUM);
    setScale(fitScale(stage, { width: vw, height: vh }, stage.fixed ? {} : { maxScale: 1 }));
    setCanvasW(stage.width);
    setCanvasH(stage.height);
  }, [resolution, page, pixel]);

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
  }, []);

  // ── Runtime view ──────────────────────────────────────────────────────────
  return (
    <WidgetHostProvider value={ideHost}>
    <PopupLayer render={(w) => <WidgetRenderer w={w} />} theme={themeVars(resolveTheme(project.theme))}>
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
              ...themeVars(resolveTheme(project.theme)),
              background: "var(--background)", ...pageBackground(page, project.theme, project.images),
            }}
          >
            {page.widgets.map((w) => (
              <div key={w.id} style={{ position: "absolute", ...placement(w, pixel) }}>
                <WidgetRenderer w={w} />
              </div>
            ))}
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
            <CloseIcon size={12} /> Exit Preview
          </button>
        </div>
      </div>
    </div>
    </PopupLayer>
    </WidgetHostProvider>
  );
}
