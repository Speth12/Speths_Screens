// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { CustomWidgetsTab } from "./CustomWidgetsTab";
import { Canvas } from "./Canvas";
import { Properties } from "./Properties";
import { WidgetPalette } from "./Palette";
import { useProject } from "../store/projectStore";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";
import { useDrafts } from "../store/drafts";
import { useSelection } from "../store/selection";

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  useDrafts.setState({ entries: {} });
  useWorkspace.setState({ selection: {}, activeId: "customWidgets" });
  useSelection.getState().set([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
}
const cw = () => useProject.getState().project.customWidgets![0]!;
const parts = () => cw().widgets.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const list = () => screen.getByRole("listbox", { name: "Custom widgets" });
const editOnCanvas = () => fireEvent.click(screen.getByRole("button", { name: "Edit on the canvas" }));

describe("the list", () => {
  it("shows each custom widget with its parameters, parts and where it is used, the first one chosen", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    const row = within(list()).getAllByRole("option")[0]!;
    expect(row.textContent).toBe("Pump card1 parameter · 3 parts · used 1 time");
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("1 custom widget")).toBeTruthy();
    expect(screen.getByText("Used on: Main.")).toBeTruthy();
  });

  it("says what a custom widget is when there are none, and makes one with a designed size, open on the canvas", () => {
    useProject.getState().loadProject({ ...project("grid", []), customWidgets: [] });
    render(<CustomWidgetsTab />);
    expect(screen.getByText("No custom widgets yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New custom widget" })[0]!);
    const cws = useProject.getState().project.customWidgets!;
    expect(cws).toHaveLength(1);
    expect(cws[0]).toMatchObject({ name: "Custom widget 1", params: [], widgets: [], width: 480, height: 120 });
    expect(useWorkspace.getState().selection.customWidgets).toBe(cws[0]!.id);
    expect(useProject.getState().activePageId).toBe(`cw:${cws[0]!.id}`);
    expect(useWorkspace.getState().activeId).toBe(SCREEN_TAB.id);
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

describe("opening it on the canvas", () => {
  it("a pixel project's parts stay as they are, and its size is the one it is used at", () => {
    open(project("pixel", PUMP, { w: 300, h: 160 }));
    editOnCanvas();
    expect(cw()).toMatchObject({ width: 300, height: 160 });
    expect(parts()).toEqual(PUMP);
    expect(useProject.getState().activePageId).toBe("cw:cw");
    expect(useWorkspace.getState().activeId).toBe(SCREEN_TAB.id);
  });

  it("a grid project's parts are turned from cells into pixels", () => {
    open(project("grid", [{ x: 1, y: 0, w: 2, h: 2 }], { w: 4, h: 3 }));
    editOnCanvas();
    // 4 by 3 cells of 88 by 72 is 344 by 208; a part at column 1, 2 by 2 cells, is at 88 and 168 by 136.
    expect(cw()).toMatchObject({ width: 344, height: 208 });
    expect(parts()).toEqual([{ x: 88, y: 0, w: 168, h: 136 }]);
  });

  it("one that is used nowhere gets the box around its parts, at least 160 by 64", () => {
    open(project("pixel", [{ x: 0, y: 0, w: 40, h: 20 }]));
    editOnCanvas();
    expect(cw()).toMatchObject({ width: 160, height: 64 });
  });

  it("a stack is edited here, not on the canvas", () => {
    const p = project("pixel", PUMP);
    p.customWidgets![0]!.layout = { mode: "stack", direction: "row" };
    open(p);
    expect(screen.queryByRole("button", { name: "Edit on the canvas" })).toBeNull();
    expect(screen.getByLabelText("Layout mode")).toBeTruthy();
  });

  it("can be laid out as a stack instead", () => {
    open(project("pixel", PUMP));
    fireEvent.click(screen.getByRole("button", { name: "Lay it out as a stack instead" }));
    save();
    expect(cw().layout).toMatchObject({ mode: "stack", direction: "row" });
  });
});

/** A pointer event at a position; jsdom's events take no position of their own. */
function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element | Window, x: number, y: number) {
  const ev = createEvent[type](target as Element, { button: 0, bubbles: true });
  Object.defineProperty(ev, "clientX", { value: x });
  Object.defineProperty(ev, "clientY", { value: y });
  Object.defineProperty(ev, "button", { value: 0 });
  act(() => { fireEvent(target as Element, ev); });
}

describe("on the canvas, it is edited like a page", () => {
  const onCanvas = () => {
    useProject.getState().loadProject(project("pixel", PUMP, { w: 300, h: 160 }));
    useProject.getState().openCustomWidgetOnCanvas("cw");
    render(<><Canvas /><Properties /><WidgetPalette /></>);
  };
  const box = (id: string) => document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)!;

  it("shows its parts in its own box, says what is being edited, and goes back to the page", () => {
    onCanvas();
    expect(["p0", "p1", "p2"].every((id) => box(id))).toBe(true);
    expect(screen.getByTestId("custom-widget-bar").textContent).toContain("Pump card");
    expect(screen.getByTestId("custom-widget-bar").textContent).toContain("300 × 160 px");
    expect(screen.queryByTestId("frame-header")).toBeNull(); // no header or navigation around it
    fireEvent.click(screen.getByRole("button", { name: "Back to Main" }));
    expect(useProject.getState().activePageId).toBe("p1");
  });

  it("a drag moves a part, written to the custom widget, one undo step", () => {
    onCanvas();
    pointer("pointerDown", box("p0"), 20, 20);
    pointer("pointerMove", window, 60, 44);
    pointer("pointerUp", window, 60, 44);
    expect(parts()[0]).toEqual({ x: 56, y: 32, w: 80, h: 72 });
    act(() => useProject.getState().undo());
    expect(parts()[0]).toEqual(PUMP[0]);
  });

  it("with nothing selected the properties are the custom widget's: its size and parameters", () => {
    onCanvas();
    fireEvent.change(screen.getByLabelText("Width (px)"), { target: { value: "1280" } });
    expect(cw().width).toBe(300); // kept when the field is left
    fireEvent.blur(screen.getByLabelText("Width (px)"));
    expect(cw().width).toBe(1280);
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 2 name"), { target: { value: "speed" } });
    expect(cw().params).toEqual([{ name: "run" }, { name: "speed" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove parameter 1" }));
    expect(cw().params).toEqual([{ name: "speed" }]);
  });

  it("the width can be cleared and typed again, and only a size in range is kept", () => {
    onCanvas();
    const width = screen.getByLabelText("Width (px)") as HTMLInputElement;
    fireEvent.change(width, { target: { value: "" } });
    expect(width.value).toBe("");          // it was "stuck at the last digit" before
    fireEvent.change(width, { target: { value: "1" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(cw().width).toBe(300);          // 1 px is not a size: refused, the field goes back
    expect(width.value).toBe("300");
    fireEvent.change(width, { target: { value: "640" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(cw().width).toBe(640);
  });

  it("says when parts lie outside the box, and makes the box fit them", () => {
    onCanvas();
    expect(screen.queryByText(/outside the box/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Height (px)"), { target: { value: "100" } });
    fireEvent.blur(screen.getByLabelText("Height (px)"));
    expect(screen.getByText(/1 part lies outside the box/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Make the box fit its parts" }));
    expect(cw()).toMatchObject({ width: 300, height: 148 }); // the parts reach 288 by 148
    expect(screen.queryByText(/outside the box/)).toBeNull();
  });

  it("is drawn on the canvas at its own width, not at least a desktop's", () => {
    onCanvas();
    expect(screen.getByTestId("screen-frame").style.minWidth).toBe("");
    expect(document.querySelector<HTMLElement>("[data-canvas-page]")!.style.width).toBe("300px");
  });

  it("a selected part has anchors", () => {
    onCanvas();
    act(() => useSelection.getState().set(["p2"]));
    fireEvent.change(screen.getByLabelText("Across"), { target: { value: "stretch" } });
    fireEvent.change(screen.getByLabelText("Down"), { target: { value: "bottom" } });
    expect(cw().widgets[2]).toMatchObject({ localId: "p2", anchorX: "stretch", anchorY: "bottom" });
    fireEvent.change(screen.getByLabelText("Across"), { target: { value: "left" } });
    expect(cw().widgets[2]!.anchorX).toBeUndefined();
  });

  it("the palette adds a part to it, in pixels, with any widget type", () => {
    onCanvas();
    fireEvent.click(screen.getByRole("button", { name: /Page list$/ }));
    const added = cw().widgets[3]!;
    expect(added.type).toBe("pageList");
    expect(added.localId).toBeTruthy();
    expect(added.w).toBeGreaterThan(20); // pixels, not cells
  });
});

describe("its name and description are a draft, saved or reverted", () => {
  it("renames it and describes it, and refuses a blank name", () => {
    open(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }]));
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pump tile" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A pump" } });
    save();
    expect(cw()).toMatchObject({ name: "Pump tile", description: "A pump" });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "" } });
    save();
    expect(cw().description).toBeUndefined();
  });

  it("an unsaved name survives the tab being closed and opened again, and Revert gives it up", () => {
    open(project("pixel", PUMP));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pump tile" } });
    cleanup();
    render(<CustomWidgetsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Pump tile");
    expect(within(list()).getAllByRole("option")[0]!.textContent).toContain("unsaved");
    expect(cw().name).toBe("Pump card");
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Pump card");
  });

  it("is given up when the custom widget changed somewhere else in the meantime", () => {
    open(project("pixel", PUMP));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pump tile" } });
    cleanup();
    useProject.getState().updateCustomWidget("cw", { name: "Renamed by a pull" });
    render(<CustomWidgetsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Renamed by a pull");
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

describe("placing it on a page", () => {
  it("choosing it gives the placement its designed size, and a resized one can go back to it", () => {
    const p = project("pixel", PUMP);
    p.customWidgets![0]!.width = 300; p.customWidgets![0]!.height = 160;
    p.pages[0]!.widgets = [{ id: "i1", type: "customWidget", x: 10, y: 10, w: 344, h: 136 } as never];
    useProject.getState().loadProject(p);
    useProject.getState().selectWidget("i1");
    render(<Properties />);
    fireEvent.change(screen.getByLabelText("Custom widget"), { target: { value: "cw" } });
    const placed = () => useProject.getState().project.pages[0]!.widgets[0]!;
    expect(placed()).toMatchObject({ x: 10, y: 10, w: 300, h: 160 });
    act(() => useProject.getState().updateWidget("p1", "i1", { w: 600, h: 320 }));
    fireEvent.click(screen.getByRole("button", { name: "Use its designed size" }));
    expect(placed()).toMatchObject({ w: 300, h: 160 });
  });
});
