// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { RecipesTab } from "./RecipesTab";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";

const recipes = [
  { id: "mild", name: "Mild batch", description: "Low temperature", entries: [{ binding: "plc:Temp", value: 55 }, { binding: "plc:Speed", value: 25 }] },
  { id: "hot", name: "Hot batch", description: "", entries: [{ binding: "plc:Temp", value: 85 }] },
];
const project = (r: unknown[] = recipes): Project => ({
  schemaVersion: 6, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], recipes: r,
} as unknown as Project);

const stored = () => useProject.getState().project.recipes ?? [];
const list = () => screen.getByRole("listbox", { name: "Recipes" });
const rows = () => within(list()).getAllByRole("option");

beforeEach(() => {
  // The live-value socket is not what is tested here.
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  useWorkspace.setState({ selection: {} });
  useProject.getState().loadProject(project());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the recipe list", () => {
  it("shows each recipe's name, how many writes it makes and its description, the first one chosen", () => {
    render(<RecipesTab />);
    expect(rows().map((r) => r.textContent)).toEqual(["Mild batch2 writesLow temperature", "Hot batch1 write"]);
    expect(rows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("2 recipes")).toBeTruthy();
  });

  it("says what a recipe is when there are none, and makes one", () => {
    useProject.getState().loadProject(project([]));
    render(<RecipesTab />);
    expect(screen.getByText("No recipes yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New recipe" })[0]!);
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ name: "Recipe 1", entries: [] });
    expect(useWorkspace.getState().selection.recipes).toBe(stored()[0]!.id);
  });

  it("choosing a recipe shows its writes", () => {
    render(<RecipesTab />);
    fireEvent.click(rows()[1]!);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Hot batch");
    expect((screen.getByLabelText("Tag 1") as HTMLInputElement).value).toBe("plc:Temp");
    expect((screen.getByLabelText("Value 1") as HTMLInputElement).value).toBe("85");
    expect(screen.queryByLabelText("Tag 2")).toBeNull();
  });
});

describe("editing a recipe", () => {
  it("renames it and changes its description, in the project at once", () => {
    render(<RecipesTab />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gentle batch" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Slow" } });
    expect(stored()[0]).toMatchObject({ name: "Gentle batch", description: "Slow" });
    expect(rows()[0]!.textContent).toBe("Gentle batch2 writesSlow");
  });

  it("adds a write, sets its tag and value, and removes another", () => {
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Add write" }));
    expect(stored()[0]!.entries).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Tag 3"), { target: { value: "plc:Time" } });
    fireEvent.change(screen.getByLabelText("Value 3"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove write 1" }));
    expect(stored()[0]!.entries).toEqual([{ binding: "plc:Speed", value: 25 }, { binding: "plc:Time", value: 120 }]);
  });

  it.each<[string, unknown]>([
    ["2.5", 2.5],
    ["hot", "hot"],
    ["12abc", "12abc"],
  ])("a value typed as %j is written as %j", (typed, want) => {
    render(<RecipesTab />);
    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: typed } });
    expect(stored()[0]!.entries[0]!.value).toBe(want);
  });

  it("keeps what is typed while the field has the focus, so 2. is not turned into 2 on the way to 2.5", () => {
    render(<RecipesTab />);
    const input = () => screen.getByLabelText("Value 1") as HTMLInputElement;
    fireEvent.change(input(), { target: { value: "2." } });
    expect(input().value).toBe("2.");
    expect(stored()[0]!.entries[0]!.value).toBe(2);
    fireEvent.change(input(), { target: { value: "2.5" } });
    fireEvent.blur(input());
    expect(input().value).toBe("2.5");
  });

  it("deletes a recipe after asking", () => {
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    expect(screen.getByText("Delete “Mild batch” and its 2 writes?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(stored()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(stored().map((r) => r.id)).toEqual(["hot"]);
  });
});

describe("applying a recipe", () => {
  const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("has the runtime apply the deployed copy, and says how many writes it made", async () => {
    answer(200, { ok: true, applied: 2 });
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Apply on the runtime" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Applied 2 writes."));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toMatch(/\/api\/v1\/recipes\/mild\/apply$/);
  });

  it("says what went wrong", async () => {
    answer(207, { ok: false, applied: 1, errors: ["plc:Speed: not_confirmed"] });
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Apply on the runtime" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("plc:Speed: not_confirmed"));
  });

  it("says when the runtime does not have the recipe yet", async () => {
    answer(404, { error: "recipe not found" });
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Apply on the runtime" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/deploy the project first/));
  });

  it("a recipe with no writes cannot be applied", () => {
    useProject.getState().loadProject(project([{ id: "empty", name: "Empty", entries: [] }]));
    render(<RecipesTab />);
    expect((screen.getByRole("button", { name: "Apply on the runtime" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("each recipe keeps its own result", async () => {
    answer(200, { ok: true, applied: 2 });
    render(<RecipesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Apply on the runtime" }));
    await screen.findByRole("status");
    fireEvent.click(rows()[1]!);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
