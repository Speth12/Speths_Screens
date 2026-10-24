// Tag binding input with ns: suggestions, and a live preview of a tag's value.
import { useEffect, useRef, useState } from "react";
import { useProject } from "../store/projectStore";
import { useTag } from "../hooks/useTag";

const qualityColor: Record<string, string> = {
  Good: "text-emerald-400", Bad: "text-red-400", Uncertain: "text-amber-400",
  Unknown: "text-zinc-600", Write: "text-purple-400",
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? `${v}` : v.toFixed(3);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
};

// ── Binding input with ns: autocomplete ──────────────────────────────────────

export function BindingInput({
  value,
  onChange,
  placeholder = "ds:tagPath",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { project } = useProject();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const nsNodes = project.namespace ?? [];

  // Filter namespace suggestions when user has typed "ns:"
  const suggestions = (() => {
    if (!value.startsWith("ns:")) return [];
    const query = value.slice(3).toLowerCase();
    return nsNodes
      .filter((n) => (n.type === "tag" || n.type === "virtual") && n.path.toLowerCase().includes(query))
      .slice(0, 12);
  })();

  const showDrop = open && suggestions.length > 0;

  // Close on outside click
  useEffect(() => {
    if (!showDrop) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDrop]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {showDrop && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {suggestions.map((n) => (
            <button
              key={n.path}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(`ns:${n.path}`);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-700 flex items-center gap-2 min-w-0"
            >
              <span className="text-emerald-400 text-[10px] shrink-0">◆</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-zinc-100 font-mono truncate">{n.path}</div>
                {(n.driverId || n.description) && (
                  <div className="text-[9px] text-zinc-500 truncate">
                    {n.driverId && <span className="font-mono">{n.driverId}:{n.driverAddr}</span>}
                    {n.description && <span className="ml-1">{n.description}</span>}
                  </div>
                )}
              </div>
              {n.unit && <span className="text-[9px] text-zinc-600 shrink-0">{n.unit}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LiveTagPreview({ binding }: { binding?: string }) {
  const t = useTag(binding);
  if (!binding) return null;
  return (
    <div className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded bg-zinc-950/60 border border-zinc-800">
      <span className="text-xs font-mono font-semibold text-zinc-200">{fmt(t.value)}</span>
      <span className={`text-[10px] ml-auto ${qualityColor[t.quality] ?? "text-zinc-600"}`}>{t.quality}</span>
    </div>
  );
}
