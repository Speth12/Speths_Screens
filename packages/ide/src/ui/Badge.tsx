// Small labels: a Badge for a count or a state, and the heading of a section of a panel.
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

// A state never rests on color alone: the text says it too.
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
  info: "bg-blue-950 text-zinc-100 border-blue-500",
  success: "bg-zinc-800 text-zinc-100 border-emerald-500",
  warning: "bg-zinc-800 text-zinc-100 border-amber-500",
  danger: "bg-zinc-800 text-zinc-100 border-red-500",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded border text-ui-label font-medium whitespace-nowrap ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

type SectionHeaderProps = {
  title: string;
  /** A number beside the title (how many pages, alarms and so on). */
  count?: number;
  /** Controls at the right: an Add button, a filter. */
  actions?: ReactNode;
  className?: string;
};

/** The heading of a section of a side panel or a tab. */
export function SectionHeader({ title, count, actions, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center gap-2 min-h-7 ${className}`}>
      <h3 className="text-ui-label font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      {count !== undefined && <Badge>{count}</Badge>}
      <div className="flex-1" />
      {actions}
    </div>
  );
}
