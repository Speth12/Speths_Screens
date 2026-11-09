import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { PagesTab } from "./PagesTab";
import { useProject } from "../store/projectStore";
import { PAGES_TAB, SCREEN_TAB, useWorkspace } from "../store/workspace";

afterEach(cleanup);
beforeEach(() => useWorkspace.setState({ tabs: [SCREEN_TAB, PAGES_TAB], activeId: PAGES_TAB.id }));

const project = (): Project => ({
  schemaVersion: 6, version: "0.1.0", datasources: [],
  pages: [
    { id: "a", name: "Overview", group: "Plant", widgets: [{ id: "w1", type: "gauge", x: 0, y: 0, w: 2, h: 2, bindings: { value: "plc:A" }, groupId: "g1" }, { id: "w2", type: "led", x: 2, y: 0, w: 1, h: 1, groupId: "g1" }] },
    { id: "b", name: "Trends", widgets: [] },
    { id: "c", name: "Alarms", widgets: [] },
  ],
});
const names = () => useProject.getState().project.pages.map((p) => p.name);
const card = (name: string) => screen.getByLabelText(`Page ${name}`);

it("shows each page with its widgets and tags", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(within(card("Overview")).getByText("2 widgets")).toBeTruthy();
  expect(within(card("Overview")).getByText("1 tag")).toBeTruthy();
  expect(within(card("Trends")).getByText("0 widgets")).toBeTruthy();
  fireEvent.click(within(card("Overview")).getByText(/What is on it/));
  expect(within(card("Overview")).getByText("1 gauge")).toBeTruthy();
});

it("Open selects the page and goes back to the screen", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  fireEvent.click(within(card("Trends")).getByText("Open"));
  expect(useProject.getState().activePageId).toBe("b");
  expect(useWorkspace.getState().activeId).toBe("screen");
});

it("renames, sets a group and an icon", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  fireEvent.click(within(card("Trends")).getByText("Rename"));
  const input = within(card("Trends")).getByLabelText("Page name");
  fireEvent.change(input, { target: { value: "Charts" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(names()).toEqual(["Overview", "Charts", "Alarms"]);
  const group = within(card("Charts")).getByLabelText("Group");
  fireEvent.change(group, { target: { value: "Plant" } });
  fireEvent.blur(group);
  fireEvent.change(within(card("Charts")).getByLabelText("Icon"), { target: { value: "graph" } });
  const p = useProject.getState().project.pages[1]!;
  expect([p.group, p.icon]).toEqual(["Plant", "graph"]);
});

it("copies a page after itself with new widget ids and new groups", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  fireEvent.click(within(card("Overview")).getByText("Copy"));
  const pages = useProject.getState().project.pages;
  expect(pages.map((p) => p.name)).toEqual(["Overview", "Overview copy", "Trends", "Alarms"]);
  const [orig, copy] = [pages[0]!, pages[1]!];
  expect(copy.id).not.toBe(orig.id);
  expect(copy.widgets.map((w) => w.id).some((id) => orig.widgets.some((o) => o.id === id))).toBe(false);
  expect(new Set(copy.widgets.map((w) => w.groupId)).size).toBe(1);
  expect(copy.widgets[0]!.groupId).not.toBe(orig.widgets[0]!.groupId);
  expect(copy.widgets[0]!.bindings).toEqual({ value: "plc:A" });
});

it("moves pages in the navigation order; the ends cannot move past the ends", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  expect((within(card("Overview")).getByLabelText("Move Overview earlier") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(card("Overview")).getByLabelText("Move Overview later"));
  expect(names()).toEqual(["Trends", "Overview", "Alarms"]);
  expect((within(card("Alarms")).getByLabelText("Move Alarms later") as HTMLButtonElement).disabled).toBe(true);
});

it("deleting asks first, and the last page cannot be deleted", () => {
  useProject.getState().loadProject({ ...project(), pages: project().pages.slice(0, 2) });
  render(<PagesTab />);
  fireEvent.click(screen.getByLabelText("Delete Trends"));
  expect(names()).toEqual(["Overview", "Trends"]);
  fireEvent.click(within(card("Trends")).getByText("Delete"));
  expect(names()).toEqual(["Overview"]);
  expect((screen.getByLabelText("Delete Overview") as HTMLButtonElement).disabled).toBe(true);
});

it("a new page starts from the template chosen", () => {
  useProject.getState().loadProject(project());
  render(<PagesTab />);
  fireEvent.click(screen.getByText("+ Add page"));
  fireEvent.click(screen.getByText(/Blank/));
  expect(useProject.getState().project.pages).toHaveLength(4);
});
