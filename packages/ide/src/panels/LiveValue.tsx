// A tag's live value as a short piece of text with its quality, for lists and forms that show what
// a name reads right now. Only what is on screen subscribes, so only it makes the runtime poll.
import { useTag } from "../hooks/useTag";

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v.length > 18 ? `${v.slice(0, 18)}…` : v;
  return JSON.stringify(v).slice(0, 20);
}

const DOT: Record<string, string> = { Good: "bg-emerald-500", Bad: "bg-red-500", Uncertain: "bg-amber-500" };

/** The value of `path` (a tag as a binding writes it: `ns:…` or `datasource:path`). Blank for no path. */
export function LiveValue({ path, className = "" }: { path: string | undefined; className?: string }) {
  const t = useTag(path || undefined);
  if (!path) return null;
  const quality = t.quality === "Unknown" ? "no value yet" : t.quality;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono tabular-nums ${className}`} title={t.reason ? `${quality}: ${t.reason}` : quality}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${DOT[t.quality] ?? "bg-zinc-600"}`} />
      <span>{formatValue(t.value)}</span>
      <span className="sr-only">{quality}</span>
    </span>
  );
}
