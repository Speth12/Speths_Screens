import type { Project, Page, Datasource, AlarmRule, Recipe } from "./projectStore";
import type { AssetNode, Faceplate } from "./projectStore";
import type { RuntimeScript } from "@speths-screens/shared-types";

/** A runtime script in scripts.json; its source is in its own .js file. */
type ScriptEntry = Omit<RuntimeScript, "source"> & { file: string };

function sortedJson(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort());
    }
    return v as unknown;
  }, 2);
}

type GitFiles = Record<string, string>;

export function exportGitFormat(project: Project): GitFiles {
  // project.json holds everything not split into its own file, so nothing
  // is lost (image data stays out: images/index.json lists them).
  const {
    datasources: _ds, pages: _pages, alarmRules: _alarms, recipes: _recipes, scripts: _scripts,
    namespace, presets, images: _images, ...meta
  } = project as Project & { assets?: unknown; faceplates?: unknown };
  delete (meta as Record<string, unknown>).assets;
  delete (meta as Record<string, unknown>).faceplates;

  const files: GitFiles = {};

  files["project.json"] = sortedJson(meta);
  files["datasources.json"] = sortedJson(project.datasources ?? []);
  files["alarms.json"] = sortedJson(project.alarmRules ?? []);
  files["recipes.json"] = sortedJson(project.recipes ?? []);
  files["assets.json"] = sortedJson((project as Project & { assets?: AssetNode[] }).assets ?? []);
  files["faceplates.json"] = sortedJson((project as Project & { faceplates?: Faceplate[] }).faceplates ?? []);
  if (namespace?.length) files["namespace.json"] = sortedJson(namespace);
  if (presets?.length) files["presets.json"] = sortedJson(presets);

  // Each runtime script's source is its own .js file, so a diff reads as code.
  const used = new Set<string>();
  const entries: ScriptEntry[] = (project.scripts ?? []).map(({ source, ...rest }) => {
    const base = rest.id.replace(/[^a-zA-Z0-9_-]/g, "_") || "script";
    let file = `scripts/${base}.js`;
    for (let n = 2; used.has(file); n++) file = `scripts/${base}_${n}.js`;
    used.add(file);
    files[file] = source;
    return { ...rest, file };
  });
  if (entries.length) files["scripts.json"] = sortedJson(entries);

  for (const page of project.pages ?? []) {
    const safeName = page.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    files[`pages/${safeName}.json`] = sortedJson(page);
  }

  const imageIndex = (project.images ?? []).map((img) => ({
    id: img.id,
    name: img.name,
    mimeType: img.mimeType,
    width: img.width,
    height: img.height,
    size: img.size,
  }));
  files["images/index.json"] = sortedJson(imageIndex);

  return files;
}

export function importGitFormat(files: GitFiles): Project {
  const meta = files["project.json"] ? JSON.parse(files["project.json"]) as Partial<Project> : {};
  const datasources: Datasource[] = files["datasources.json"] ? JSON.parse(files["datasources.json"]) as Datasource[] : [];
  const alarmRules: AlarmRule[] = files["alarms.json"] ? JSON.parse(files["alarms.json"]) as AlarmRule[] : [];
  const recipes: Recipe[] = files["recipes.json"] ? JSON.parse(files["recipes.json"]) as Recipe[] : [];
  const assets: AssetNode[] = files["assets.json"] ? JSON.parse(files["assets.json"]) as AssetNode[] : [];
  const faceplates: Faceplate[] = files["faceplates.json"] ? JSON.parse(files["faceplates.json"]) as Faceplate[] : [];

  const scripts: RuntimeScript[] = files["scripts.json"]
    ? (JSON.parse(files["scripts.json"]) as ScriptEntry[]).map(({ file, ...rest }) => ({ ...rest, source: files[file] ?? "" }))
    : [];

  const namespace = files["namespace.json"] ? (JSON.parse(files["namespace.json"]) as Project["namespace"]) : undefined;
  const presets = files["presets.json"] ? (JSON.parse(files["presets.json"]) as Project["presets"]) : undefined;

  const pages: Page[] = Object.entries(files)
    .filter(([k]) => k.startsWith("pages/") && k.endsWith(".json"))
    .map(([, v]) => JSON.parse(v) as Page);

  return {
    ...meta,
    version: (meta.version as string) ?? "0.1.0",
    datasources,
    pages: pages.length ? pages : [{ id: "p1", name: "Main", widgets: [] }],
    alarmRules,
    recipes,
    assets,
    faceplates,
    ...(scripts.length ? { scripts } : {}),
    ...(namespace ? { namespace } : {}),
    ...(presets ? { presets } : {}),
  } as Project & { assets: AssetNode[]; faceplates: Faceplate[] };
}

/** The files as the one downloaded file holds them: JSON files as JSON,
 *  script sources as text. */
export function packGitFiles(files: GitFiles): Record<string, unknown> {
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.endsWith(".json") ? (JSON.parse(v) as unknown) : v]));
}

/** The files back from the downloaded file's `_files`. */
export function unpackGitFiles(packed: Record<string, unknown>): GitFiles {
  return Object.fromEntries(Object.entries(packed).map(([k, v]) => [k, k.endsWith(".json") || typeof v !== "string" ? JSON.stringify(v) : v]));
}

export function downloadGitFormat(project: Project): void {
  const files = exportGitFormat(project);
  const combined = {
    _gitFormat: true,
    _version: project.version,
    _exportedAt: new Date().toISOString(),
    _files: packGitFiles(files),
  };
  const blob = new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.name ?? "project").replace(/\s+/g, "-")}-git.json`;
  a.click();
  URL.revokeObjectURL(url);
}
