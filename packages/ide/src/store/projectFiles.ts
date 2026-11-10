// Getting a project in and out of the editor as files: save, open (a project file or a Git export),
// and the two exports. The menu, the toolbar and Ctrl+S all call these, so there is one of each.
import { useProject } from "./projectStore";
import { openProject, openSummary } from "./openProject";
import { importGitFormat, unpackGitFiles, downloadGitFormat } from "./gitFormat";
import { generateStandaloneHtml, ideLook } from "./exportHtml";
import { tagStoreClient } from "./tagStoreClient";
import { say } from "./editorStatus";

/** A project's name as a file name: spaces become dashes. */
export const fileStem = (name: string | undefined): string => (name ?? "project").trim().replace(/\s+/g, "-") || "project";

function download(content: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Saves the project as `<name>.screens.json`. */
export function saveProjectFile(): void {
  const { project, exportJSON } = useProject.getState();
  const name = `${fileStem(project.name)}.screens.json`;
  download(exportJSON(), "application/json", name);
  say(`saved ${name}`);
}

/** Opens a project from text: a project file, or the Git export (a file that packs several). */
export function openProjectText(text: string, fileName: string): void {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { say(`could not open ${fileName}: not JSON`); return; }
  try {
    const packed = raw as Record<string, unknown>;
    const incoming = packed && packed._gitFormat ? importGitFormat(unpackGitFiles(packed._files as Record<string, unknown>)) : raw;
    const o = openProject(incoming);
    if (o.ok) useProject.getState().loadProject(o.project);
    say(openSummary(fileName, o));
  } catch (e) {
    say(`could not open ${fileName}: ${(e as Error).message}`);
  }
}

/** Asks for a file and opens it as a project. */
export function openProjectFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openProjectText(String(reader.result), file.name);
    reader.readAsText(file);
  };
  input.click();
}

/** A static snapshot of every page, with the values the editor has now. */
export async function exportHtmlFile(): Promise<void> {
  const { project } = useProject.getState();
  const html = await generateStandaloneHtml(project, { ...ideLook(project.theme), tag: (p) => tagStoreClient.get(p), exportedAt: new Date() });
  const name = `${fileStem(project.name)}.html`;
  download(html, "text/html", name);
  say(`exported ${name}`);
}

/** The project as the files a Git repository holds. */
export function exportGitFiles(): void {
  downloadGitFormat(useProject.getState().project);
  say("exported the project as Git files");
}
