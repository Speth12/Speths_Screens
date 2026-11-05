// Moving between pages: tabs along the top, a row of large icon buttons, or a list on the left
// (project.shell.nav). A phone always gets a bar along the bottom, whatever the project chose.
import { Icon } from "@speths-screens/widgets";
import type { Page, ShellNav } from "@speths-screens/shared-types";
import { useEffect, useState } from "react";

export type NavMode = ShellNav | "bottom";

/** Narrower than this is a phone. */
export const PHONE_WIDTH = 640;

/** The navigation to draw for the project's choice at this window width. */
export function navMode(nav: ShellNav | undefined, width: number): NavMode {
  if (width < PHONE_WIDTH) return "bottom";
  return nav ?? "tabs";
}

/** The pages in order, with each group's pages together at the group's first page. */
export function groupPages(pages: readonly Page[]): { group: string | null; items: { page: Page; index: number }[] }[] {
  const out: { group: string | null; items: { page: Page; index: number }[] }[] = [];
  pages.forEach((page, index) => {
    const group = page.group?.trim() || null;
    let g = group === null ? undefined : out.find((x) => x.group === group);
    if (!g) { g = { group, items: [] }; out.push(g); }
    g.items.push({ page, index });
  });
  return out;
}

export function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

const ACTIVE = { background: "var(--primary)", color: "var(--primary-foreground)" } as const;
const IDLE = { background: "transparent", color: "var(--muted-foreground)" } as const;

export function PageNav({ mode, pages, active, onSelect }: {
  mode: NavMode; pages: readonly Page[]; active: number; onSelect: (index: number) => void;
}) {
  if (pages.length < 2 && mode !== "sidebar") return null;

  if (mode === "tabs") {
    return (
      <div role="tablist" className="flex gap-1">
        {pages.map((p, i) => (
          <button key={p.id} role="tab" aria-selected={i === active} onClick={() => onSelect(i)}
            className="text-xs px-3 py-1 rounded transition-colors"
            style={i === active ? ACTIVE : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {p.name}
          </button>
        ))}
      </div>
    );
  }

  if (mode === "toolbar") {
    return (
      <nav aria-label="Pages" className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0"
        style={{ background: "var(--card)", borderBottom: "var(--line-width, 1px) solid var(--border)" }}>
        {pages.map((p, i) => (
          <button key={p.id} aria-current={i === active ? "page" : undefined} onClick={() => onSelect(i)}
            className="flex flex-col items-center justify-center gap-1 px-4 min-w-[88px] text-xs font-medium transition-colors"
            style={{ minHeight: "calc(var(--control-height, 2rem) * 1.75)", borderRadius: "var(--radius)", ...(i === active ? ACTIVE : { background: "var(--secondary)", color: "var(--secondary-foreground)" }) }}>
            <Icon name={p.icon} label={p.name} size={26} />
            <span className="truncate max-w-[110px]">{p.name}</span>
          </button>
        ))}
      </nav>
    );
  }

  if (mode === "sidebar") {
    return (
      <nav aria-label="Pages" className="w-52 shrink-0 overflow-y-auto py-2"
        style={{ background: "var(--card)", borderRight: "var(--line-width, 1px) solid var(--border)" }}>
        {groupPages(pages).map((g, gi) => (
          <div key={g.group ?? `ungrouped-${gi}`} className="mb-2">
            {g.group && <div className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{g.group}</div>}
            {g.items.map(({ page, index }) => (
              <button key={page.id} aria-current={index === active ? "page" : undefined} onClick={() => onSelect(index)}
                className="flex w-full items-center gap-3 px-4 text-sm text-left transition-colors"
                style={{ minHeight: "var(--control-height, 2rem)", ...(index === active ? ACTIVE : IDLE) }}>
                <Icon name={page.icon} label={page.name} size={18} />
                <span className="truncate">{page.name}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    );
  }

  // bottom: the phone's bar, always with a label
  return (
    <nav aria-label="Pages" className="flex shrink-0 overflow-x-auto"
      style={{ background: "var(--card)", borderTop: "var(--line-width, 1px) solid var(--border)" }}>
      {pages.map((p, i) => (
        <button key={p.id} aria-current={i === active ? "page" : undefined} onClick={() => onSelect(i)}
          className="flex flex-1 min-w-[64px] flex-col items-center justify-center gap-0.5 py-1.5 text-xs transition-colors"
          style={{ minHeight: 56, ...(i === active ? { color: "var(--primary)", fontWeight: 600 } : { color: "var(--muted-foreground)" }) }}>
          <Icon name={p.icon} label={p.name} size={22} />
          <span className="truncate max-w-[72px]">{p.name}</span>
        </button>
      ))}
    </nav>
  );
}
