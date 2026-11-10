// A short label shown beside a control on hover or keyboard focus. It names the control; it never
// holds something a person has to read to use the editor.
import { useId, useState, type ReactNode } from "react";

export function Tooltip({ text, side = "bottom", children }: { text: string; side?: "top" | "bottom"; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)} onBlur={() => setShow(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setShow(false); }}>
      {children}
      {show && (
        <span role="tooltip" id={id}
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-[60] whitespace-nowrap rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-ui-label text-zinc-100 shadow-lg ${side === "bottom" ? "top-full mt-1" : "bottom-full mb-1"}`}>
          {text}
        </span>
      )}
    </span>
  );
}
