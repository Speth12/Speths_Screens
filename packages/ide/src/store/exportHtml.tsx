// HTML export: a static snapshot of every page, drawn by the shared widget
// library (Phase 2 step 7). One file, no scripts: the IDE's CSS and theme
// inlined, each widget showing the value the IDE had when it was exported.
// The live view is the operator screen; an exported file cannot reach a
// runtime (its origin is "null", and it cannot log in).
import type { CSSProperties } from "react";
import {
  EMPTY_TAG, WidgetHostProvider, WidgetRenderer, inertHost,
  type TagState, type WidgetHost,
} from "@speths-screens/widgets";
import type { Page, Project, Widget } from "./projectStore";

// The canvas grid (Canvas.tsx): a cell and the gap after it.
const COL_W = 80, ROW_H = 64, GAP = 8;

export type Snapshot = {
  /** The value the IDE has for a tag path, if any. */
  tag: (path: string) => TagState | undefined;
  /** The CSS the widgets are drawn with (the IDE's stylesheets). */
  css: string;
  /** Inline style and attributes of the IDE's <html>, which carry the theme. */
  root?: { style?: string; className?: string; attrs?: Record<string, string> };
  exportedAt: Date;
};

/** A host that serves the snapshot's values and the project's images and faceplates; it writes nothing. */
export function snapshotHost(project: Project, tag: Snapshot["tag"]): WidgetHost {
  const get = (p: string | undefined) => (p ? tag(p) ?? EMPTY_TAG : EMPTY_TAG);
  return {
    ...inertHost,
    useTag: get,
    useTags: (paths) => Object.fromEntries(paths.map((p) => [p, get(p)])),
    useImage: (id) => project.images?.find((i) => i.id === id)?.dataUrl,
    useFaceplate: (id) => (id ? project.faceplates?.find((f) => f.id === id) : undefined),
  };
}

/** Where a widget sits on its page, in pixels, as the IDE canvas draws it. */
export function placement(w: Widget, pixel: boolean): { left: number; top: number; width: number; height: number } {
  if (pixel) return { left: w.x ?? 0, top: w.y ?? 0, width: w.w, height: w.h };
  return {
    left: (w.x ?? 0) * (COL_W + GAP),
    top: (w.y ?? 0) * (ROW_H + GAP),
    width: w.w * (COL_W + GAP) - GAP,
    height: w.h * (ROW_H + GAP) - GAP,
  };
}

function PageSnapshot({ page, pixel }: { page: Page; pixel: boolean }) {
  const boxes = page.widgets.map((w) => [w, placement(w, pixel)] as const);
  const width = Math.max(COL_W, ...boxes.map(([, b]) => b.left + b.width));
  const height = Math.max(ROW_H, ...boxes.map(([, b]) => b.top + b.height));
  const stage: CSSProperties = { position: "relative", width, height, background: page.backgroundColor || undefined };
  return (
    <section id={`page-${page.id}`} className="snapshot-page">
      <h2 className="snapshot-title">{page.name}</h2>
      {page.widgets.length === 0
        ? <p className="snapshot-empty">No widgets on this page.</p>
        : (
          <div style={stage}>
            {boxes.map(([w, b]) => (
              <div key={w.id} style={{ position: "absolute", ...b }}>
                <WidgetRenderer w={w} />
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

function Snapshot({ project, exportedAt }: { project: Project; exportedAt: Date }) {
  const pixel = project.canvasSnap === "pixel";
  return (
    <>
      <header className="snapshot-header">
        <h1>{project.name || "Speth's Screens"}</h1>
        <p>
          Snapshot of {project.pages.length} page{project.pages.length === 1 ? "" : "s"}, exported {exportedAt.toLocaleString()}.
          Values are what the IDE showed at that moment; for live values open the operator screen.
        </p>
        {project.pages.length > 1 && (
          <nav>{project.pages.map((p) => <a key={p.id} href={`#page-${p.id}`}>{p.name}</a>)}</nav>
        )}
      </header>
      <main>
        {project.pages.map((p) => <PageSnapshot key={p.id} page={p} pixel={pixel} />)}
      </main>
    </>
  );
}

const SNAPSHOT_CSS = `
body{margin:0;padding:16px;background:var(--background,#09090b);color:var(--foreground,#e4e4e7);font-family:system-ui,sans-serif}
.snapshot-header{margin-bottom:16px}
.snapshot-header h1{font-size:18px;margin:0 0 4px}
.snapshot-header p{font-size:12px;opacity:.7;margin:0 0 8px}
.snapshot-header nav{display:flex;flex-wrap:wrap;gap:6px}
.snapshot-header nav a{font-size:12px;padding:3px 10px;border-radius:999px;background:rgba(127,127,127,.2);color:inherit;text-decoration:none}
.snapshot-page{margin-bottom:32px;overflow-x:auto}
.snapshot-title{font-size:14px;margin:0 0 8px;opacity:.85}
.snapshot-empty{font-size:12px;opacity:.6;font-style:italic}
@media print{.snapshot-page{break-after:page}.snapshot-header nav{display:none}}
`;

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The exported page: every page of the project, drawn by the widget library, as one static HTML file. */
export async function generateStandaloneHtml(project: Project, snap: Snapshot): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(
    <WidgetHostProvider value={snapshotHost(project, snap.tag)}>
      <Snapshot project={project} exportedAt={snap.exportedAt} />
    </WidgetHostProvider>,
  );
  const r = snap.root ?? {};
  const rootAttrs = [
    r.className ? ` class="${attr(r.className)}"` : "",
    r.style ? ` style="${attr(r.style)}"` : "",
    ...Object.entries(r.attrs ?? {}).map(([k, v]) => (/^data-[a-z-]+$/.test(k) ? ` ${k}="${attr(v)}"` : "")),
  ].join("");
  // A stylesheet must not be able to end the <style> element early.
  const css = (snap.css + SNAPSHOT_CSS).replace(/<\/style/gi, "<\\/style");
  return `<!DOCTYPE html>
<html lang="en"${rootAttrs}>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${text(project.name || "Speth's Screens")}</title>
<style>${css}</style>
</head>
<body>${body}</body>
</html>
`;
}

/** The IDE's own CSS and theme, for the snapshot to be drawn with. Browser only. */
export function ideLook(): Pick<Snapshot, "css" | "root"> {
  const css = Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n"); }
    catch { return ""; } // a sheet from another origin cannot be read
  }).join("\n");
  const el = document.documentElement;
  const attrs = Object.fromEntries(Array.from(el.attributes).filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value]));
  return { css, root: { style: el.getAttribute("style") ?? undefined, className: el.className || undefined, attrs } };
}
