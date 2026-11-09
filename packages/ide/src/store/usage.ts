// What a project uses: the tags on a page, and what refers to a datasource. Read-only summaries for the Pages and
// Datasources tabs.
import type { Page, Project, Widget } from "@speths-screens/shared-types";

/** The datasource a tag reference belongs to: "plc:Arp.X" is plc; "ns:Plant.Temp" is whatever the namespace maps it to. */
export function datasourceOfTag(project: Project, tag: string): string | undefined {
  const sep = tag.indexOf(":");
  if (sep <= 0) return undefined;
  const prefix = tag.slice(0, sep);
  if (prefix !== "ns") return prefix;
  const path = tag.slice(sep + 1);
  return (project.namespace ?? []).find((n) => n.path === path)?.driverId;
}

/** Tag references in a piece of text: `{ds:path}` in expressions, and "ds:path" or `ns:path` quoted in script source. */
export function tagsInText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[^\w])((?:ns|[A-Za-z][\w-]*):[^\s'"`(){},;]+)/g)) out.push(m[1]!.replace(/[.]+$/, ""));
  return out;
}

/** Every tag a widget reads or writes: its bindings, its trend pens and table rows, and the references in its
 *  dynamics and events. */
export function tagsOfWidget(w: Widget): string[] {
  const tags = new Set<string>();
  for (const v of Object.values(w.bindings ?? {})) if (typeof v === "string" && v) tags.add(v);
  const props = (w.props ?? {}) as { tags?: { binding?: string }[]; rows?: { binding?: string }[] };
  for (const t of props.tags ?? []) if (t.binding) tags.add(t.binding);
  for (const r of props.rows ?? []) if (r.binding) tags.add(r.binding);
  for (const part of [w.dynamics, w.events]) {
    if (!part) continue;
    for (const m of JSON.stringify(part).matchAll(/\{((?:ns|[A-Za-z][\w-]*):[^{}"]+)\}/g)) tags.add(m[1]!);
  }
  return [...tags];
}

export type PageSummary = {
  widgets: number;
  byType: [string, number][];
  tags: string[];
  /** Widgets that have their own tablet or phone placement. */
  tablet: number;
  phone: number;
  hasScript: boolean;
  /** Widgets with driven properties, and with actions. */
  driven: number;
  acting: number;
};

export function pageSummary(page: Page): PageSummary {
  const counts = new Map<string, number>();
  const tags = new Set<string>();
  let tablet = 0, phone = 0, driven = 0, acting = 0;
  for (const w of page.widgets) {
    counts.set(w.type, (counts.get(w.type) ?? 0) + 1);
    for (const t of tagsOfWidget(w)) tags.add(t);
    if (w.layout?.tablet) tablet++;
    if (w.layout?.phone) phone++;
    if (w.dynamics && Object.keys(w.dynamics).length) driven++;
    if (w.events && Object.values(w.events).some((e) => Array.isArray(e) && e.length)) acting++;
  }
  return {
    widgets: page.widgets.length,
    byType: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    tags: [...tags].sort(),
    tablet, phone, driven, acting,
    hasScript: !!page.script?.trim(),
  };
}

export type DatasourceUsage = {
  /** Pages with widgets that use this datasource's tags, and how many such widgets. */
  pages: { id: string; name: string; widgets: number }[];
  alarms: string[];
  scripts: string[];
  /** Namespace names that point at it. */
  named: number;
  /** Calculated tags that read it. */
  calculated: number;
};

export function datasourceUsage(project: Project, dsId: string): DatasourceUsage {
  const mine = (tag: string) => datasourceOfTag(project, tag) === dsId;
  const pages = project.pages
    .map((p) => ({ id: p.id, name: p.name, widgets: p.widgets.filter((w) => tagsOfWidget(w).some(mine)).length }))
    .filter((p) => p.widgets > 0);
  const alarms = (project.alarmRules ?? []).filter((r) => tagsInText(r.expr).some(mine)).map((r) => r.name || r.id);
  const scripts = (project.scripts ?? [])
    .filter((s) => [...tagsInText(s.source), ...(s.writes ?? []), ...(s.trigger.onChange ?? [])].some(mine))
    .map((s) => s.name || s.id);
  const named = (project.namespace ?? []).filter((n) => n.driverId === dsId).length;
  const calculated = project.datasources
    .filter((d) => d.id !== dsId)
    .reduce((n, d) => n + (((d.config as { tags?: { expr: string }[] }).tags ?? []).filter((t) => tagsInText(t.expr).some(mine)).length), 0);
  return { pages, alarms, scripts, named, calculated };
}
