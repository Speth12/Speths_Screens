// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { RecipesTab } from "./RecipesTab";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";

const base = (extra: Record<string, unknown>): Project => ({
  schemaVersion: 6, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...extra,
} as unknown as Project);

const sets = () => useProject.getState().project.recipeSets ?? [];

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  useWorkspace.setState({ selection: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("recipe sets in the Recipes tab", () => {
  it("makes a set, adds variables and a shipped recipe, and fills in a value", () => {
    useProject.getState().loadProject(base({}));
    render(<RecipesTab />);
    fireEvent.click(screen.getAllByRole("button", { name: "New recipe set" })[0]!);
    expect(sets()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Variable 1 tag" }), { target: { value: "ns:Speed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Variable 1 max" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add recipe" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Recipe 1, ns:Speed" }), { target: { value: "42" } });

    const s = sets()[0]!;
    expect(s.variables).toEqual([{ binding: "ns:Speed", max: 100 }]);
    expect(s.recipes).toHaveLength(1);
    expect(s.recipes![0]!.values).toEqual({ "ns:Speed": 42 });
  });

  it("keeps a recipe's values when a variable is pointed at another tag, and drops them when it is removed", () => {
    useProject.getState().loadProject(base({ recipeSets: [{ id: "s", name: "Mixer", variables: [{ binding: "ns:A" }, { binding: "ns:B" }], recipes: [{ id: "r", name: "Slow", values: { "ns:A": 1, "ns:B": 2 } }] }] }));
    render(<RecipesTab />);
    fireEvent.change(screen.getByRole("textbox", { name: "Variable 1 tag" }), { target: { value: "ns:C" } });
    expect(sets()[0]!.recipes![0]!.values).toEqual({ "ns:C": 1, "ns:B": 2 });
    fireEvent.click(screen.getByRole("button", { name: "Remove variable 2" }));
    expect(sets()[0]!.variables.map((v) => v.binding)).toEqual(["ns:C"]);
    expect(sets()[0]!.recipes![0]!.values).toEqual({ "ns:C": 1 });
  });

  it("warns about a variable with no tag", () => {
    useProject.getState().loadProject(base({ recipeSets: [{ id: "s", name: "Mixer", variables: [{ binding: "" }], recipes: [] }] }));
    render(<RecipesTab />);
    expect(screen.getByRole("alert").textContent).toMatch(/no tag chosen/);
  });

  it("deleting a set asks first", () => {
    useProject.getState().loadProject(base({ recipeSets: [{ id: "s", name: "Mixer", variables: [], recipes: [] }] }));
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Delete recipe set" }));
    expect(sets()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(sets()).toHaveLength(0);
  });

  it("turns an older recipe into a set of one recipe", () => {
    useProject.getState().loadProject(base({ recipes: [{ id: "old", name: "Hot", entries: [{ binding: "plc:Temp", value: 85 }, { binding: "", value: 0 }] }] }));
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Convert to a recipe set" }));
    expect(useProject.getState().project.recipes ?? []).toHaveLength(0);
    const s = sets()[0]!;
    expect(s.name).toBe("Hot");
    expect(s.variables).toEqual([{ binding: "plc:Temp" }]);
    expect(s.recipes![0]!.values).toEqual({ "plc:Temp": 85 });
  });
});
