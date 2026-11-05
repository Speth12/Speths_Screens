// The page icons a project can name (PageIcon in schema.json): simple 24 px line drawings that take
// the text color, so every theme and mode colors them.
import type { PageIcon } from "@speths-screens/shared-types";

const PATHS: Record<PageIcon, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  graph: "M3 17l5-6 4 4 8-9M3 21h18",
  alarm: "M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0",
  settings: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M18 16v4",
  pump: "M5 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM12 5h8v4M9 9l6 6M9 15l6-6",
  vessel: "M6 5c0-1.1 2.7-2 6-2s6 .9 6 2v14c0 1.1-2.7 2-6 2s-6-.9-6-2zM6 5c0 1.1 2.7 2 6 2s6-.9 6-2M6 13c0 1.1 2.7 2 6 2s6-.9 6-2",
  valve: "M3 12h5M16 12h5M8 7v10l4-5zM16 7v10l-4-5zM12 12V5M9 5h6",
  motor: "M7 7h10v10H7zM3 10v4M21 10v4M10 3h4M10 21h4M12 10v4M10 12h4",
  dial: "M4 17a8 8 0 1 1 16 0M12 17l4-5M7 17h0M12 9v1M17 17h0",
  list: "M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0",
  chart: "M5 20V10M12 20V4M19 20v-7M3 20h18",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7",
  tools: "M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2zM6 18h0",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8",
};

export const ICON_NAMES = Object.keys(PATHS) as PageIcon[];

/** A page's icon; with no name, the first letter of the page's name in the same box. */
export function Icon({ name, label, size = 20 }: { name?: PageIcon; label?: string; size?: number }) {
  if (!name) {
    return (
      <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.7 }}
        className="inline-flex items-center justify-center font-semibold leading-none">
        {(label ?? "?").trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
