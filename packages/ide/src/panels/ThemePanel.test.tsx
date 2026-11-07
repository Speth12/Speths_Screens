import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject, type Project } from "../store/projectStore";
import { ThemePanel } from "./ThemePanel";

afterEach(cleanup);

const project = (more: Partial<Project> = {}): Project => ({
  schemaVersion: 6, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], ...more,
});
const theme = () => useProject.getState().project.theme;

beforeEach(() => useProject.getState().loadProject(project()));

describe("ThemePanel", () => {
  it("choosing a preset sets it and clears earlier changes", () => {
    useProject.getState().setTheme({ preset: "calm", corners: "round" });
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("preset-modern"));
    expect(theme()).toEqual({ preset: "modern" });
  });

  it("changing one element keeps the preset and the other elements", () => {
    useProject.getState().setTheme({ preset: "clean", font: "roboto" });
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Corners"), { target: { value: "square" } });
    expect(theme()).toEqual({ preset: "clean", font: "roboto", corners: "square" });
  });

  it("'Theme's own' puts an element back to the preset's", () => {
    useProject.getState().setTheme({ preset: "clean", corners: "square" });
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Corners"), { target: { value: "" } });
    expect(theme()).toEqual({ preset: "clean" });
  });

  it("an element chosen on a project with no theme starts from the calm preset", () => {
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Light or dark"), { target: { value: "dark" } });
    expect(theme()).toEqual({ preset: "calm", mode: "dark" });
  });

  it("the accent color is kept, and reset removes it", () => {
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#ff8800" } });
    expect(theme()?.accent).toBe("#ff8800");
    fireEvent.click(screen.getByText("reset"));
    expect(theme()?.accent).toBeUndefined();
  });

  it("is undoable", () => {
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("preset-clean"));
    useProject.getState().undo();
    expect(theme()).toBeUndefined();
  });
});

describe("ThemePanel navigation", () => {
  const nav = () => useProject.getState().project.shell;
  beforeEach(() => useProject.getState().loadProject(project({
    pages: [{ id: "p1", name: "Main", widgets: [] }, { id: "p2", name: "Pumps", widgets: [] }],
  })));

  it("sets the navigation style, and the default removes it", () => {
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Navigation style"), { target: { value: "sidebar" } });
    expect(nav()).toEqual({ nav: "sidebar" });
    fireEvent.change(screen.getByLabelText("Navigation style"), { target: { value: "" } });
    expect(nav()).toBeUndefined();
  });

  it("sets a page's icon and group, and clearing removes them", () => {
    render(<ThemePanel onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Icon for Pumps"), { target: { value: "pump" } });
    fireEvent.change(screen.getByLabelText("Group for Pumps"), { target: { value: "Process" } });
    expect(useProject.getState().project.pages[1]).toMatchObject({ icon: "pump", group: "Process" });
    fireEvent.change(screen.getByLabelText("Icon for Pumps"), { target: { value: "" } });
    expect(useProject.getState().project.pages[1]!.icon).toBeUndefined();
  });
});
