import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PresetList, SavePresetDialog } from "./Presets";
import { WidgetPalette } from "./Palette";
import { useProject, type Project, type Widget } from "../store/projectStore";

afterEach(cleanup);

const start: Widget = {
  id: "s1", type: "button", x: 3, y: 2, w: 2, h: 1, props: { label: "Start" },
  bindings: { value: "ns:plant.start" }, events: { onPress: [{ type: "write", value: 1 }] },
};
const project = (more: Partial<Project> = {}): Project => ({
  schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [start] }], ...more,
});
const widgets = () => useProject.getState().project.pages[0]!.widgets;

beforeEach(() => useProject.getState().loadProject(project()));

describe("saving and inserting a preset", () => {
  it("saves widgets as a project preset and inserts a copy below the page", () => {
    render(<SavePresetDialog widgets={[start]} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Name, e.g. Pump control"), { target: { value: "Pump start" } });
    fireEvent.click(screen.getByText("Save"));
    const saved = useProject.getState().project.presets!;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Pump start", widgets: [{ x: 0, y: 0, bindings: { value: "ns:plant.start" } }] });
    cleanup();

    render(<PresetList />);
    fireEvent.click(screen.getByText("Pump start"));
    const ws = widgets();
    expect(ws).toHaveLength(2);
    expect(ws[1]).toMatchObject({ type: "button", x: 0, y: 3, props: { label: "Start" }, bindings: { value: "ns:plant.start" }, events: start.events });
    expect(ws[1]!.id).not.toBe("s1");
  });

  it("inserting a preset is one undo step", () => {
    render(<PresetList />);
    fireEvent.click(screen.getByText("Start/Stop pair"));
    expect(widgets()).toHaveLength(3);
    useProject.getState().undo();
    expect(widgets()).toHaveLength(1);
  });

  it("a saved project with presets still follows schema.json", async () => {
    const { validateProject } = await import("../store/validateProject");
    render(<SavePresetDialog widgets={[start]} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Name, e.g. Pump control"), { target: { value: "P" } });
    fireEvent.click(screen.getByText("Save"));
    expect(validateProject(useProject.getState().project)).toEqual([]);
  });

  it("will not save without a name", () => {
    render(<SavePresetDialog widgets={[start]} onClose={() => {}} />);
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the preset list", () => {
  const mine = { id: "mine", name: "Mine", widgets: [{ ...start, x: 0, y: 0 }] };

  it("renames and deletes the project's presets, not the built-in ones", () => {
    useProject.getState().loadProject(project({ presets: [mine] }));
    render(<PresetList />);
    expect(screen.queryByLabelText("Delete Start/Stop pair")).toBeNull();
    fireEvent.click(screen.getByLabelText("Rename Mine"));
    const input = screen.getByLabelText("New name for Mine");
    fireEvent.change(input, { target: { value: "Pump" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useProject.getState().project.presets![0]!.name).toBe("Pump");
    fireEvent.click(screen.getByLabelText("Delete Pump"));
    expect(useProject.getState().project.presets).toBeUndefined();
  });

  it("is under the widgets in the palette", () => {
    render(<WidgetPalette />);
    expect(screen.getByText("Presets")).toBeTruthy();
    expect(screen.getByText("Tank with level")).toBeTruthy();
  });

  it("a palette widget on a pixel canvas gets a pixel size", () => {
    useProject.getState().loadProject(project({ canvasSnap: "pixel", pages: [{ id: "p1", name: "Main", widgets: [] }] }));
    render(<WidgetPalette />);
    fireEvent.click(screen.getByText("Button"));
    expect(widgets()[0]!.w).toBeGreaterThan(40);
  });
});
