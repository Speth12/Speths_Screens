// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportGitFiles, fileStem, openProjectText, saveProjectFile } from "./projectFiles";
import { exportGitFormat, packGitFiles } from "./gitFormat";
import { useProject } from "./projectStore";
import { useEditorStatus } from "./editorStatus";

let downloads: { name: string; blob: Blob }[] = [];
const said = () => useEditorStatus.getState().message;

beforeEach(() => {
  downloads = [];
  let last: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { last = b as Blob; return "blob:test"; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: last! });
  });
  useEditorStatus.setState({ message: "" });
  useProject.getState().newProject();
});
afterEach(() => vi.restoreAllMocks());

const valid = (name: string) => ({ schemaVersion: 6, version: "1.0.0", name, datasources: [], pages: [{ id: "p", name: "Main", widgets: [] }] });

describe("fileStem", () => {
  it.each<[string | undefined, string]>([
    ["Pump Station", "Pump-Station"],
    ["  a  b  ", "a-b"],
    ["plain", "plain"],
    [undefined, "project"],
    ["", "project"],
    ["   ", "project"],
  ])("%j is %j", (name, want) => expect(fileStem(name)).toBe(want));
});

describe("saveProjectFile", () => {
  it("downloads the project as <name>.screens.json and says so", async () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: "Pump Station" });
    saveProjectFile();
    expect(downloads.map((d) => d.name)).toEqual(["Pump-Station.screens.json"]);
    expect(JSON.parse(await downloads[0]!.blob.text()).name).toBe("Pump Station");
    expect(said()).toBe("saved Pump-Station.screens.json");
  });

  it("names an unnamed project 'project'", () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: undefined });
    saveProjectFile();
    expect(downloads[0]!.name).toBe("project.screens.json");
  });
});

describe("openProjectText", () => {
  it("opens a project file and says so", () => {
    openProjectText(JSON.stringify(valid("Opened")), "opened.json");
    expect(useProject.getState().project.name).toBe("Opened");
    expect(said()).toBe("opened opened.json");
  });

  it("opens a Git export, which packs several files in one", () => {
    const files = exportGitFormat({ ...useProject.getState().project, name: "From Git" });
    openProjectText(JSON.stringify({ _gitFormat: true, _files: packGitFiles(files) }), "x-git.json");
    expect(useProject.getState().project.name).toBe("From Git");
    expect(said()).toMatch(/^opened x-git\.json/);
  });

  it("says when a file is not JSON, and keeps the project it has", () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: "Keep me" });
    openProjectText("{ not json", "bad.json");
    expect(said()).toBe("could not open bad.json: not JSON");
    expect(useProject.getState().project.name).toBe("Keep me");
  });

  it("says why a file that is JSON but not a project is refused, and keeps the project it has", () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: "Keep me" });
    openProjectText(JSON.stringify({ hello: "world" }), "other.json");
    expect(said()).toMatch(/^could not open other\.json: /);
    expect(useProject.getState().project.name).toBe("Keep me");
  });

  it("says when a Git export is damaged", () => {
    openProjectText(JSON.stringify({ _gitFormat: true }), "broken-git.json");
    expect(said()).toMatch(/^could not open broken-git\.json/);
  });

  it("lists the upgrade notes of an older project", () => {
    const v1 = { version: "1", name: "Old", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [
      { id: "g", type: "gauge", x: 0, y: 0, w: 2, h: 2, binding: "plc:T", config: { min: 0, decimals: 2 } },
    ] }] };
    openProjectText(JSON.stringify(v1), "old.json");
    expect(useProject.getState().project.name).toBe("Old");
    expect(said()).toMatch(/^opened old\.json, upgraded \(1 note: /);
  });
});

describe("exportGitFiles", () => {
  it("downloads the project as a Git export and says so", () => {
    useProject.getState().loadProject({ ...useProject.getState().project, name: "Pump Station" });
    exportGitFiles();
    expect(downloads.map((d) => d.name)).toEqual(["Pump-Station-git.json"]);
    expect(said()).toBe("exported the project as Git files");
  });
});
