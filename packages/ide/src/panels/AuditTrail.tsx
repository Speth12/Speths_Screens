import { useState } from "react";
import { useAuditTrail, clearAudit } from "../store/auditTrail";

const TYPE_COLORS: Record<string, string> = {
  "alarm:triggered": "bg-red-900/60 text-red-300",
  "alarm:cleared":   "bg-emerald-900/60 text-emerald-300",
  "recipe:applied":  "bg-blue-900/60 text-blue-300",
  "page:changed":    "bg-zinc-700 text-zinc-300",
  "tag:written":     "bg-violet-900/60 text-violet-300",
  "script:error":    "bg-amber-900/60 text-amber-300",
};

function typeBadge(type: string) {
  const cls = TYPE_COLORS[type] ?? "bg-zinc-800 text-zinc-400";
  const short = type.includes(":") ? type.split(":").slice(-1)[0] : type;
  return (
    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${cls}`}>
      {short}
    </span>
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

const ALL_TYPES = [
  "alarm:triggered", "alarm:cleared", "recipe:applied",
  "page:changed", "tag:written", "script:error",
];

export function AuditTrail() {
  const entries = useAuditTrail();
  const [filter, setFilter] = useState<string>("all");

  const visible = filter === "all"
    ? entries
    : entries.filter((e) => e.type === filter);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2 flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Filter</div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-[10px] focus:outline-none"
        >
          <option value="all">All ({entries.length})</option>
          {ALL_TYPES.map((t) => {
            const count = entries.filter((e) => e.type === t).length;
            return <option key={t} value={t}>{t} ({count})</option>;
          })}
        </select>
        <button
          onClick={clearAudit}
          className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {visible.length === 0 && (
          <div className="p-3 text-[11px] text-zinc-600 italic">No events yet.</div>
        )}
        {visible.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-2 px-3 py-1.5 border-b border-zinc-800/50 hover:bg-zinc-800/30"
          >
            <span className="shrink-0 text-[10px] font-mono text-zinc-600 w-16 mt-0.5">
              {fmtTime(entry.ts)}
            </span>
            {typeBadge(entry.type)}
            <span className="text-[11px] text-zinc-300 flex-1 break-words leading-tight mt-0.5">
              {entry.summary}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
