// A widget's named style (the top of its Look tab): take one, keep this widget's look as a new one,
// write this widget's look back into the style, or let go of it. A style is a look shared by every
// widget that names it.
import { applyStyle, lookSettings, removeStyle } from "@speths-screens/widgets";
import type { NamedStyle } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { Button } from "../ui";
import { CloseIcon } from "../ui/icons";

type Props = Record<string, unknown>;

/** An id for a new style that no other style has. */
export function styleId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "style";
  let id = base, n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

/** How many widgets (on pages and in custom widgets) name a style. */
export function styleUses(project: { pages: { widgets: { props?: unknown }[] }[]; customWidgets?: { widgets: { props?: unknown }[] }[] }, id: string): number {
  const all = [...project.pages.flatMap((p) => p.widgets), ...(project.customWidgets ?? []).flatMap((c) => c.widgets)];
  return all.filter((w) => (w.props as Props | undefined)?.styleId === id).length;
}

export function StyleFields({ props, onChange }: { props: Props | undefined; onChange: (props: Props | undefined) => void }) {
  const styles = useProject((s) => s.project.styles) ?? [];
  const setStyles = useProject((s) => s.setStyles);
  const project = useProject((s) => s.project);
  const current = styles.find((s) => s.id === props?.styleId);
  const own = lookSettings(props);
  const ownCount = Object.keys(own).length;

  const saveAsNew = () => {
    const name = window.prompt("A name for the style (for example KPI card):", "");
    if (!name?.trim()) return;
    // The new style is this widget's look as it shows now: its style's, with its own on top.
    const look = { ...lookSettings(current?.props as Props | undefined), ...own };
    const style: NamedStyle = { id: styleId(name.trim(), styles.map((s) => s.id)), name: name.trim(), props: look };
    setStyles([...styles, style]);
    onChange(applyStyle(props, style));
  };
  const updateStyle = () => {
    if (!current) return;
    const next: NamedStyle = { ...current, props: { ...lookSettings(current.props as Props), ...own } };
    setStyles(styles.map((s) => (s.id === current.id ? next : s)));
    onChange(applyStyle(props, next));
  };

  return (
    <div data-testid="style-fields" className="space-y-1.5">
      <label className="block text-[10px] text-zinc-500">Named style
        <select aria-label="Named style" value={current?.id ?? ""} className="mt-0.5 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
          onChange={(e) => {
            const style = styles.find((s) => s.id === e.target.value);
            onChange(style ? applyStyle(props, style) : removeStyle(props, current, true));
          }}>
          <option value="">None (this widget's own look)</option>
          {typeof props?.styleId === "string" && !current && <option value={props.styleId}>{props.styleId} (missing)</option>}
          {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {current && (
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Shared by {styleUses(project, current.id)} widget{styleUses(project, current.id) === 1 ? "" : "s"}.
          {ownCount > 0 ? ` This one changes ${ownCount} setting${ownCount === 1 ? "" : "s"} of it.` : " A setting you change below is this widget's own."}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={saveAsNew} title="Keeps this widget's look under a name, and makes this widget follow it">New style from this look…</Button>
        {current && ownCount > 0 && <Button size="sm" onClick={updateStyle} title="Writes this widget's changes into the style, so every widget with the style gets them">Update the style</Button>}
      </div>
    </div>
  );
}

/** The project's styles (Project properties, Styles): rename or remove one. */
export function StyleLibrary() {
  const styles = useProject((s) => s.project.styles) ?? [];
  const setStyles = useProject((s) => s.setStyles);
  const project = useProject((s) => s.project);
  return (
    <div data-testid="style-library" className="p-3 space-y-2 text-ui-label">
      <p className="text-zinc-500 leading-relaxed">
        A style is a look with a name. Make one from a widget (its Look tab, New style from this look), then give it to other widgets;
        changing the style changes them all.
      </p>
      {styles.length === 0 && <div className="text-zinc-500 italic">No styles yet.</div>}
      {styles.map((s) => {
        const uses = styleUses(project, s.id);
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <input aria-label={`Name of ${s.id}`} value={s.name} onChange={(e) => setStyles(styles.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs" />
            <span className="shrink-0 text-zinc-500">{uses} use{uses === 1 ? "" : "s"}</span>
            <button aria-label={`Remove ${s.name}`} title={uses ? "Remove the style. The widgets that use it go back to their own look." : "Remove the style"}
              onClick={() => { if (!uses || window.confirm(`${uses} widget${uses === 1 ? " uses" : "s use"} "${s.name}". They go back to their own look. Remove it?`)) setStyles(styles.filter((x) => x.id !== s.id)); }}
              className="text-zinc-600 hover:text-red-400 px-1"><CloseIcon size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
