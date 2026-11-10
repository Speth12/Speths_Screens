// The IDE's one modal dialog: a title, a body and a row of actions. It is announced as a dialog,
// keeps keyboard focus inside while open, closes on Esc or a click outside, and hands focus back
// to whatever opened it.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FOCUS_RING } from "./Button";

const WIDTH = { sm: "w-80", md: "w-[28rem]", lg: "w-[40rem]", xl: "w-[56rem]" } as const;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogProps = {
  title: string;
  onClose: () => void;
  size?: keyof typeof WIDTH;
  /** The action buttons, drawn right-aligned under the body. */
  footer?: ReactNode;
  /** False for a dialog whose work would be lost by a stray click outside it. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

export function Dialog({ title, onClose, size = "md", footer, closeOnBackdrop = true, children }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose without re-running the focus effect when a parent re-renders.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    // A control with autoFocus already has the focus. Otherwise the first control of the body
    // gets it, not the close button; a dialog with no controls takes it itself.
    if (el && !el.contains(document.activeElement)) {
      const first = el.querySelector("[data-dialog-body]")?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }
    return () => { opener?.focus?.(); };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close.current(); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
        className={`${WIDTH[size]} max-w-full max-h-full flex flex-col rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl outline-none`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-700 shrink-0">
          <h2 id={titleId} className="text-ui-title font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className={`h-6 w-6 inline-flex items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${FOCUS_RING}`}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", fill: "none" }}>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>
        <div data-dialog-body className="px-4 py-3 overflow-auto min-h-0 text-ui">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-700 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
