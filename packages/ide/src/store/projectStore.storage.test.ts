import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The store restores the autosaved project when it is first imported, so each
// test sets localStorage first and imports a fresh copy of the module.
const saved = {
  schemaVersion: 4, version: "1", name: "Autosaved before the rename",
  datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
};

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());

it("restores a project autosaved under the old key and moves it to the new one", async () => {
  localStorage.setItem("xhmi-project-v1", JSON.stringify(saved));
  const { useProject } = await import("./projectStore");
  expect(useProject.getState().project.name).toBe("Autosaved before the rename");
  expect(localStorage.getItem("xhmi-project-v1")).toBeNull();
  expect(JSON.parse(localStorage.getItem("speths-screens-project-v1")!).name).toBe("Autosaved before the rename");
});

it("restores a project autosaved under the new key", async () => {
  localStorage.setItem("speths-screens-project-v1", JSON.stringify({ ...saved, name: "Autosaved now" }));
  const { useProject } = await import("./projectStore");
  expect(useProject.getState().project.name).toBe("Autosaved now");
});

it("autosaves under the new key only", async () => {
  vi.useFakeTimers();
  const { useProject } = await import("./projectStore");
  useProject.getState().loadProject({ ...saved, name: "Edited" } as never);
  vi.advanceTimersByTime(1100);
  expect(JSON.parse(localStorage.getItem("speths-screens-project-v1")!).name).toBe("Edited");
  expect(localStorage.getItem("xhmi-project-v1")).toBeNull();
});
