// The operator's own settings: how this browser shows the screens, and the lock screen. Nothing here
// changes the project; the view choices are kept in this browser only.
import type { ReactNode } from "react";

export type SettingsProps = {
  /** "light", "dark", or "" for the project's own. */
  mode: string;
  onMode: (v: string) => void;
  languages?: readonly string[];
  language?: string;
  onLanguage: (v: string) => void;
  /** Offered for a page that can be fitted to the window's width. */
  fit?: { on: boolean; toggle: () => void };
  /** Signs out, so another person can sign in (only when the project asks for logins). */
  onLogout?: () => void;
  /** The text of a label in the language being shown. */
  t?: (text: string) => string;
};

const field = { background: "var(--secondary)", color: "var(--foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)" } as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 p-4" style={{ background: "var(--card)", color: "var(--card-foreground)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm" style={{ minHeight: "var(--control-height, 2rem)" }}>
      <span className="flex flex-col"><span>{label}</span>{note && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{note}</span>}</span>
      {children}
    </label>
  );
}

export function SettingsScreen(p: SettingsProps) {
  const t = p.t ?? ((s: string) => s);
  const multi = (p.languages?.length ?? 0) > 1;
  return (
    <div data-testid="settings-screen" className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("Settings")}</h1>
      <Card title={t("Appearance")}>
        <Row label={t("Light or dark")} note={t("This browser only")}>
          <select aria-label="Light or dark" value={p.mode} onChange={(e) => p.onMode(e.target.value)} className="px-2 py-1 text-sm" style={field}>
            <option value="">{t("Project default")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option>
          </select>
        </Row>
        {multi && (
          <Row label={t("Language")}>
            <select aria-label="Language" value={p.language} onChange={(e) => p.onLanguage(e.target.value)} className="px-2 py-1 text-sm" style={field}>
              {p.languages!.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </Row>
        )}
        {p.fit && (
          <Row label={t("Fit the page to the window")}>
            <input type="checkbox" aria-label="Fit the page to the window" checked={p.fit.on} onChange={p.fit.toggle} />
          </Row>
        )}
      </Card>
      {p.onLogout && (
        <Card title={t("Sign in")}>
          <div className="flex flex-wrap gap-2">
            <button onClick={p.onLogout} className="px-3 py-1.5 text-sm font-medium" style={field}>{t("Log out")}</button>
          </div>
        </Card>
      )}
    </div>
  );
}
