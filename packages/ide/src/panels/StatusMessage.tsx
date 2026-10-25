// A one-line status message that can be read in full: the whole text on
// hover, and a click opens it as a list (upgrade notes and validation
// problems are joined with "; ").
import { useEffect, useRef, useState } from "react";

/** The message's parts: "summary: a; b" or "summary (n changes: a; b)" give [summary, a, b]. */
export function messageParts(text: string): string[] {
  const m = text.match(/^(.*?)(?: \(\d+ changes?: |: )(.*?)\)?$/s);
  if (!m || !m[2]!.includes("; ")) return [text];
  return [m[1]!, ...m[2]!.split("; ")];
}

export function StatusMessage({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parts = messageParts(text);
  const long = parts.length > 1;

  useEffect(() => setOpen(false), [text]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => long && setOpen((o) => !o)}
        title={text}
        className={`block w-full text-left truncate ${long ? "cursor-pointer underline decoration-dotted underline-offset-2" : "cursor-default"}`}
      >
        {long ? `${parts[0]} (${parts.length - 1})` : text}
      </button>
      {open && (
        <div role="dialog" aria-label="Message details"
          className="absolute right-0 top-full mt-1 z-50 w-[420px] max-h-80 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl p-3 text-[11px] text-zinc-300">
          <div className="font-semibold text-zinc-200 mb-1.5">{parts[0]}</div>
          <ul className="space-y-1 list-disc pl-4">
            {parts.slice(1).map((p, i) => <li key={i} className="break-words">{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
