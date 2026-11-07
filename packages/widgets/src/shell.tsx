// The four widgets that make up a project's header and navigation: the page list, the clock, the
// driver status and the user menu. They read the app through the host (pages, drivers, user), so a
// custom widget built from them works on the operator screen and in the IDE alike.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClockProps, PageListProps } from "@speths-screens/shared-types";
import { useHost, type DriverInfo, type PageInfo } from "./host";
import { Icon } from "./icons";

const ACTIVE = { background: "var(--primary)", color: "var(--primary-foreground)" } as const;
const IDLE = { background: "transparent", color: "var(--muted-foreground)" } as const;

/** The pages in order, with each group's pages together at the group's first page. */
export function groupPages(pages: readonly PageInfo[]): { group: string | null; items: PageInfo[] }[] {
  const out: { group: string | null; items: PageInfo[] }[] = [];
  for (const page of pages) {
    const group = page.group?.trim() || null;
    let g = group === null ? undefined : out.find((x) => x.group === group);
    if (!g) { g = { group, items: [] }; out.push(g); }
    g.items.push(page);
  }
  return out;
}

// ── Page list ────────────────────────────────────────────────────────────

export function PageListWidget({ w }: { w: { props?: PageListProps } }) {
  const host = useHost();
  const t = host.useTranslate();
  const { pages, activeId } = host.usePages();
  const style = w.props?.style ?? "list";
  const select = (id: string) => host.navigate(id);

  if (style === "tabs") {
    return (
      <div role="tablist" className="flex gap-1 items-center min-w-0 overflow-x-auto">
        {pages.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === activeId} onClick={() => select(p.id)}
            className="text-xs px-3 py-1 rounded transition-colors shrink-0"
            style={p.id === activeId ? ACTIVE : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {t(p.name)}
          </button>
        ))}
      </div>
    );
  }

  if (style === "icons") {
    return (
      <nav aria-label="Pages" className="flex gap-2 items-center min-w-0 overflow-x-auto">
        {pages.map((p) => (
          <button key={p.id} aria-current={p.id === activeId ? "page" : undefined} onClick={() => select(p.id)}
            className="flex flex-col items-center justify-center gap-1 px-4 min-w-[88px] text-xs font-medium transition-colors shrink-0"
            style={{ minHeight: "calc(var(--control-height, 2rem) * 1.75)", borderRadius: "var(--radius)", ...(p.id === activeId ? ACTIVE : { background: "var(--secondary)", color: "var(--muted-foreground)" }) }}>
            <Icon name={p.icon} label={t(p.name)} size={26} />
            <span className="truncate max-w-[110px]">{t(p.name)}</span>
          </button>
        ))}
      </nav>
    );
  }

  if (style === "bar") {
    return (
      <nav aria-label="Pages" className="flex h-full w-full overflow-x-auto">
        {pages.map((p) => (
          <button key={p.id} aria-current={p.id === activeId ? "page" : undefined} onClick={() => select(p.id)}
            className="flex flex-1 min-w-[64px] flex-col items-center justify-center gap-0.5 py-1.5 text-xs transition-colors"
            style={{ minHeight: 56, ...(p.id === activeId ? { color: "var(--primary)", fontWeight: 600 } : { color: "var(--muted-foreground)" }) }}>
            <Icon name={p.icon} label={t(p.name)} size={22} />
            <span className="truncate max-w-[72px]">{t(p.name)}</span>
          </button>
        ))}
      </nav>
    );
  }

  const showGroups = w.props?.showGroups !== false;
  return (
    <nav aria-label="Pages" className="h-full w-full overflow-y-auto py-1">
      {groupPages(pages).map((g, gi) => (
        <div key={g.group ?? `ungrouped-${gi}`} className="mb-2">
          {showGroups && g.group && (
            <div className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{t(g.group)}</div>
          )}
          {g.items.map((p) => (
            <button key={p.id} aria-current={p.id === activeId ? "page" : undefined} onClick={() => select(p.id)}
              className="flex w-full items-center gap-3 px-4 text-sm text-left transition-colors"
              style={{ minHeight: "var(--control-height, 2rem)", ...(p.id === activeId ? ACTIVE : IDLE) }}>
              <Icon name={p.icon} label={t(p.name)} size={18} />
              <span className="truncate">{t(p.name)}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

// ── Clock ────────────────────────────────────────────────────────────────

/** "Thu 07:49:12", "07:49", "Thu 6 Nov 07:49" or "Thu 6 Nov", in the given language or the browser's. */
export function formatClock(d: Date, p: ClockProps = {}, locale?: string): string {
  const format = p.format ?? "timeSeconds";
  const hour12 = p.hour12 === true;
  const parts: string[] = [];
  if (p.showWeekday !== false) parts.push(d.toLocaleDateString(locale, { weekday: "short" }));
  if (format === "dateTime" || format === "date") parts.push(d.toLocaleDateString(locale, { day: "numeric", month: "short" }));
  if (format !== "date") {
    parts.push(d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", ...(format === "timeSeconds" ? { second: "2-digit" } : {}), hour12 }));
  }
  return parts.join(" ");
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ClockWidget({ w }: { w: { props?: ClockProps } }) {
  const now = useNow();
  return (
    <div className="h-full flex items-center">
      <span data-testid="clock" className="text-sm tabular-nums" style={{ color: "var(--muted-foreground)" }}>{formatClock(now, w.props)}</span>
    </div>
  );
}

// ── Driver status ────────────────────────────────────────────────────────

/** How many drivers are connected, and how that reads at a glance. */
export function driverSummary(drivers: readonly DriverInfo[]): { online: number; total: number; state: "none" | "ok" | "partial" | "down" } {
  const total = drivers.length;
  const online = drivers.filter((d) => d.connected).length;
  return { online, total, state: total === 0 ? "none" : online === total ? "ok" : online === 0 ? "down" : "partial" };
}

/** A filled dot is connected, a ring is not, so the state does not depend on color alone. */
function Dot({ on, partial = false }: { on: boolean; partial?: boolean }) {
  const color = on ? "#16a34a" : partial ? "var(--alarm-warning)" : "var(--alarm-critical)";
  return <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: on || partial ? color : "transparent", border: `2px solid ${color}` }} />;
}

export function DriverStatusWidget({ w }: { w: { props?: { compact?: boolean } } }) {
  const drivers = useHost().useDrivers();
  const sum = driverSummary(drivers);
  if (sum.state === "none") return <div className="h-full flex items-center text-xs" style={{ color: "var(--muted-foreground)" }}>No datasources</div>;
  const tip = (d: DriverInfo) => `${d.label ?? d.id}: ${d.connected ? `connected${d.tagCount !== undefined ? `, ${d.tagCount} tags` : ""}` : `not connected${d.lastError ? ` (${d.lastError})` : ""}`}`;
  if (w.props?.compact) {
    return (
      <span data-testid="driver-summary" title={drivers.map(tip).join("\n")} className="h-full inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
        <Dot on={sum.state === "ok"} partial={sum.state === "partial"} />
        {sum.online}/{sum.total}
      </span>
    );
  }
  return (
    <div role="list" aria-label="Drivers" className="h-full flex items-center gap-1.5 min-w-0 overflow-hidden">
      {drivers.map((d) => (
        <span key={d.id} role="listitem" title={tip(d)} data-testid={`driver-${d.id}`} data-connected={d.connected}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium shrink-0"
          style={{ border: "var(--line-width, 1px) solid var(--border)", borderRadius: "999px", color: d.connected ? "var(--foreground)" : "var(--alarm-critical)" }}>
          <Dot on={d.connected} />
          {d.label ?? d.id}
          {!d.connected && <span className="sr-only"> (not connected)</span>}
        </span>
      ))}
    </div>
  );
}

// ── User menu ────────────────────────────────────────────────────────────

export function UserMenuWidget({ w }: { w: { props?: { showName?: boolean } } }) {
  const user = useHost().useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is drawn on the page, not inside the widget, which a header clips; it sits under the icon.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      setAt({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const signedIn = !!user.name;
  const field = { background: "var(--secondary)", color: "var(--foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)" } as const;

  return (
    <div ref={ref} className="relative h-full flex items-center gap-2">
      <button aria-label={signedIn ? `Signed in as ${user.name}` : "User"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center shrink-0"
        style={{ width: 34, height: 34, borderRadius: "50%", background: signedIn ? "var(--primary)" : "var(--secondary)", color: signedIn ? "var(--primary-foreground)" : "var(--muted-foreground)", border: "var(--line-width, 1px) solid var(--border)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        {!user.loginRequired && <span aria-hidden="true" title="Security is off" style={{ position: "absolute", right: -1, top: -1, width: 10, height: 10, borderRadius: "50%", background: "var(--alarm-warning)", border: "2px solid var(--card)" }} />}
      </button>
      {w.props?.showName && signedIn && <span className="text-sm truncate">{user.name}</span>}
      {open && at && createPortal(
        <div ref={menuRef} role="menu" aria-label="User menu" className="fixed w-72 p-3 flex flex-col gap-3 z-50"
          style={{ top: at.top, right: at.right, background: "var(--card)", color: "var(--card-foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow, 0 8px 24px rgba(0,0,0,.2))" }}>
          <div data-testid="account" className="flex flex-col gap-1">
            {signedIn ? (
              <>
                <div className="text-sm font-semibold">{user.name}</div>
                {user.role && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{user.role}</div>}
                {user.logout && <button onClick={() => { setOpen(false); user.logout!(); }} className="mt-1 self-start text-xs px-2.5 py-1 font-medium" style={field}>Log out</button>}
              </>
            ) : user.loginRequired ? (
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Not signed in.</div>
            ) : (
              <>
                <div className="text-sm font-semibold">Security is off</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Nobody needs to sign in, and everyone can read and write. To require a login, set the project's security mode to login.</div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
