// Popups: a custom widget shown in a window over the page, opened by a widget's Open popup action
// (a pump's faceplate from a click on the pump) and closed with its X, a click outside it, Escape,
// or a Close popup action inside it. One popup is open at a time; opening another replaces it.
// The screens (the operator, the IDE preview) put a PopupLayer around what they draw; where there
// is none (the IDE canvas) the actions do nothing.
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Widget } from "@speths-screens/shared-types";
import { useHost } from "./host";

export type PopupSpec = {
  customWidgetId: string;
  params?: Record<string, string>;
  title?: string;
  width?: number;
  height?: number;
  position?: "center" | "widget";
  /** The opening widget's place on the screen, for position "widget". */
  anchor?: { left: number; top: number; right: number; bottom: number };
};

type Popups = { open: (spec: PopupSpec) => void; close: () => void };
const PopupContext = createContext<Popups | null>(null);

/** Opens and closes the popup; null where no screen shows popups. */
export const usePopups = () => useContext(PopupContext);

const TITLE_H = 36, MARGIN = 8, FALLBACK = { width: 480, height: 320 };

/** Where the window goes: centered, or under the widget that opened it (above it when there is no
 *  room below), always inside the screen. */
export function popupBox(spec: Pick<PopupSpec, "position" | "anchor">, size: { width: number; height: number }, screen: { width: number; height: number }) {
  const w = Math.min(size.width, screen.width - 2 * MARGIN);
  const h = Math.min(size.height + TITLE_H, screen.height - 2 * MARGIN);
  let left = (screen.width - w) / 2, top = (screen.height - h) / 2;
  if (spec.position === "widget" && spec.anchor) {
    left = spec.anchor.left;
    top = spec.anchor.bottom + MARGIN;
    if (top + h > screen.height - MARGIN) top = spec.anchor.top - MARGIN - h;
  }
  const clamp = (v: number, max: number) => Math.round(Math.max(MARGIN, Math.min(v, max)));
  return { left: clamp(left, screen.width - w - MARGIN), top: clamp(top, screen.height - h - MARGIN), width: Math.round(w), height: Math.round(h) };
}

/** Holds the open popup for everything drawn inside it, and draws the popup. */
export function PopupLayer({ children, render, theme }: {
  children: ReactNode;
  render: (w: Widget) => ReactNode;
  /** The screen's theme variables, where the page around the popup is not the document's (the IDE preview). */
  theme?: React.CSSProperties;
}) {
  const [spec, setSpec] = useState<PopupSpec | null>(null);
  const close = useCallback(() => setSpec(null), []);
  const value = useMemo<Popups>(() => ({ open: setSpec, close }), [close]);
  return (
    <PopupContext.Provider value={value}>
      {children}
      {spec && <PopupWindow spec={spec} onClose={close} render={render} theme={theme} />}
    </PopupContext.Provider>
  );
}

function PopupWindow({ spec, onClose, render, theme }: { spec: PopupSpec; onClose: () => void; render: (w: Widget) => ReactNode; theme?: React.CSSProperties }) {
  const host = useHost();
  const cw = host.useCustomWidget(spec.customWidgetId);
  const t = host.useTranslate();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const size = {
    width: spec.width ?? cw?.width ?? FALLBACK.width,
    height: spec.height ?? cw?.height ?? FALLBACK.height,
  };
  const screen = typeof window === "undefined" ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
  const box = popupBox(spec, size, screen);
  const title = t(spec.title ?? cw?.name ?? "");
  const content = {
    id: `popup-${spec.customWidgetId}`, type: "customWidget", x: 0, y: 0, w: size.width, h: size.height,
    props: { customWidgetId: spec.customWidgetId, params: spec.params, noPadding: true, bgColor: "transparent", borderColor: "none" },
  } as unknown as Widget;
  return createPortal(
    <div data-testid="popup-backdrop" className="fixed inset-0 z-[60]" style={{ ...theme, background: "rgba(0,0,0,.35)" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title || "Popup"} data-testid="popup"
        className="fixed flex flex-col overflow-hidden"
        style={{
          ...box, background: "var(--card)", color: "var(--card-foreground)",
          border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius, 0.5rem)",
          boxShadow: "var(--shadow, 0 12px 32px rgba(0,0,0,.3))", fontFamily: "var(--font-sans, inherit)",
        }}>
        <div className="flex items-center gap-2 px-3 shrink-0" style={{ height: TITLE_H, borderBottom: "var(--line-width, 1px) solid var(--border)" }}>
          <span className="flex-1 truncate text-sm font-semibold">{title}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-lg leading-none"
            style={{ color: "var(--muted-foreground)" }}>×</button>
        </div>
        <div className="flex-1 min-h-0">{cw ? render(content) : <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No custom widget with id {spec.customWidgetId}</div>}</div>
      </div>
    </div>,
    document.body,
  );
}
