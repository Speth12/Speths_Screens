// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { useSelection } from "../store/selection";
import { PALETTE_DRAG } from "../store/newWidget";
import { ObjectList } from "./ObjectList";
import { WidgetPalette } from "./Palette";
import { Canvas } from "./Canvas";

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  useSelection.getState().set([]);
  useProject.getState().loadProject({
    schemaVersion: 7, version: "1", canvasSnap: "pixel", datasources: [],
    pages: [{ id: "p1", name: "Main", widgets: [
      { id: "a", type: "textDisplay", x: 10, y: 20, w: 100, h: 40, props: { label: "Tank level" } },
      { id: "b", type: "shape", x: 200, y: 60, w: 50, h: 80 },
      { id: "c", type: "gauge", x: 400, y: 5, w: 30, h: 30, props: { label: "Pressure" } },
    ] }],
  } as unknown as Project);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const widgets = () => useProject.getState().project.pages[0]!.widgets;
const place = (id: string) => { const w = widgets().find((x) => x.id === id)!; return { x: w.x, y: w.y, w: w.w, h: w.h }; };
const item = (name: string) => screen.getByRole("option", { name: new RegExp(name) });
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("the object list", () => {
  it("lists every widget, the one drawn on top first, by its label or else its type", () => {
    render(<ObjectList />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Pressure", "Shape", "Tank level"]);
  });

  it("a click selects, Ctrl+click adds, and the page's selection is the same one", () => {
    render(<ObjectList />);
    fireEvent.click(item("Tank level"));
    expect(useSelection.getState().ids).toEqual(["a"]);
    expect(useProject.getState().selectedWidgetId).toBe(null); // the canvas syncs it when it is on screen
    fireEvent.click(item("Pressure"), { ctrlKey: true });
    expect(useSelection.getState().ids).toEqual(["a", "c"]);
    expect(item("Pressure").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(item("Pressure"), { ctrlKey: true });
    expect(useSelection.getState().ids).toEqual(["a"]);
  });

  it("buttons that need a selection, or several, are off until there is one", () => {
    render(<ObjectList />);
    expect(button("Bring to front").disabled).toBe(true);
    fireEvent.click(item("Tank level"));
    expect(button("Bring to front").disabled).toBe(false);
    expect(button("Align left edges").disabled).toBe(true);
    fireEvent.click(item("Shape"), { ctrlKey: true });
    expect(button("Align left edges").disabled).toBe(false);
    expect(button("Space evenly, left to right").disabled).toBe(true); // three needed
  });

  it("brings the selection to the front and back", () => {
    render(<ObjectList />);
    fireEvent.click(item("Tank level"));
    fireEvent.click(button("Bring to front"));
    expect(widgets().map((w) => w.id)).toEqual(["b", "c", "a"]);
    fireEvent.click(button("Send to back"));
    expect(widgets().map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("aligns, and sizes like the first one selected", () => {
    render(<ObjectList />);
    fireEvent.click(item("Shape"));
    fireEvent.click(item("Tank level"), { ctrlKey: true });
    fireEvent.click(button("Align top edges"));
    expect(place("b").y).toBe(20);
    fireEvent.click(button("Same size as the first one selected"));
    expect(place("a")).toMatchObject({ w: 50, h: 80 });
  });

  it("groups and ungroups; a click on a grouped widget selects its group", () => {
    render(<ObjectList />);
    fireEvent.click(item("Tank level"));
    fireEvent.click(item("Shape"), { ctrlKey: true });
    fireEvent.click(button("Group the selected widgets"));
    const g = widgets().find((w) => w.id === "a")!.groupId;
    expect(g).toBeTruthy();
    expect(widgets().find((w) => w.id === "b")!.groupId).toBe(g);
    act(() => useSelection.getState().set([]));
    fireEvent.click(item("Shape"));
    expect(useSelection.getState().ids.sort()).toEqual(["a", "b"]);
    fireEvent.click(button("Ungroup"));
    expect(widgets().every((w) => !w.groupId)).toBe(true);
  });

  it("locks and unlocks the selection", () => {
    render(<ObjectList />);
    fireEvent.click(item("Pressure"));
    fireEvent.click(button("Lock in place"));
    expect(widgets().find((w) => w.id === "c")!.locked).toBe(true);
    expect(within(item("Pressure")).getByLabelText("locked")).toBeTruthy();
    fireEvent.click(button("Unlock"));
    expect(widgets().find((w) => w.id === "c")!.locked).toBeUndefined();
  });
});

describe("adding a widget from the palette", () => {
  it("a click adds it and selects it", () => {
    render(<WidgetPalette />);
    fireEvent.click(screen.getByRole("button", { name: /Numeric$/ }));
    const added = widgets()[widgets().length - 1]!;
    expect(added.type).toBe("numericDisplay");
    expect(useSelection.getState().ids).toEqual([added.id]);
  });

  it("can be dragged, and the page puts it where it is dropped", () => {
    render(<><WidgetPalette /><Canvas /></>);
    const data: Record<string, string> = {};
    const types: string[] = [];
    const dataTransfer = { types, setData: (t: string, v: string) => { data[t] = v; types.push(t); }, getData: (t: string) => data[t] ?? "", effectAllowed: "" } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByRole("button", { name: /Numeric$/ }), { dataTransfer });
    expect(data[PALETTE_DRAG]).toBe("numericDisplay");
    // jsdom measures every box as zero, so the pointer position is the position on the page.
    const canvas = document.querySelector("[data-canvas-scroll]")!;
    const over = createEvent.dragOver(canvas, { dataTransfer });
    fireEvent(canvas, over);
    expect(over.defaultPrevented).toBe(true);
    const drop = createEvent.drop(canvas, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 333 });
    Object.defineProperty(drop, "clientY", { value: 205 });
    fireEvent(canvas, drop);
    const added = widgets()[widgets().length - 1]!;
    expect(added.type).toBe("numericDisplay");
    expect({ x: added.x, y: added.y }).toEqual({ x: 336, y: 208 });
    expect(useSelection.getState().ids).toEqual([added.id]);
  });
});
