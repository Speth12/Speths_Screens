// Row styles for the lists and tables (the alarm list, the history list, the table, recipes).
import { tokenColor } from "./tokens";
import { readableOn } from "./variants";

/** How the rows of the lists and tables are drawn when a widget asks for a row style or size. The
 *  rules are marked important because they replace what a row's own classes say. */
export const ROWS_CSS = `
[data-rows] .ss-row { border: 0 !important; background: transparent !important; border-radius: 0 !important; }
[data-rows="lined"] .ss-row { border-bottom: 1px solid var(--border) !important; }
[data-rows="striped"] .ss-row:nth-child(even) { background: color-mix(in srgb, var(--foreground) 7%, transparent) !important; }
[data-rows="cards"] .ss-row { background: var(--secondary) !important; border-radius: var(--radius, 6px) !important; }
[data-rows="cards"] { --row-gap: 4px; }
[data-rows="cards"] table { border-collapse: separate !important; border-spacing: 0 4px; }
[data-row-size="tight"] .ss-row, [data-row-size="tight"] .ss-row > td { padding-top: 1px !important; padding-bottom: 1px !important; font-size: var(--type-xs, 0.75rem); }
[data-row-size="normal"] .ss-row, [data-row-size="normal"] .ss-row > td { padding-top: 5px !important; padding-bottom: 5px !important; font-size: var(--type-sm, 0.875rem); }
[data-row-size="roomy"] .ss-row, [data-row-size="roomy"] .ss-row > td { padding-top: 11px !important; padding-bottom: 11px !important; font-size: var(--type-base, 1rem); }
[data-rows] .ss-row > td:first-child, [data-row-size] .ss-row > td:first-child { padding-left: 8px !important; }
[data-rows] .ss-row > td:last-child, [data-row-size] .ss-row > td:last-child { padding-right: 8px !important; }
[data-rows] div.ss-row, [data-row-size] div.ss-row { padding-left: 8px !important; padding-right: 8px !important; }
[data-rows] .ss-head > th:first-child, [data-row-size] .ss-head > th:first-child, [data-head] .ss-head > th:first-child { padding-left: 8px !important; }
[data-rows] .ss-head > th:last-child, [data-row-size] .ss-head > th:last-child, [data-head] .ss-head > th:last-child { padding-right: 8px !important; }
[data-head] .ss-head > th { padding-top: 4px !important; padding-bottom: 4px !important; }
[data-head] .ss-head, [data-head] .ss-head > th { background: var(--list-head) !important; color: var(--list-head-text) !important; }`;

type RowLook = { rowStyle?: string; rowSize?: string; headerColor?: string };

/** What a list or a table puts on its outer element for its row style, row size and heading color;
 *  nothing when none is set, which leaves it drawn as it always was. */
export function rowLook(p: RowLook | undefined): { attrs: Record<string, string | undefined>; style: React.CSSProperties | undefined; styled: boolean } {
  const head = p?.headerColor ? tokenColor(p.headerColor) ?? p.headerColor : undefined;
  const styled = !!(p?.rowStyle || p?.rowSize || head);
  return {
    styled,
    attrs: { "data-rows": p?.rowStyle, "data-row-size": p?.rowSize, "data-head": head ? "" : undefined },
    style: head ? ({ "--list-head": head, "--list-head-text": readableOn(head) } as React.CSSProperties) : undefined,
  };
}
