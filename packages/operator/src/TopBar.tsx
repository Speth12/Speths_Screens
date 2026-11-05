// The bar along the top of the operator screen: the logo, the project, whether the drivers are
// connected, then the time and the user. The user icon is for signing in and out and nothing else;
// view settings live on the Settings screen and alarms on the alarm widgets.
import { useEffect, useRef, useState } from "react";

export type Driver = { id: string; label?: string; connected: boolean; lastError?: string; tagCount?: number };

/** The product mark: an S on the accent color. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div aria-hidden="true" style={{
      width: size, height: size, borderRadius: "var(--radius)", background: "var(--primary)", color: "var(--primary-foreground)",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.55, fontWeight: 700, flex: "none",
    }}>S</div>
  );
}

/** How many drivers are connected, and how that reads at a glance. */
export function driverSummary(drivers: readonly Driver[]): { online: number; total: number; state: "none" | "ok" | "partial" | "down" } {
  const total = drivers.length;
  const online = drivers.filter((d) => d.connected).length;
  return { online, total, state: total === 0 ? "none" : online === total ? "ok" : online === 0 ? "down" : "partial" };
}

/** "Thu 07:49:12" in the browser's language, or the given one. */
export function formatClock(d: Date, locale?: string): string {
  const day = d.toLocaleDateString(locale, { weekday: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${day} ${time}`;
}

/** Who a login token is for. The token is only read here to show a name; the runtime checks it. */
export function tokenUser(token: string | null): { name: string; role: string } | null {
  if (!token) return null;
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: unknown; role?: unknown };
    return typeof json.sub === "string" ? { name: json.sub, role: typeof json.role === "string" ? json.role : "" } : null;
  } catch {
    return null;
  }
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const OK = "#16a34a";

function DriverChips({ drivers, compact }: { drivers: readonly Driver[]; compact: boolean }) {
  const sum = driverSummary(drivers);
  if (sum.state === "none") return null;
  const tip = (d: Driver) => `${d.label ?? d.id}: ${d.connected ? `connected${d.tagCount !== undefined ? `, ${d.tagCount} tags` : ""}` : `not connected${d.lastError ? `: ${d.lastError}` : ""}`}`;
  if (compact) {
    return (
      <span data-testid="driver-summary" title={drivers.map(tip).join("\n")} className="inline-flex items-center gap-1.5 text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
        <Dot on={sum.state === "ok"} partial={sum.state === "partial"} />
        {sum.online}/{sum.total}
      </span>
    );
  }
  return (
    <div role="list" aria-label="Drivers" className="flex items-center gap-1.5 min-w-0">
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

/** A filled dot is connected, a ring is not, so the state does not depend on color alone. */
function Dot({ on, partial = false }: { on: boolean; partial?: boolean }) {
  const color = on ? OK : partial ? "var(--alarm-warning)" : "var(--alarm-critical)";
  return <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: on || partial ? color : "transparent", border: `2px solid ${color}`, boxSizing: "border-box" }} />;
}

function Clock() {
  return <span data-testid="clock" className="text-sm tabular-nums shrink-0" style={{ color: "var(--muted-foreground)" }}>{formatClock(useNow())}</span>;
}

export type MenuProps = {
  token: string | null;
  /** security.mode is "login". */
  loginRequired: boolean;
  onLogout: () => void;
};

export function UserMenu(p: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const user = tokenUser(p.token);
  const field = { background: "var(--secondary)", color: "var(--foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)" } as const;

  return (
    <div ref={ref} className="relative shrink-0">
      <button aria-label={user ? `Signed in as ${user.name}` : "User"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center"
        style={{ width: 34, height: 34, borderRadius: "50%", background: user ? "var(--primary)" : "var(--secondary)", color: user ? "var(--primary-foreground)" : "var(--secondary-foreground)", border: "var(--line-width, 1px) solid var(--border)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        {!p.loginRequired && <span aria-hidden="true" title="Security is off" style={{ position: "absolute", right: -1, top: -1, width: 10, height: 10, borderRadius: "50%", background: "var(--alarm-warning)", border: "2px solid var(--card)" }} />}
      </button>
      {open && (
        <div role="menu" aria-label="User menu" className="absolute right-0 mt-2 w-72 p-3 flex flex-col gap-3 z-50"
          style={{ background: "var(--card)", color: "var(--card-foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          <div data-testid="account" className="flex flex-col gap-1">
            {user ? (
              <>
                <div className="text-sm font-semibold">{user.name}</div>
                {user.role && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{user.role}</div>}
                <button onClick={() => { setOpen(false); p.onLogout(); }} className="mt-1 self-start text-xs px-2.5 py-1 font-medium" style={field}>Log out</button>
              </>
            ) : p.loginRequired ? (
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Not signed in.</div>
            ) : (
              <>
                <div className="text-sm font-semibold">Security is off</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Nobody needs to sign in, and everyone can read and write. To require a login, an engineer sets the project's security mode to "login".</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar(props: {
  projectName: string;
  pageName?: string;
  drivers: readonly Driver[];
  phone: boolean;
  menu: MenuProps;
}) {
  const { phone } = props;
  return (
    <header className="flex items-center gap-3 shrink-0" data-testid="topbar"
      style={{ height: phone ? 52 : 60, padding: `0 ${phone ? 12 : 20}px`, background: "var(--card)", color: "var(--card-foreground)", borderBottom: "var(--line-width, 1px) solid var(--border)" }}>
      <Logo />
      {!phone && <span className="text-[15px] font-bold shrink-0" style={{ width: 128 }}>Speth's Screens</span>}
      <div className="flex flex-col min-w-0 shrink">
        <span data-testid="project-name" className="text-base font-semibold leading-tight truncate">{props.projectName}</span>
        {props.pageName && <span className="text-xs leading-tight truncate" style={{ color: "var(--muted-foreground)" }}>{props.pageName}</span>}
      </div>
      <DriverChips drivers={props.drivers} compact={phone} />
      <div className="flex-1" />
      {!phone && <Clock />}
      <UserMenu {...props.menu} />
    </header>
  );
}
