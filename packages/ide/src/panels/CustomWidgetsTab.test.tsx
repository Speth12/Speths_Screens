// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { CustomWidgetsTab } from "./CustomWidgetsTab";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";
import { useDrafts } from "../store/drafts";

beforeEach(() => {
  useDrafts.setState({ entries: {} });
  useWorkspace.setState({ selection: {} });
});
afterEach(cleanup);

type Part = { x: number; y: number; w: number; h: number };

/** A project with one free-layout custom widget, the feature tour's pump card. */
const project = (snap: "pixel" | "grid", parts: Part[], placed?: { w: number; h: number }, extra: Partial<Project> = {}): Project => ({
  schemaVersion: 6,
  version: "0.1.0",
  canvasSnap: snap,
  datasources: [],
  pages: [{ id: "p1", name: "Main", widgets: placed ? [{ id: "i1", type: "customWidget", x: 0, y: 0, ...placed, props: { customWidgetId: "cw" } }] : [] }],
  customWidgets: [{
    id: "cw", name: "Pump card", params: [{ name: "run" }],
    widgets: parts.map((p, i) => ({ localId: `p${i}`, type: i === 2 ? "button" : "led", ...p })),
  }],
  ...extra,
} as unknown as Project);

const PUMP: Part[] = [{ x: 12, y: 8, w: 80, h: 72 }, { x: 104, y: 8, w: 184, h: 72 }, { x: 12, y: 90, w: 276, h: 58 }];

function open(p: Project) {
  useProject.getState().loadProject(p);
  render(<CustomWidgetsTab />);
  return view();
}
function view() {
  const canvas = screen.getByTestId("custom-widget-canvas");
  const px = (v: string) => parseFloat(v);
  const box = { w: px(canvas.style.width), h: px(canvas.style.height) };
  const parts = Array.from(canvas.querySelectorAll<HTMLElement>("[data-part]")).map((el) => ({
    el, left: px(el.style.left), top: px(el.style.top), right: px(el.style.left) + px(el.style.width), bottom: px(el.style.top) + px(el.style.height),
  }));
  return { canvas, box, parts };
}
const widgets = () => useProject.getState().project.customWidgets![0]!.widgets.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const list = () => screen.getByRole("listbox", { name: "Custom widgets" });

describe("the list", () => {
  it("shows each custom widget with its parameters, parts and where it is used, the first one chosen", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    const row = within(list()).getAllByRole("option")[0]!;
    expect(row.textContent).toBe("Pump card1 parameter · 3 parts · used 1 time");
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("1 custom widget")).toBeTruthy();
    expect(screen.getByText("Used on: Main.")).toBeTruthy();
  });

  it("says what a custom widget is when there are none, and makes one", () => {
    useProject.getState().loadProject({ ...project("grid", []), customWidgets: [] });
    render(<CustomWidgetsTab />);
    expect(screen.getByText("No custom widgets yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New custom widget" })[0]!);
    const cws = useProject.getState().project.customWidgets!;
    expect(cws).toHaveLength(1);
    expect(cws[0]).toMatchObject({ name: "Custom widget 1", params: [{ name: "prefix" }], widgets: [] });
    expect(useWorkspace.getState().selection.customWidgets).toBe(cws[0]!.id);
  });

  it("choosing another custom widget opens it", () => {
    const p = project("grid", [{ x: 0, y: 0, w: 2, h: 2 }]);
    p.customWidgets!.push({ id: "b", name: "Toolbar", params: [], widgets: [] });
    open(p);
    fireEvent.click(within(list()).getAllByRole("option")[1]!);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Toolbar");
    expect(screen.getByText("Not used anywhere yet.")).toBeTruthy();
  });
});

describe("the canvas", () => {
  it("draws a pixel project's parts inside the box, at the size the widget has on a page", () => {
    const { box, parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    expect(box).toEqual({ w: 600, h: 320 }); // 300 by 160 px at twice the size
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeLessThanOrEqual(box.w);
      expect(p.bottom).toBeLessThanOrEqual(box.h);
    }
    expect(screen.getByText("300 × 160 px, the size it has on a page — drag to place")).toBeTruthy();
  });

  it("still draws a grid project on 12 by 8 cells", () => {
    const { box, parts } = open(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 3, h: 2 }, { x: 0, y: 2, w: 5, h: 1 }]));
    expect(box).toEqual({ w: 864, h: 576 });
    expect(parts[1]!.left).toBe(2 * 72 + 2);
    expect(screen.getByText("12 × 8 grid — drag to place")).toBeTruthy();
  });

  it("a click on a part selects it and shows its properties, a click on the canvas deselects", () => {
    const { canvas, parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    expect(screen.queryByLabelText("X")).toBeNull();
    fireEvent.mouseDown(parts[0]!.el, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    fireEvent.click(parts[0]!.el);
    expect((screen.getByLabelText("X") as HTMLInputElement).value).toBe("12");
    fireEvent.click(canvas);
    expect(screen.queryByLabelText("X")).toBeNull();
  });
});

describe("editing is a draft", () => {
  it("opening changes nothing, and Save and Revert wait for a change", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Revert" }) as HTMLButtonElement).disabled).toBe(true);
    expect(widgets()).toEqual(PUMP);
  });

  it("a drag moves a pixel part by pixels of the widget, in the draft until Save", () => {
    const { parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[0]!.el, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 }); // 40 by 20 on screen, at twice the size
    fireEvent.mouseUp(window);
    expect(widgets()[0]).toEqual({ x: 12, y: 8, w: 80, h: 72 });
    expect(within(list()).getAllByRole("option")[0]!.textContent).toContain("unsaved");
    expect(screen.getByText(/Your changes are not saved\./)).toBeTruthy();
    save();
    expect(widgets()[0]).toEqual({ x: 32, y: 18, w: 80, h: 72 });
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Revert gives the changes up", () => {
    const { parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[0]!.el, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 });
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(view().parts[0]!.left).toBe(12 * 2 + 2);
    expect(widgets()).toEqual(PUMP);
  });

  it("the position fields are in pixels and keep the part inside the box", () => {
    const { parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[0]!.el, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    fireEvent.click(parts[0]!.el);
    expect(screen.getByText("X (px)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "5000" } });
    save();
    expect(widgets()[0]).toEqual({ x: 220, y: 8, w: 80, h: 72 });
  });

  it("a part added in a pixel project starts at a size in pixels", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.click(screen.getByRole("button", { name: "LED" }));
    save();
    expect(widgets()[3]).toEqual({ x: 0, y: 0, w: 168, h: 136 }); // 2 by 2 cells of the page grid
  });

  it("a removed part is gone after Save", () => {
    const { parts } = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[2]!.el, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    fireEvent.click(parts[2]!.el);
    fireEvent.click(screen.getByRole("button", { name: "Remove part" }));
    save();
    expect(widgets()).toEqual(PUMP.slice(0, 2));
  });

  it("renames it and describes it, and refuses a blank name", () => {
    open(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }]));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pump tile" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A pump" } });
    save();
    expect(useProject.getState().project.customWidgets![0]).toMatchObject({ name: "Pump tile", description: "A pump" });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "" } });
    save();
    expect(useProject.getState().project.customWidgets![0]!.description).toBeUndefined();
  });

  it("adds and removes parameters, and a new part starts bound to the first", () => {
    open(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }]));
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 2 name"), { target: { value: "speed" } });
    fireEvent.click(screen.getByRole("button", { name: "Numeric" }));
    save();
    const cw = useProject.getState().project.customWidgets![0]!;
    expect(cw.params).toEqual([{ name: "run" }, { name: "speed" }]);
    expect(cw.widgets[1]).toMatchObject({ type: "numericDisplay", bindings: { value: "{run}" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove parameter 1" }));
    save();
    expect(useProject.getState().project.customWidgets![0]!.params).toEqual([{ name: "speed" }]);
  });

  it("changing the layout to a stack is saved with it", () => {
    open(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }]));
    fireEvent.change(screen.getByLabelText("Layout mode"), { target: { value: "stack" } });
    save();
    expect(useProject.getState().project.customWidgets![0]!.layout).toMatchObject({ mode: "stack", direction: "row" });
  });
});

describe("unsaved edits", () => {
  it("survive the tab being closed and opened again", () => {
    const first = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(first.parts[0]!.el, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 });
    fireEvent.mouseUp(window);
    cleanup();
    render(<CustomWidgetsTab />);
    expect(view().parts[0]!.left).toBe(32 * 2 + 2);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false);
    expect(widgets()[0]).toEqual({ x: 12, y: 8, w: 80, h: 72 });
  });

  it("are given up when the custom widget changed somewhere else in the meantime", () => {
    const first = open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(first.parts[0]!.el, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 });
    fireEvent.mouseUp(window);
    cleanup();
    useProject.getState().updateCustomWidget("cw", { name: "Renamed by a pull" });
    render(<CustomWidgetsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Renamed by a pull");
    expect(view().parts[0]!.left).toBe(12 * 2 + 2);
  });
});

describe("deleting", () => {
  it("asks first and says where it is used", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Deleting this leaves an empty box where it is used: Main.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(useProject.getState().project.customWidgets).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByText(/Deleting this leaves/).closest("div")!.parentElement!).getByRole("button", { name: "Delete" }));
    expect(useProject.getState().project.customWidgets ?? []).toHaveLength(0);
  });

  it("names the other places it is used: inside another custom widget and on a screen edge", () => {
    const p = project("grid", [], undefined, { shell: { frame: [{ id: "s", customWidgetId: "cw", edge: "top" }] } as unknown as Project["shell"] });
    p.customWidgets!.push({ id: "outer", name: "Outer", params: [], widgets: [{ localId: "a", type: "customWidget", x: 0, y: 0, w: 1, h: 1, props: { customWidgetId: "cw" } }] } as never);
    open(p);
    expect(screen.getByText("Used on: inside Outer, pinned to a screen edge.")).toBeTruthy();
  });
});
