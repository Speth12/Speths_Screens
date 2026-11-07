// Translating what a screen says. A project lists its languages (the first is the one its text is
// written in) and, for each other language, a table from the source text to its translation. A text
// with no entry shows as written, so a half-translated project still works.
import type { Project, Widget } from "@speths-screens/shared-types";

export type Translate = (text: string) => string;

/** Widget settings that hold text a person reads. */
const TEXT_PROPS = ["label", "staticText", "trueLabel", "falseLabel", "placeholder", "unit"] as const;

/** The translation of text into a language; the text itself when there is none. */
export function translator(project: Pick<Project, "languages" | "translations"> | undefined, language: string | undefined): Translate {
  const table = language && project?.languages?.[0] !== language ? project?.translations?.[language] : undefined;
  if (!table) return (text) => text;
  return (text) => table[text] || text;
}

/** The language to draw: the one asked for when the project has it, else the project's first. */
export function pickLanguage(project: Pick<Project, "languages"> | undefined, wanted: string | null | undefined): string | undefined {
  const langs = project?.languages ?? [];
  return wanted && langs.includes(wanted) ? wanted : langs[0];
}

type Obj = Record<string, unknown>;

/** A widget with its text settings translated; the widget itself when nothing changes. */
export function translateWidget(w: Widget, tr: Translate): Widget {
  const p = w.props as Obj | undefined;
  if (!p) return w;
  let out: Obj | undefined;
  const set = (k: string, v: unknown) => { out ??= { ...p }; out[k] = v; };
  for (const k of TEXT_PROPS) {
    const v = p[k];
    if (typeof v === "string" && v) { const t = tr(v); if (t !== v) set(k, t); }
  }
  for (const key of ["states", "rows", "columns"] as const) {
    const list = p[key];
    if (!Array.isArray(list)) continue;
    let changed = false;
    const next = list.map((item) => {
      if (!item || typeof item !== "object" || typeof (item as Obj).label !== "string") return item;
      const label = (item as Obj).label as string;
      const t = label ? tr(label) : label;
      if (t === label) return item;
      changed = true;
      return { ...(item as Obj), label: t };
    });
    if (changed) set(key, next);
  }
  return out ? ({ ...w, props: out } as Widget) : w;
}

/** Every text in a project that a translator can change, in the order a person meets them, once each. */
export function collectTexts(project: Project): string[] {
  const seen = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && v.trim()) seen.add(v); };
  const widget = (w: Widget) => {
    // translateWidget finds the same texts: a recording translator sees each one it asks about.
    translateWidget(w, (t) => { add(t); return t; });
  };
  for (const pg of project.pages) {
    add(pg.name); add(pg.group);
    pg.widgets.forEach(widget);
  }
  for (const fp of project.customWidgets ?? []) fp.widgets.forEach((w) => widget(w as unknown as Widget));
  for (const r of project.alarmRules ?? []) { add(r.name); add(r.message); }
  return [...seen];
}
