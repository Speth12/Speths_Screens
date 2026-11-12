// What the built-in header and navigation show and how they look. Each choice is stored only when it
// differs from the default, and the canvas redraws the header as it changes.
import { FONTS, HEADER_HEIGHT, SIDEBAR_WIDTH, contrastRatio } from "@speths-screens/widgets";
import type { Shell, ShellHeader, ShellNav, ShellNavOptions, ShellStyle } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { chromeWarnings, patchHeader, patchHeaderStyle, patchNavOptions, patchNavStyle, withNav } from "../store/chromeOptions";
import { Button, Checkbox, Field, Input, Select } from "../ui";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";

const title = "text-ui-label font-semibold uppercase tracking-wide text-zinc-400";

/** A whole number from a field, held inside its limits; blank means the default. */
function px(text: string, min: number, max: number): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Math.round(Number(text));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
}

/** A color: a swatch to pick with, and the text for a token or any CSS color. Blank is the theme's own. */
function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#888888";
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input type="color" aria-label={`${label}: pick a color`} value={hex} onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 shrink-0 rounded border border-zinc-700 bg-zinc-950 p-0.5" />
        <Input mono value={value ?? ""} placeholder="theme" onChange={(e) => onChange(e.target.value.trim() || undefined)} />
      </div>
    </Field>
  );
}

function StyleFields({ what, style, nav, onChange }: { what: string; style: ShellStyle | undefined; nav?: boolean; onChange: (patch: Partial<ShellStyle>) => void }) {
  const s = style ?? {};
  return (
    <div role="group" aria-label={`${what} look`} className="grid grid-cols-2 gap-2">
      <ColorField label="Background" value={s.background} onChange={(background) => onChange({ background })} />
      <ColorField label="Text" value={s.textColor} onChange={(textColor) => onChange({ textColor })} />
      <ColorField label="Border" value={s.borderColor} onChange={(borderColor) => onChange({ borderColor })} />
      <Field label="Font">
        <Select value={s.font ?? ""} onChange={(e) => onChange({ font: (e.target.value || undefined) as ShellStyle["font"] })}>
          <option value="">The theme's</option>
          {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.name}</option>)}
        </Select>
      </Field>
      {nav && <ColorField label="Current page background" value={s.activeBackground} onChange={(activeBackground) => onChange({ activeBackground })} />}
      {nav && <ColorField label="Current page text" value={s.activeTextColor} onChange={(activeTextColor) => onChange({ activeTextColor })} />}
      <Field label="Text size">
        <Select value={s.fontSize ?? "normal"} onChange={(e) => onChange({ fontSize: e.target.value === "normal" ? undefined : (e.target.value as ShellStyle["fontSize"]) })}>
          <option value="small">Small</option>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </Select>
      </Field>
      <div className="flex items-end pb-1.5"><Checkbox label="Bold" checked={!!s.bold} onChange={(e) => onChange({ bold: e.target.checked || undefined })} /></div>
    </div>
  );
}

export function ChromeOptions() {
  const shell = useProject((s) => s.project.shell);
  const setShell = useProject((s) => s.setShell);
  const images = useProject((s) => s.project.images) ?? [];
  const pages = useProject((s) => s.project.pages);
  const securityMode = useProject((s) => s.project.security?.mode);
  const editAsCustom = useProject((s) => s.editChromeAsCustom);
  const activate = useWorkspace((s) => s.activate);
  const h: ShellHeader = shell?.header ?? {};
  const n: ShellNavOptions = shell?.navOptions ?? {};
  const nav: ShellNav = shell?.nav ?? "tabs";

  const header = (patch: Partial<ShellHeader>) => setShell(patchHeader(shell, patch));
  const navOpt = (patch: Partial<ShellNavOptions>) => setShell(patchNavOptions(shell, patch));
  // A checkbox that is on by default stores only "off"; one that is off by default stores only "on".
  const offOnly = (on: boolean) => (on ? undefined : false);
  const onOnly = (on: boolean) => (on ? true : undefined);
  const set = (next: Shell | undefined) => setShell(next);
  const warnings = chromeWarnings(shell, securityMode, contrastRatio);
  const logo = h.logo ?? "mark";

  return (
    <div data-testid="chrome-options" className="space-y-4 pt-1">
      <div className="rounded border border-zinc-800 p-2 space-y-1.5">
        <Button size="sm" variant="primary" onClick={() => { editAsCustom(); activate(SCREEN_TAB.id); }}>Edit as custom widgets on the canvas</Button>
        <p className="text-ui-label text-zinc-500 leading-relaxed">
          Turns this header and navigation, with the choices below, into custom widgets you build freely on the canvas: move, add or
          remove anything (buttons that go to pages, pictures, text). Each part keeps its place from the left or right edge, so the
          header still spans any screen width.
        </p>
      </div>
      <section aria-label="Header" className="space-y-2">
        <h3 className={title}>Header</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Logo">
            <Select value={logo} onChange={(e) => header({ logo: e.target.value === "mark" ? undefined : (e.target.value as ShellHeader["logo"]) })}>
              <option value="mark">Letters</option>
              <option value="image">A picture</option>
              <option value="none">None</option>
            </Select>
          </Field>
          {logo === "mark" && (
            <Field label="Letters">
              <Input value={h.logoText ?? ""} placeholder="S" maxLength={3} onChange={(e) => header({ logoText: e.target.value || undefined })} />
            </Field>
          )}
          {logo === "image" && (
            <Field label="Picture" hint={images.length ? undefined : "Add one in the Images tab first."}>
              <Select value={h.logoImage ?? ""} onChange={(e) => header({ logoImage: e.target.value || undefined })}>
                <option value="">Choose…</option>
                {images.map((img) => <option key={img.id} value={img.id}>{img.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Checkbox label="Project name" checked={h.showProjectName !== false} onChange={(e) => header({ showProjectName: offOnly(e.target.checked) })} />
          <Checkbox label="Page name" checked={h.showPageName !== false} onChange={(e) => header({ showPageName: offOnly(e.target.checked) })} />
          <Checkbox label="Page icon" checked={!!h.pageIcon} disabled={h.showPageName === false} onChange={(e) => header({ pageIcon: onOnly(e.target.checked) })} />
          <Checkbox label="Names centered" checked={h.titleAlign === "center"} onChange={(e) => header({ titleAlign: e.target.checked ? "center" : undefined })} />
          <Checkbox label="User menu" checked={h.showUser !== false} onChange={(e) => header({ showUser: offOnly(e.target.checked) })} />
          <Checkbox label="Active alarm count" checked={!!h.alarms} onChange={(e) => header({ alarms: onOnly(e.target.checked) })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {h.alarms && (
            <Field label="A click on the alarm count opens">
              <Select value={h.alarmsPage ?? ""} onChange={(e) => header({ alarmsPage: e.target.value || undefined })}>
                <option value="">Nothing</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Datasource connections">
            <Select value={h.drivers ?? "full"} onChange={(e) => header({ drivers: e.target.value === "full" ? undefined : (e.target.value as ShellHeader["drivers"]) })}>
              <option value="full">Each by name</option>
              <option value="summary">One summary (2/3)</option>
              <option value="none">Not shown</option>
            </Select>
          </Field>
          <Field label="Clock">
            <Select value={h.clock ?? "timeSeconds"} onChange={(e) => header({ clock: e.target.value === "timeSeconds" ? undefined : (e.target.value as ShellHeader["clock"]) })}>
              <option value="none">Not shown</option>
              <option value="time">Time</option>
              <option value="timeSeconds">Time with seconds</option>
              <option value="dateTime">Date and time</option>
              <option value="date">Date</option>
            </Select>
          </Field>
          {h.clock !== "none" && (
            <div className="flex items-end pb-1.5"><Checkbox label="Weekday" checked={h.clockWeekday !== false} onChange={(e) => header({ clockWeekday: offOnly(e.target.checked) })} /></div>
          )}
          <Field label="Height (px)">
            <Input type="number" min={32} max={200} value={h.height ?? ""} placeholder={String(HEADER_HEIGHT)} onChange={(e) => header({ height: px(e.target.value, 32, 200) })} />
          </Field>
        </div>
        <StyleFields what="Header" style={h.style} onChange={(patch) => set(patchHeaderStyle(shell, patch))} />
      </section>

      <section aria-label="Navigation" className="space-y-2">
        <h3 className={title}>Navigation</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pages are offered as">
            <Select value={nav} onChange={(e) => set(withNav(shell, e.target.value === "tabs" ? undefined : (e.target.value as ShellNav)))}>
              <option value="tabs">Tabs</option>
              <option value="sidebar">A sidebar</option>
              <option value="toolbar">Large icon buttons</option>
              <option value="none">Nothing (buttons on the pages)</option>
            </Select>
          </Field>
          {nav === "sidebar" && (
            <Field label="Sidebar width (px)">
              <Input type="number" min={48} max={480} value={n.width ?? ""} placeholder={String(SIDEBAR_WIDTH)} onChange={(e) => navOpt({ width: px(e.target.value, 48, 480) })} />
            </Field>
          )}
        </div>
        {nav !== "none" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Checkbox label="Page icons" checked={n.showIcons !== false} onChange={(e) => navOpt({ showIcons: offOnly(e.target.checked) })} />
              <Checkbox label="Settings entry" checked={n.showSettings !== false} onChange={(e) => navOpt({ showSettings: offOnly(e.target.checked) })} />
              {nav === "sidebar" && <Checkbox label="Icons only on a tablet" checked={!!n.tabletIcons} onChange={(e) => navOpt({ tabletIcons: onOnly(e.target.checked) })} />}
            </div>
            <StyleFields what="Navigation" nav style={n.style} onChange={(patch) => set(patchNavStyle(shell, patch))} />
          </>
        )}
      </section>

      {warnings.length > 0 && (
        <ul role="status" aria-label="Things to check" className="space-y-1 rounded border border-amber-700/60 bg-amber-500/10 p-2 text-ui-label text-amber-300">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
