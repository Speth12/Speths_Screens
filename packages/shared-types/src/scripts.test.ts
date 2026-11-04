// The format 4 checks shared with Go (testdata/format4/problems.json, read
// by internal/project/scripts_test.go too).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expressionProblems } from "./expressions";
import { syntaxProblem } from "./scripts";
import type { Project } from "./project";

const cases = JSON.parse(readFileSync(resolve(__dirname, "../../../testdata/format4/problems.json"), "utf8")) as
  { name: string; project: Partial<Project>; want: string[] }[];

describe("format 4 problems", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const p = { schemaVersion: 4, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...c.project } as Project;
    expect(expressionProblems(p)).toEqual(c.want);
  });
});

// Worded by acorn; the line and column match Go's (goja) for the same source.
describe("syntaxProblem", () => {
  it.each([
    ["log(1)", ""],
    ["await writeTag('mem:A', 1)", ""],
    ["if (x > 1) return;", ""],
    ["", ""],
    ["if (x {", "line 1, column 7: Unexpected token"],
    ["log(1)\nconst = 3", "line 2, column 7: Unexpected token"],
  ])("%j", (src, want) => expect(syntaxProblem(src)).toBe(want));
});
