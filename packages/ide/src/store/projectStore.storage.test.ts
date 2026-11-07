import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The store restores the autosaved project when it is first imported, so each
// test sets localStorage first and imports a fresh copy of the module.
const saved = {
  schemaVersion: 5, version: "1", name: "Autosaved",
  datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
};

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());

it("restores an autosaved project", async () => {
  localStorage.setItem("speths-screens-project-v1", JSON.stringify({ ...saved, name: "Autosaved now" }));
  const { useProject } = await import("./projectStore");
  expect(useProject.getState().project.name).toBe("Autosaved now");
});

it("autosaves a project", async () => {
  vi.useFakeTimers();
  const { useProject } = await import("./projectStore");
  useProject.getState().loadProject({ ...saved, name: "Edited" } as never);
  vi.advanceTimersByTime(1100);
  expect(JSON.parse(localStorage.getItem("speths-screens-project-v1")!).name).toBe("Edited");
});
