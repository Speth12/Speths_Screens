import type { Project, Page, Datasource, AlarmRule, Recipe, ImageAsset } from "./projectStore";
import type { UDT, AssetNode, Faceplate } from "./projectStore";

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
  const meta = {
    version: project.version,
    name: project.name,
    pin: project.pin,
    viewOnly: project.viewOnly,
    canvasResolution: project.canvasResolution,
    canvasSnap: project.canvasSnap,
    enabledSymbolPacks: project.enabledSymbolPacks,
  };

  const files: GitFiles = {};

  files["project.json"] = sortedJson(meta);
  files["datasources.json"] = sortedJson(project.datasources ?? []);
  files["alarms.json"] = sortedJson(project.alarmRules ?? []);
  files["recipes.json"] = sortedJson(project.recipes ?? []);
  files["assets.json"] = sortedJson((project as Project & { assets?: AssetNode[] }).assets ?? []);
  files["udts.json"] = sortedJson((project as Project & { udts?: UDT[] }).udts ?? []);
  files["faceplates.json"] = sortedJson((project as Project & { faceplates?: Faceplate[] }).faceplates ?? []);

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
  const udts: UDT[] = files["udts.json"] ? JSON.parse(files["udts.json"]) as UDT[] : [];
  const faceplates: Faceplate[] = files["faceplates.json"] ? JSON.parse(files["faceplates.json"]) as Faceplate[] : [];

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
    udts,
    faceplates,
  } as Project & { assets: AssetNode[]; udts: UDT[]; faceplates: Faceplate[] };
}

export function downloadGitFormat(project: Project): void {
  const files = exportGitFormat(project);
  const combined = {
    _gitFormat: true,
    _version: project.version,
    _exportedAt: new Date().toISOString(),
    _files: Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, JSON.parse(v) as unknown])
    ),
  };
  const blob = new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.name ?? "project").replace(/\s+/g, "-")}-git.json`;
  a.click();
  URL.revokeObjectURL(url);
}
