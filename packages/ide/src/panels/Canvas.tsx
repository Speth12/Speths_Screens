import { useEffect, useRef, useState, useCallback } from "react";
import { useProject, type Widget } from "../store/projectStore";
import { newWidgetId } from "../store/projectStore";
import { preferNs } from "../store/tagPaths";
import { SYMBOLS } from "@speths-screens/widgets";
import { WidgetRenderer } from "../widgets";
import { setClipboard } from "../hooks/useKeyboardShortcuts";

const COLS  = 12;
const ROW_H = 64;
const GAP   = 8;
const COL_W = 80;

// Module-level drag state — avoids stale closures during drag events.
let widgetDrag: {
  ids: string[];
  anchorId: string;
  ox: number; oy: number;
  origins: Record<string, { x: number; y: number }>;
} | null = null;
let resizeDrag: { id: string; originX: number; originY: number; corner: "br" | "bl" | "tr" | "tl" } | null = null;

function cellFromEvent(grid: HTMLElement, e: React.DragEvent | MouseEvent, zoom: number) {
  const rect = grid.getBoundingClientRect();
  const cw = (COL_W + GAP) * zoom;
  const rh = (ROW_H + GAP) * zoom;
  const col = Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - rect.left) / cw)));
  const row = Math.max(0, Math.floor((e.clientY - rect.top) / rh));
  return { col, row };
}

function pixelFromEvent(grid: HTMLElement, e: React.DragEvent | MouseEvent, zoom: number) {
  const rect = grid.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) / zoom);
  const y = Math.round((e.clientY - rect.top) / zoom);
  return { x, y };
}

// ── Align toolbar ────────────────────────────────────────────────────────────

type AlignAction =
  | "align-left" | "align-right" | "align-top" | "align-bottom"
  | "align-cx" | "align-cy"
  | "dist-h" | "dist-v";

const ALIGN_BUTTONS: { action: AlignAction; title: string; icon: string }[] = [
  { action: "align-left",  title: "Align left edges",         icon: "⬤⠀⠀" },
  { action: "align-cx",    title: "Center horizontally",       icon: "⠀⬤⠀" },
  { action: "align-right", title: "Align right edges",         icon: "⠀⠀⬤" },
  { action: "align-top",   title: "Align top edges",           icon: "▲" },
  { action: "align-cy",    title: "Center vertically",         icon: "◆" },
  { action: "align-bottom",title: "Align bottom edges",        icon: "▼" },
  { action: "dist-h",      title: "Distribute horizontally",   icon: "↔" },
  { action: "dist-v",      title: "Distribute vertically",     icon: "↕" },
];

// Not rendered anywhere yet: wire it in or delete it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AlignToolbar({ widgets, onAlign }: {
  widgets: Widget[];
  onAlign: (action: AlignAction) => void;
}) {
  if (widgets.length < 2) return null;
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800/90 border-b border-zinc-700 shrink-0">
      <span className="text-[10px] text-zinc-500 mr-1">{widgets.length} selected</span>
      {ALIGN_BUTTONS.map(({ action, title, icon }) => (
        <button
          key={action}
          title={title}
          onClick={() => onAlign(action)}
          className="px-2 py-1 text-[11px] rounded hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          {icon}
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-700 mx-1" />
      <span className="text-[10px] text-zinc-500">{title(ALIGN_BUTTONS[0]!)}</span>
    </div>
  );
}

function title(b: { title: string }) { return ""; void b; }

// ── Context menu ─────────────────────────────────────────────────────────────

type CtxMenu = { x: number; y: number; widgetId: string };

function ContextMenu({ menu, onClose, onAction, multiCount }: {
  menu: CtxMenu;
  onClose: () => void;
  onAction: (action: string, widgetId: string) => void;
  multiCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [onClose]);

  const item = (label: string, action: string, danger = false) => (
    <button
      key={action}
      onMouseDown={(e) => { e.preventDefault(); onAction(action, menu.widgetId); onClose(); }}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 ${danger ? "text-red-400" : "text-zinc-200"}`}
    >
      {label}
    </button>
  );

  const { project, activePageId } = useProject.getState();
  const page = project.pages.find(p => p.id === activePageId);
  const w = page?.widgets.find(x => x.id === menu.widgetId);
  const isLocked = w?.locked ?? false;
  const multi = multiCount > 1;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-[170px]"
      style={{ left: menu.x, top: menu.y }}
    >
      {!multi && item(isLocked ? "🔓 Unlock" : "🔒 Lock", "lock")}
      {!multi && <div className="border-t border-zinc-700 my-1" />}
      {!multi && item("Bring to Front", "z-front", false)}
      {!multi && item("Bring Forward", "z-forward", false)}
      {!multi && item("Send Backward", "z-backward", false)}
      {!multi && item("Send to Back", "z-back", false)}
      <div className="border-t border-zinc-700 my-1" />
      {multi && item(`Group ${multiCount} widgets`, "group")}
      {!multi && w?.groupId && item("Ungroup", "ungroup")}
      {(multi || w?.groupId) && <div className="border-t border-zinc-700 my-1" />}
      {item(multi ? `Copy ${multiCount} widgets  Ctrl+C` : "Copy  Ctrl+C", "copy")}
      {!multi && item("Duplicate  Ctrl+D", "duplicate")}
      <div className="border-t border-zinc-700 my-1" />
      {item(multi ? `Delete ${multiCount} widgets` : "Delete", "delete", true)}
    </div>
  );
}

// ── Canvas ───────────────────────────────────────────────────────────────────

export function Canvas() {
  const {
    project, activePageId, selectedWidgetId,
    selectWidget, removeWidget, removeWidgets,
    updateWidget, updateWidgets, addWidget, reorderWidget,
    groupWidgets, ungroupWidgets,
  } = useProject();

  const gridRef  = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom]           = useState(1);
  const [ctxMenu, setCtxMenu]     = useState<CtxMenu | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Rubber-band state (screen coords relative to outerRef)
  const [rubber, setRubber] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const rubberActive = useRef(false);

  const page = project.pages.find((p) => p.id === activePageId);
  const snapMode   = project.canvasSnap ?? "grid";
  const resolution = project.canvasResolution ?? { type: "dynamic" };

  // Keep single-select store in sync with multi-select local state
  useEffect(() => {
    if (selectedIds.length === 1) selectWidget(selectedIds[0]!);
    else selectWidget(null);
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selection when page changes
  useEffect(() => { setSelectedIds([]); }, [activePageId]);

  // Sync incoming selectWidget calls (from Properties etc) back to selectedIds
  useEffect(() => {
    if (selectedWidgetId && !selectedIds.includes(selectedWidgetId))
      setSelectedIds([selectedWidgetId]);
  }, [selectedWidgetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(2.5, parseFloat((z * (e.deltaY > 0 ? 0.9 : 1.11)).toFixed(2)))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Keyboard: Delete, arrow nudge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!page) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        if (selectedIds.length === 1) removeWidget(activePageId, selectedIds[0]!);
        else removeWidgets(activePageId, selectedIds);
        setSelectedIds([]);
        return;
      }

      // Arrow nudge
      const delta: Record<string, { dx: number; dy: number }> = {
        ArrowLeft:  { dx: -1, dy: 0 },
        ArrowRight: { dx:  1, dy: 0 },
        ArrowUp:    { dx: 0, dy: -1 },
        ArrowDown:  { dx: 0, dy:  1 },
      };
      const step = delta[e.key];
      if (step && selectedIds.length > 0) {
        e.preventDefault();
        const { dx, dy } = step;
        updateWidgets(activePageId, selectedIds.map(id => {
          const w = page.widgets.find(x => x.id === id)!;
          return { id, patch: { x: Math.max(0, w.x + dx), y: Math.max(0, w.y + dy) } };
        }));
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(page.widgets.map(w => w.id));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds, activePageId, page, removeWidget, removeWidgets, updateWidgets]);

  // Hooks stay above the early return below: React needs the same hooks in
  // every render, with or without a page.
  const isPixelMode = snapMode === "pixel";

  const onOuterMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rubberActive.current || !outerRef.current) return;
    const rect = outerRef.current.getBoundingClientRect();
    const x1 = e.clientX - rect.left + outerRef.current.scrollLeft;
    const y1 = e.clientY - rect.top  + outerRef.current.scrollTop;
    setRubber(r => r ? { ...r, x1, y1 } : null);
  }, []);

  const onOuterMouseUp = useCallback((e: React.MouseEvent) => {
    if (!rubberActive.current) return;
    rubberActive.current = false;
    setRubber(prev => {
      if (!prev || !page || !gridRef.current || !outerRef.current) return null;
      const { x0, y0, x1, y1 } = prev;
      if (Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4) return null;

      // Convert rubber rect to grid-local coords (accounting for padding)
      const outerRect = outerRef.current.getBoundingClientRect();
      const gridRect  = gridRef.current.getBoundingClientRect();
      const ox = gridRect.left - outerRect.left + outerRef.current.scrollLeft;
      const oy = gridRect.top  - outerRect.top  + outerRef.current.scrollTop;

      const rx0 = (Math.min(x0, x1) - ox) / zoom;
      const ry0 = (Math.min(y0, y1) - oy) / zoom;
      const rx1 = (Math.max(x0, x1) - ox) / zoom;
      const ry1 = (Math.max(y0, y1) - oy) / zoom;

      const hit = page.widgets
        .filter(w => {
          const wx0 = isPixelMode ? w.x : (w.x ?? 0) * (COL_W + GAP);
          const wy0 = isPixelMode ? w.y : (w.y ?? 0) * (ROW_H + GAP);
          const wx1 = isPixelMode ? w.x + w.w : wx0 + w.w * (COL_W + GAP);
          const wy1 = isPixelMode ? w.y + w.h : wy0 + w.h * (ROW_H + GAP);
          return wx1 > rx0 && wx0 < rx1 && wy1 > ry0 && wy0 < ry1;
        })
        .filter(w => !w.locked)
        .map(w => w.id);

      if (hit.length > 0) {
        setSelectedIds(e.shiftKey ? ids => [...new Set([...ids, ...hit])] : hit);
      } else if (!e.shiftKey) {
        setSelectedIds([]);
      }
      return null;
    });
  }, [page, zoom, isPixelMode]);

  if (!page) return <div className="p-6 text-zinc-500">No page selected.</div>;

  const eColW = COL_W * zoom;
  const eRowH = ROW_H * zoom;
  const isFixed = resolution.type === "fixed";
  const canvasW = resolution.type === "fixed" ? (resolution.width ?? 1920) * zoom : undefined;
  const canvasH = resolution.type === "fixed" ? (resolution.height ?? 1080) * zoom : undefined;
  const gridW = COLS * (eColW + GAP) - GAP;

  // ── Rubber-band mouse handlers ────────────────────────────────────────────

  const onOuterMouseDown = (e: React.MouseEvent) => {
    // Only start rubber band on the grid background (not on a widget)
    if (e.target !== gridRef.current) return;
    if (e.button !== 0) return;
    const rect = outerRef.current!.getBoundingClientRect();
    const x0 = e.clientX - rect.left + outerRef.current!.scrollLeft;
    const y0 = e.clientY - rect.top  + outerRef.current!.scrollTop;
    rubberActive.current = true;
    setRubber({ x0, y0, x1: x0, y1: y0 });
  };


  // ── Align actions ─────────────────────────────────────────────────────────

  const handleAlign = (action: AlignAction) => {
    if (selectedIds.length < 2) return;
    const ws = page.widgets.filter(w => selectedIds.includes(w.id));

    const patches: { id: string; patch: Partial<Widget> }[] = [];

    if (action === "align-left") {
      const minX = Math.min(...ws.map(w => w.x));
      ws.forEach(w => patches.push({ id: w.id, patch: { x: minX } }));
    } else if (action === "align-right") {
      const maxR = Math.max(...ws.map(w => w.x + w.w));
      ws.forEach(w => patches.push({ id: w.id, patch: { x: maxR - w.w } }));
    } else if (action === "align-top") {
      const minY = Math.min(...ws.map(w => w.y));
      ws.forEach(w => patches.push({ id: w.id, patch: { y: minY } }));
    } else if (action === "align-bottom") {
      const maxB = Math.max(...ws.map(w => w.y + w.h));
      ws.forEach(w => patches.push({ id: w.id, patch: { y: maxB - w.h } }));
    } else if (action === "align-cx") {
      const minX = Math.min(...ws.map(w => w.x));
      const maxR = Math.max(...ws.map(w => w.x + w.w));
      const cx = (minX + maxR) / 2;
      ws.forEach(w => patches.push({ id: w.id, patch: { x: Math.round(cx - w.w / 2) } }));
    } else if (action === "align-cy") {
      const minY = Math.min(...ws.map(w => w.y));
      const maxB = Math.max(...ws.map(w => w.y + w.h));
      const cy = (minY + maxB) / 2;
      ws.forEach(w => patches.push({ id: w.id, patch: { y: Math.round(cy - w.h / 2) } }));
    } else if (action === "dist-h") {
      const sorted = [...ws].sort((a, b) => a.x - b.x);
      const first  = sorted[0]!, last = sorted[sorted.length - 1]!;
      const totalW = sorted.reduce((s, w) => s + w.w, 0);
      const span   = last.x + last.w - first.x;
      const gap    = (span - totalW) / (sorted.length - 1);
      let cur = first.x;
      sorted.forEach(w => { patches.push({ id: w.id, patch: { x: Math.round(cur) } }); cur += w.w + gap; });
    } else if (action === "dist-v") {
      const sorted = [...ws].sort((a, b) => a.y - b.y);
      const first  = sorted[0]!, last = sorted[sorted.length - 1]!;
      const totalH = sorted.reduce((s, w) => s + w.h, 0);
      const span   = last.y + last.h - first.y;
      const gap    = (span - totalH) / (sorted.length - 1);
      let cur = first.y;
      sorted.forEach(w => { patches.push({ id: w.id, patch: { y: Math.round(cur) } }); cur += w.h + gap; });
    }

    if (patches.length) updateWidgets(activePageId, patches);
  };

  // ── Drop handler ──────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes("text/x-widget-id") || types.includes("text/x-tag-binding") ||
        types.includes("text/x-resize")    || types.includes("text/x-image-id")    ||
        types.includes("text/x-symbol-id"))
      e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const { col, row } = cellFromEvent(gridRef.current, e, zoom);
    const { x: pxX, y: pxY } = pixelFromEvent(gridRef.current, e, zoom);
    const isPixel = snapMode === "pixel";

    const tagBinding = e.dataTransfer.getData("text/x-tag-binding");
    if (tagBinding) {
      const target = isPixel
        ? page.widgets.find(w => pxX >= w.x && pxX < w.x + w.w && pxY >= w.y && pxY < w.y + w.h)
        : page.widgets.find(w => col >= (w.x ?? 0) && col < (w.x ?? 0) + w.w && row >= (w.y ?? 0) && row < (w.y ?? 0) + w.h);
      if (target) updateWidget(activePageId, target.id, { bindings: { ...target.bindings, value: preferNs(project, tagBinding) } });
      return;
    }

    const symbolId = e.dataTransfer.getData("text/x-symbol-id");
    if (symbolId) {
      const sym = SYMBOLS.find(s => s.id === symbolId);
      const id = newWidgetId();
      addWidget(activePageId, {
        id, type: "symbol",
        x: isPixel ? Math.max(0, pxX) : Math.max(0, col),
        y: isPixel ? Math.max(0, pxY) : Math.max(0, row),
        w: isPixel ? 160 : 3, h: isPixel ? 160 : 3,
        props: { symbolId, label: sym?.name ?? symbolId, stroke: "#d4d4d8" },
      });
      setSelectedIds([id]);
      return;
    }

    const imageId = e.dataTransfer.getData("text/x-image-id");
    if (imageId) {
      const img = useProject.getState().project.images?.find(i => i.id === imageId);
      const id = newWidgetId();
      addWidget(activePageId, {
        id, type: "image",
        x: isPixel ? Math.max(0, pxX) : Math.max(0, col),
        y: isPixel ? Math.max(0, pxY) : Math.max(0, row),
        w: isPixel ? 240 : 4, h: isPixel ? 180 : 3,
        props: { src: `lib:${imageId}`, label: img?.name ?? "Image", fit: "contain" },
      });
      setSelectedIds([id]);
      return;
    }

    if (resizeDrag) {
      const w = page.widgets.find(x => x.id === resizeDrag!.id);
      if (w) {
        const { corner, originX, originY } = resizeDrag;
        let nx = w.x, ny = w.y, nw = w.w, nh = w.h;
        if (isPixel) {
          const minSz = 20;
          if (corner === "br") { nw = Math.max(minSz, pxX - originX); nh = Math.max(minSz, pxY - originY); }
          else if (corner === "bl") { const nx2 = Math.min(pxX, originX + w.w - minSz); nw = Math.max(minSz, originX + w.w - nx2); nx = nx2; nh = Math.max(minSz, pxY - originY); }
          else if (corner === "tr") { nw = Math.max(minSz, pxX - originX); const ny2 = Math.min(pxY, originY + w.h - minSz); nh = Math.max(minSz, originY + w.h - ny2); ny = ny2; }
          else { const nx2 = Math.min(pxX, originX + w.w - minSz); nw = Math.max(minSz, originX + w.w - nx2); nx = nx2; const ny2 = Math.min(pxY, originY + w.h - minSz); nh = Math.max(minSz, originY + w.h - ny2); ny = ny2; }
        } else {
          if (corner === "br") { nw = Math.max(1, col - originX + 1); nh = Math.max(1, row - originY + 1); }
          else if (corner === "bl") { const nx2 = Math.min(col, originX + w.w - 1); nw = Math.max(1, originX + w.w - nx2); nx = nx2; nh = Math.max(1, row - originY + 1); }
          else if (corner === "tr") { nw = Math.max(1, col - originX + 1); const ny2 = Math.min(row, originY + w.h - 1); nh = Math.max(1, originY + w.h - ny2); ny = ny2; }
          else { const nx2 = Math.min(col, originX + w.w - 1); nw = Math.max(1, originX + w.w - nx2); nx = nx2; const ny2 = Math.min(row, originY + w.h - 1); nh = Math.max(1, originY + w.h - ny2); ny = ny2; }
          nx = Math.max(0, Math.min(COLS - nw, nx));
          nw = Math.min(COLS, nw);
        }
        updateWidget(activePageId, resizeDrag.id, { x: Math.max(0, nx), y: Math.max(0, ny), w: nw, h: Math.max(isPixel ? 20 : 1, nh) });
      }
      resizeDrag = null;
      return;
    }

    if (widgetDrag) {
      const { ids, anchorId, ox, oy, origins } = widgetDrag;
      const anchor = page.widgets.find(x => x.id === anchorId);
      if (anchor) {
        const newAnchorX = isPixel
          ? Math.max(0, pxX - ox)
          : Math.max(0, Math.min(COLS - anchor.w, col - ox));
        const newAnchorY = isPixel
          ? Math.max(0, pxY - oy)
          : Math.max(0, row - oy);
        const dx = newAnchorX - origins[anchorId]!.x;
        const dy = newAnchorY - origins[anchorId]!.y;

        if (ids.length === 1) {
          updateWidget(activePageId, anchorId, { x: newAnchorX, y: newAnchorY });
        } else {
          updateWidgets(activePageId, ids.map(id => {
            const orig = origins[id]!;
            return { id, patch: { x: Math.max(0, orig.x + dx), y: Math.max(0, orig.y + dy) } };
          }));
        }
      }
      widgetDrag = null;
    }
  };

  // ── Context menu actions ──────────────────────────────────────────────────

  const handleCtxAction = (action: string, widgetId: string) => {
    const w = page.widgets.find(x => x.id === widgetId);
    if (!w) return;

    if (action === "lock") {
      updateWidget(activePageId, widgetId, { locked: !w.locked });
    }
    if (action === "copy") {
      if (selectedIds.length > 1) {
        const ws = page.widgets.filter(x => selectedIds.includes(x.id));
        setClipboard(ws.length === 1 ? ws[0]! : ws);
      } else {
        setClipboard(w);
      }
    }
    if (action === "duplicate") {
      if (selectedIds.length > 1) {
        const nextY = page.widgets.reduce((m, wg) => Math.max(m, wg.y + wg.h), 0);
        const ws = page.widgets.filter(x => selectedIds.includes(x.id));
        const newIds: string[] = [];
        ws.forEach(ww => { const id = newWidgetId(); newIds.push(id); addWidget(activePageId, { ...ww, id, y: nextY }); });
        setSelectedIds(newIds);
      } else {
        const nextY = page.widgets.reduce((m, wg) => Math.max(m, wg.y + wg.h), 0);
        const id = newWidgetId();
        addWidget(activePageId, { ...w, id, y: nextY });
        setSelectedIds([id]);
      }
    }
    if (action === "z-front")    reorderWidget(activePageId, widgetId, "front");
    if (action === "z-back")     reorderWidget(activePageId, widgetId, "back");
    if (action === "z-forward")  reorderWidget(activePageId, widgetId, "forward");
    if (action === "z-backward") reorderWidget(activePageId, widgetId, "backward");

    if (action === "group" && selectedIds.length > 1) {
      groupWidgets(activePageId, selectedIds);
    }
    if (action === "ungroup" && w.groupId) {
      ungroupWidgets(activePageId, w.groupId);
    }

    if (action === "delete") {
      if (selectedIds.length > 1) {
        removeWidgets(activePageId, selectedIds);
        setSelectedIds([]);
      } else {
        removeWidget(activePageId, widgetId);
        setSelectedIds([]);
      }
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const pageBg = page.backgroundColor ?? "";
  const gridBg = isPixelMode
    ? { backgroundColor: pageBg || undefined, backgroundImage: `radial-gradient(circle, #3f3f4644 1px, transparent 1px)`, backgroundSize: `${16 * zoom}px ${16 * zoom}px` }
    : { backgroundColor: pageBg || undefined, backgroundImage: `radial-gradient(circle, #3f3f4644 1px, transparent 1px)`, backgroundSize: `${eColW + GAP}px ${eRowH + GAP}px`, backgroundPosition: `${GAP / 2}px ${GAP / 2}px` };


  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Align toolbar */}
      {selectedIds.length >= 2 && (
        <div className="flex items-center gap-0.5 px-3 py-1 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <span className="text-[10px] text-zinc-500 mr-2">{selectedIds.length} selected</span>
          {ALIGN_BUTTONS.map(({ action, title, icon }) => (
            <button
              key={action}
              title={title}
              onClick={() => handleAlign(action as AlignAction)}
              className="px-2 py-0.5 text-xs rounded hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors font-mono"
            >
              {icon}
            </button>
          ))}
          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <button
            title="Deselect all  (Esc)"
            onClick={() => setSelectedIds([])}
            className="px-2 py-0.5 text-[10px] rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
          >
            esc
          </button>
        </div>
      )}

      <div
        ref={outerRef}
        className="flex-1 overflow-auto p-6 bg-zinc-950 select-none relative"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onMouseDown={onOuterMouseDown}
        onMouseMove={onOuterMouseMove}
        onMouseUp={onOuterMouseUp}
      >
        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="fixed bottom-8 right-8 z-40 bg-zinc-800 border border-zinc-600 rounded-full px-3 py-1 text-[11px] text-zinc-400 font-mono flex items-center gap-2 shadow-lg">
            {Math.round(zoom * 100)}%
            <button onClick={() => setZoom(1)} className="text-zinc-500 hover:text-zinc-200">↺</button>
          </div>
        )}

        {/* Rubber-band rect */}
        {rubber && (
          <div
            className="absolute pointer-events-none border border-blue-400 bg-blue-400/10 z-50"
            style={{
              left:   Math.min(rubber.x0, rubber.x1),
              top:    Math.min(rubber.y0, rubber.y1),
              width:  Math.abs(rubber.x1 - rubber.x0),
              height: Math.abs(rubber.y1 - rubber.y0),
            }}
          />
        )}

        {isFixed && (
          <div
            className="absolute pointer-events-none border border-dashed border-zinc-600/40 z-0"
            style={{ width: canvasW, height: canvasH, top: 24, left: 24 }}
          />
        )}

        <div
          ref={gridRef}
          className={isPixelMode ? "relative" : "grid relative"}
          style={{
            ...(isPixelMode ? {
              width:  canvasW ?? "100%",
              height: canvasH ?? "100%",
              minHeight: isFixed ? undefined : "600px",
              ...gridBg,
            } : {
              gap: `${GAP}px`,
              gridTemplateColumns: `repeat(${COLS}, ${eColW}px)`,
              gridAutoRows: `${eRowH}px`,
              width: isFixed ? canvasW : gridW,
              height: isFixed ? canvasH : undefined,
              ...gridBg,
            }),
          }}
          onClick={() => { setSelectedIds([]); setCtxMenu(null); }}
        >
          {page.widgets.map((w) => {
            const selected = selectedIds.includes(w.id);
            const locked   = w.locked ?? false;

            const onDragStart = (e: React.DragEvent) => {
              if (locked) { e.preventDefault(); return; }
              const tag = (e.target as HTMLElement).tagName;
              if (tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA") { e.preventDefault(); return; }
              if (!gridRef.current) return;

              // Build the drag group
              const ids = selected && selectedIds.length > 1 ? selectedIds : [w.id];
              const origins: Record<string, { x: number; y: number }> = {};
              ids.forEach(id => {
                const ww = page.widgets.find(x => x.id === id);
                if (ww) origins[id] = { x: ww.x ?? 0, y: ww.y ?? 0 };
              });

              if (isPixelMode) {
                const { x: px, y: py } = pixelFromEvent(gridRef.current, e, zoom);
                widgetDrag = { ids, anchorId: w.id, ox: px - (w.x ?? 0), oy: py - (w.y ?? 0), origins };
              } else {
                const { col, row } = cellFromEvent(gridRef.current, e, zoom);
                widgetDrag = { ids, anchorId: w.id, ox: col - (w.x ?? 0), oy: row - (w.y ?? 0), origins };
              }
              e.dataTransfer.setData("text/x-widget-id", w.id);
              e.dataTransfer.effectAllowed = "move";
            };

            const onContextMenu = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selected) setSelectedIds([w.id]);
              setCtxMenu({ x: e.clientX, y: e.clientY, widgetId: w.id });
            };

            const onClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              setCtxMenu(null);
              // If widget belongs to a group, select all group members together
              const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
              if (w.groupId && !isAdditive) {
                const groupIds = page.widgets.filter(x => x.groupId === w.groupId).map(x => x.id);
                setSelectedIds(groupIds);
              } else if (isAdditive) {
                setSelectedIds(ids =>
                  ids.includes(w.id) ? ids.filter(id => id !== w.id) : [...ids, w.id]
                );
              } else {
                setSelectedIds([w.id]);
              }
            };

            const widgetStyle = isPixelMode
              ? {
                  position: "absolute" as const,
                  left:   (w.x ?? 0) * zoom,
                  top:    (w.y ?? 0) * zoom,
                  width:  w.w * zoom,
                  height: w.h * zoom,
                  cursor: locked ? "default" : "grab",
                }
              : {
                  gridColumn: `${(w.x ?? 0) + 1} / span ${w.w}`,
                  gridRow:    `${(w.y ?? 0) + 1} / span ${w.h}`,
                  cursor: locked ? "default" : "grab",
                };

            return (
              <div
                key={w.id}
                draggable={!locked}
                onDragStart={onDragStart}
                onClick={onClick}
                onContextMenu={onContextMenu}
                className={`group relative rounded-lg ${
                  selected
                    ? selectedIds.length > 1
                      ? "ring-2 ring-violet-400"
                      : "ring-2 ring-blue-500"
                    : "ring-1 ring-transparent hover:ring-zinc-700"
                } ${locked ? "ring-amber-700/60" : ""}`}
                style={widgetStyle}
              >
                <WidgetRenderer w={w} />

                {locked && (
                  <div className="absolute top-1 right-1 text-[9px] text-amber-500 pointer-events-none z-10">🔒</div>
                )}

                {selected && selectedIds.length === 1 && !locked && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeWidget(page.id, w.id); setSelectedIds([]); }}
                      className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 z-10"
                      style={{ cursor: "default" }}
                    >×</button>
                    {(["br","bl","tr","tl"] as const).map((corner) => (
                      <div
                        key={corner}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          if (!gridRef.current) return;
                          resizeDrag = { id: w.id, originX: w.x ?? 0, originY: w.y ?? 0, corner };
                          e.dataTransfer.setData("text/x-resize", w.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="absolute w-3 h-3 bg-blue-500 rounded-full z-20 border-2 border-zinc-900 hover:bg-blue-400"
                        style={{
                          cursor: corner === "br" || corner === "tl" ? "nwse-resize" : "nesw-resize",
                          bottom: corner.startsWith("b") ? -4 : undefined,
                          top:    corner.startsWith("t") ? -4 : undefined,
                          right:  corner.endsWith("r")   ? -4 : undefined,
                          left:   corner.endsWith("l")   ? -4 : undefined,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                  </>
                )}

                {w.bindings?.value && (
                  <div className="absolute bottom-0 left-0 right-0 text-[9px] font-mono text-zinc-500 px-1.5 truncate pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    {w.bindings.value}
                  </div>
                )}
              </div>
            );
          })}

          {/* Group bounding-box overlays */}
          {(() => {
            const groupIds = [...new Set(
              page.widgets
                .filter(w => w.groupId && selectedIds.includes(w.id))
                .map(w => w.groupId!)
            )];
            return groupIds.map(gid => {
              const members = page.widgets.filter(w => w.groupId === gid);
              if (!members.length) return null;
              const toLeft  = (w: Widget) => isPixelMode ? (w.x ?? 0) * zoom : (w.x ?? 0) * (eColW + GAP);
              const toTop   = (w: Widget) => isPixelMode ? (w.y ?? 0) * zoom : (w.y ?? 0) * (eRowH + GAP);
              const toRight = (w: Widget) => isPixelMode ? toLeft(w) + w.w * zoom : toLeft(w) + w.w * (eColW + GAP) - GAP;
              const toBot   = (w: Widget) => isPixelMode ? toTop(w) + w.h * zoom : toTop(w) + w.h * (eRowH + GAP) - GAP;
              const pad = 6;
              const x0 = Math.min(...members.map(toLeft))  - pad;
              const y0 = Math.min(...members.map(toTop))   - pad;
              const x1 = Math.max(...members.map(toRight)) + pad;
              const y1 = Math.max(...members.map(toBot))   + pad;
              return (
                <div
                  key={gid}
                  className="absolute pointer-events-none rounded-lg border-2 border-dashed border-violet-500/60 z-30"
                  style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}
                >
                  <span className="absolute -top-4 left-1 text-[9px] text-violet-400/80 select-none font-mono">
                    group
                  </span>
                </div>
              );
            });
          })()}

          {page.widgets.length === 0 && (
            <div className={`flex items-center justify-center text-zinc-600 italic text-sm ${isPixelMode ? "absolute inset-0" : "col-span-full row-span-2"}`}>
              Add widgets from the palette ← · drag tags from the browser → to bind
            </div>
          )}
        </div>

        {ctxMenu && (
          <ContextMenu
            menu={ctxMenu}
            onClose={() => setCtxMenu(null)}
            onAction={handleCtxAction}
            multiCount={selectedIds.length}
          />
        )}
      </div>
    </div>
  );
}

export function PositionEditor({ pageId, widgetId }: { pageId: string; widgetId: string }) {
  const { project, updateWidget } = useProject();
  const page = project.pages.find((p) => p.id === pageId);
  const w = page?.widgets.find((x) => x.id === widgetId);
  if (!w) return null;

  const num = (k: "x" | "y" | "w" | "h") => (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-4 text-zinc-500 uppercase">{k}</span>
      <input
        type="number"
        value={w[k]}
        min={k === "x" || k === "y" ? 0 : 1}
        onChange={(e) => updateWidget(pageId, widgetId, { [k]: Number(e.target.value) })}
        className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5"
      />
    </label>
  );

  return <div className="grid grid-cols-2 gap-1.5">{num("x")}{num("y")}{num("w")}{num("h")}</div>;
}
