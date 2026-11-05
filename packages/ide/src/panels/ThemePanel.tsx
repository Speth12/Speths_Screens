// The screens' look: take a preset whole, or change any element of it. The project holds only the
// elements changed, so a project with just a preset follows the preset if it later improves.
import { Gallery, ICON_NAMES, MANIFESTS, PRESETS, FONTS, resolveTheme } from "@speths-screens/widgets";
import type { PageIcon, ShellNav, Theme, ThemePreset } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";

type Element = Exclude<keyof Theme, "preset" | "accent">;

const ELEMENTS: { key: Element; label: string; options: readonly (readonly [string, string])[] }[] = [
  { key: "mode", label: "Light or dark", options: [["light", "Light"], ["dark", "Dark"]] },
  { key: "palette", label: "Colors", options: [["calm", "Calm gray"], ["modern", "Modern blue"]] },
  { key: "corners", label: "Corners", options: [["square", "Square"], ["soft", "Soft"], ["round", "Round"]] },
  { key: "depth", label: "Depth", options: [["flat", "Flat, bordered"], ["raised", "Raised, shadow"], ["borderless", "Borderless"]] },
  { key: "density", label: "Density", options: [["compact", "Compact"], ["comfortable", "Comfortable"], ["touch", "Touch (large)"]] },
  { key: "font", label: "Font", options: Object.entries(FONTS).map(([id, f]) => [id, f.name] as const) },
];

const SHOWN = MANIFESTS.filter((m) => ["gauge", "button", "numericDisplay"].includes(m.type));

export function ThemePanel({ onClose }: { onClose: () => void }) {
  const spec = useProject((s) => s.project.theme);
  const setTheme = useProject((s) => s.setTheme);
  const nav = useProject((s) => s.project.shell?.nav);
  const setShell = useProject((s) => s.setShell);
  const pages = useProject((s) => s.project.pages);
  const updatePage = useProject((s) => s.updatePage);
  const preset: ThemePreset = spec?.preset ?? "calm";
  const resolved = resolveTheme(spec);

  const pick = (p: ThemePreset) => setTheme({ preset: p });
  const set = (key: Element, value: string) => {
    const next = { ...(spec ?? { preset }) } as Record<string, unknown>;
    if (value === "") delete next[key]; else next[key] = value;
    setTheme(next as Theme);
  };
  const setAccent = (value: string) => {
    const next = { ...(spec ?? { preset }) } as Record<string, unknown>;
    if (value === "") delete next.accent; else next.accent = value;
    setTheme(next as Theme);
  };
  const changed = spec ? Object.keys(spec).filter((k) => k !== "preset").length : 0;

  return (
    <div className="fixed left-0 top-10 bottom-0 z-40 w-[min(760px,70vw)] flex flex-col bg-zinc-950 border-r border-zinc-700 shadow-2xl">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800">
        <div className="text-xs font-semibold text-zinc-200">Theme and navigation</div>
        <span className="text-[10px] text-zinc-500">{changed ? `${PRESETS[preset].name} with ${changed} change${changed > 1 ? "s" : ""}` : `${PRESETS[preset].name}, as designed`}</span>
        <button aria-label="Close theme" onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200 text-sm px-1">×</button>
      </div>
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
        <section>
          <h3 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Start from a theme</h3>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PRESETS) as ThemePreset[]).map((id) => (
              <button key={id} data-testid={`preset-${id}`} onClick={() => pick(id)} aria-pressed={preset === id && !changed}
                className={`text-left rounded border px-2 py-1.5 ${preset === id ? "border-blue-500 bg-zinc-900" : "border-zinc-700 hover:border-zinc-500"}`}>
                <div className="text-xs text-zinc-100">{PRESETS[id].name}</div>
                <div className="text-[10px] text-zinc-500">{PRESETS[id].tagline}</div>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Or change one element at a time</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {ELEMENTS.map((e) => (
              <label key={e.key} className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">{e.label}
                <select aria-label={e.label} value={(spec as Record<string, string> | undefined)?.[e.key] ?? ""} onChange={(ev) => set(e.key, ev.target.value)}
                  className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200 w-40">
                  <option value="">Theme's own</option>
                  {e.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
            <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">Accent color
              <span className="flex items-center gap-1">
                <input aria-label="Accent color" type="color" value={spec?.accent ?? resolved.colors.primary} onChange={(ev) => setAccent(ev.target.value)} />
                {spec?.accent && <button onClick={() => setAccent("")} className="text-[10px] text-zinc-400 hover:text-zinc-200">reset</button>}
              </span>
            </label>
          </div>
          {changed > 0 && <button onClick={() => pick(preset)} className="mt-2 text-[11px] text-blue-400 hover:text-blue-300">Reset to {PRESETS[preset].name}</button>}
        </section>
        <section>
          <h3 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Navigation</h3>
          <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 mb-2">How people move between pages (a phone always gets a bar along the bottom)
            <select aria-label="Navigation style" value={nav ?? ""} onChange={(e) => setShell(e.target.value ? { nav: e.target.value as ShellNav } : undefined)}
              className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200 w-40">
              <option value="">Tabs (default)</option>
              <option value="sidebar">Sidebar</option>
              <option value="toolbar">Large icon toolbar</option>
              <option value="tabs">Tabs</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            {pages.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[11px] text-zinc-300">
                <span className="w-32 truncate">{p.name}</span>
                <select aria-label={`Icon for ${p.name}`} value={p.icon ?? ""} onChange={(e) => updatePage(p.id, { icon: (e.target.value || undefined) as PageIcon | undefined })}
                  className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200 w-28">
                  <option value="">First letter</option>
                  {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input aria-label={`Group for ${p.name}`} placeholder="Group (sidebar)" value={p.group ?? ""}
                  onChange={(e) => updatePage(p.id, { group: e.target.value || undefined })}
                  className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-200 w-36" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Preview</h3>
          <div className="overflow-auto rounded border border-zinc-800">
            <Gallery theme={resolved} manifests={SHOWN} />
          </div>
        </section>
      </div>
    </div>
  );
}
