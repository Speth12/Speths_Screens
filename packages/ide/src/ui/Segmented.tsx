// A short row of choices where exactly one is on (a screen size, a mode). Each is a button that says
// whether it is pressed, so the state is not only a color.
import { FOCUS_RING } from "./Button";

export type SegmentOption<T extends string> = { id: T; label: string; /** Longer explanation, shown on hover. */ title?: string };

export function Segmented<T extends string>({ label, value, options, onChange, className = "" }: {
  /** What the choice is about ("Screen size"), for screen readers. */
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`inline-flex rounded border border-zinc-700 overflow-hidden shrink-0 ${className}`}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)}
          className={`h-8 px-3 text-ui ${FOCUS_RING} ${value === o.id ? "bg-blue-600 text-[var(--primary-foreground)] font-medium" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
