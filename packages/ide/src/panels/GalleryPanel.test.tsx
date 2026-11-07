import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject, type Project } from "../store/projectStore";
import { GalleryPanel, insertGalleryWidget } from "./GalleryPanel";

afterEach(cleanup);

const project = (more: Partial<Project> = {}): Project => ({
  schemaVersion: 6, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...more,
});
const widgets = () => useProject.getState().project.pages[0]!.widgets;

beforeEach(() => useProject.getState().loadProject(project()));

describe("GalleryPanel", () => {
  it("clicking a cell adds that widget with its sample settings", () => {
    render(<GalleryPanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("gallery-gauge-critical"));
    expect(widgets()).toHaveLength(1);
    expect(widgets()[0]).toMatchObject({ type: "gauge", w: 4, h: 3, props: { min: 0, max: 100, unit: "%" } });
    expect(widgets()[0]).not.toHaveProperty("dynamics");
  });

  it("the slider sets the value numeric widgets show", () => {
    render(<GalleryPanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Simulated value"), { target: { value: "17" } });
    expect(screen.getByTestId("gallery-numericDisplay-normal").textContent).toContain("17");
  });
});

describe("insertGalleryWidget", () => {
  it("places the widget below everything on a grid page", () => {
    useProject.getState().loadProject(project({ pages: [{ id: "p1", name: "Main", widgets: [{ id: "a", type: "led", x: 0, y: 0, w: 2, h: 5 }] }] }));
    const [w] = insertGalleryWidget("tank");
    expect(w).toMatchObject({ type: "tank", x: 0, y: 5, w: 2, h: 4 });
  });
  it("converts the size on a pixel page", () => {
    useProject.getState().loadProject(project({ canvasSnap: "pixel" }));
    const [w] = insertGalleryWidget("gauge", { x: 40, y: 30 });
    expect(w).toMatchObject({ type: "gauge", x: 40, y: 30 });
    expect(w!.w).toBeGreaterThan(4); // grid units became pixels
  });
  it("an unknown type inserts nothing", () => {
    expect(insertGalleryWidget("nope")).toEqual([]);
  });
});
