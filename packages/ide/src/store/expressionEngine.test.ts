import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculatedTag } from "@speths-screens/shared-types";
import { useProject, type Project } from "./projectStore";
import { EVAL_INTERVAL_MS, bootExpressionEngine } from "./expressionEngine";
import { virtualTagStore } from "./virtualTagStore";

const project = (tags: CalculatedTag[]): Project => ({
  schemaVersion: 4, version: "1", pages: [{ id: "p1", name: "Main", widgets: [] }],
  datasources: [{ id: "sim", type: "virtual", label: "Sim", config: { tags } }],
});

beforeAll(() => bootExpressionEngine());
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  useProject.getState().loadProject(project([]));
  vi.useRealTimers();
});

const state = (path: string) => virtualTagStore.get(`sim:${path}`);

describe("calculated tags in the IDE", () => {
  it.each([
    ["arithmetic", "2 * 21", 42, "Good", undefined],
    ["text", "format(3.14159, 2) + ' bar'", "3.14 bar", "Good", undefined],
    ["division by zero", "1 / 0", undefined, "Bad", "division by zero"],
    ["missing input", "{sim:nothing} + 1", undefined, "Bad", "input {sim:nothing} has no value"],
    ["does not compile", "if(1, 2, 3)", undefined, "Bad", "unknown function if at column 1"],
  ])("%s", (_name, expr, value, quality, reason) => {
    useProject.getState().loadProject(project([{ path: "out", expr }]));
    vi.advanceTimersByTime(EVAL_INTERVAL_MS);
    expect(state("out")).toMatchObject({ value, quality, ...(reason ? { reason } : {}) });
  });

  it("starts a tag that reads itself with good() and counts on every interval", () => {
    useProject.getState().loadProject(project([
      { path: "phase", expr: "(good({sim:phase}) ? {sim:phase} : 0) + 1" },
      { path: "double", expr: "{sim:phase} * 2" },
    ]));
    for (const want of [1, 2, 3]) {
      vi.advanceTimersByTime(EVAL_INTERVAL_MS);
      expect(state("phase")?.value).toBe(want);
    }
    vi.advanceTimersByTime(EVAL_INTERVAL_MS);
    expect(state("double")).toMatchObject({ value: 6, quality: "Good" });
  });

  it("keeps the last value while an input is Bad", () => {
    useProject.getState().loadProject(project([{ path: "src", expr: "5" }, { path: "copy", expr: "{sim:src} * 2" }]));
    vi.advanceTimersByTime(2 * EVAL_INTERVAL_MS);
    expect(state("copy")).toMatchObject({ value: 10, quality: "Good" });
    virtualTagStore.set("sim:src", 5, "Bad", "no answer");
    vi.advanceTimersByTime(EVAL_INTERVAL_MS);
    expect(state("copy")).toMatchObject({ value: 10, quality: "Bad", reason: "input {sim:src} is Bad" });
  });
});
