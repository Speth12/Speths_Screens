import { expect, it } from "vitest";
import { exportGitFormat, importGitFormat, packGitFiles, unpackGitFiles } from "./gitFormat";
import type { Project } from "./projectStore";

const project = {
  schemaVersion: 4,
  version: "1.0.0",
  name: "Line",
  datasources: [],
  pages: [{ id: "p1", name: "Main", widgets: [] }],
  scriptRole: "engineer",
  sessionVars: [{ name: "shift", type: "int", initial: 1 }],
  scripts: [
    { id: "count", name: "Count", trigger: { every: 1000 }, source: "state.n = (state.n ?? 0) + 1;\n" },
    { id: "a b", name: "Spaced", trigger: { onStart: true }, source: "log('a b')" },
    { id: "a_b", name: "Underscore", trigger: { onStart: true }, source: "log('a_b')" },
  ],
} as unknown as Project;

it("writes each runtime script as its own .js file and reads them back", () => {
  const files = exportGitFormat(project);
  expect(files["scripts/count.js"]).toBe("state.n = (state.n ?? 0) + 1;\n");
  expect(files["scripts/a_b.js"]).toBe("log('a b')");
  expect(files["scripts/a_b_2.js"]).toBe("log('a_b')");
  expect(files["scripts.json"]).not.toContain("state.n");

  const back = importGitFormat(files);
  expect(back.scripts).toEqual(project.scripts);
  expect(back.schemaVersion).toBe(4);
  expect(back.scriptRole).toBe("engineer");
  expect(back.sessionVars).toEqual(project.sessionVars);
});

it("a project without scripts writes no scripts.json", () => {
  const files = exportGitFormat({ ...project, scripts: undefined } as Project);
  expect(Object.keys(files).filter((k) => k.startsWith("scripts"))).toEqual([]);
  expect(importGitFormat(files).scripts).toBeUndefined();
});

it("keeps the whole project through the downloaded file", () => {
  const full = {
    ...project,
    theme: "high-performance",
    security: { mode: "login" },
    historian: { retentionDays: 30 },
    namespace: [{ path: "Line1", type: "folder" }],
    presets: [{ id: "ps", name: "Pump", widgets: [] }],
    alarmRules: [], recipes: [], assets: [], udts: [], faceplates: [],
  } as unknown as Project;
  const downloaded = JSON.parse(JSON.stringify({ _gitFormat: true, _files: packGitFiles(exportGitFormat(full)) })) as { _files: Record<string, unknown> };
  expect(downloaded._files["scripts/count.js"]).toBe("state.n = (state.n ?? 0) + 1;\n");
  const back = importGitFormat(unpackGitFiles(downloaded._files));
  expect(back).toEqual(full);
});
