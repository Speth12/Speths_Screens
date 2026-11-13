// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { Canvas } from "./Canvas";
import { NamespaceList, TAG_BINDING_MIME } from "./NamespaceList";
import { useProject } from "../store/projectStore";

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const load = (widgets: unknown[], canvasSnap?: "pixel") => useProject.getState().loadProject({
  schemaVersion: 7, version: "1", canvasSnap, datasources: [{ id: "mem", label: "Script state", type: "memory", config: { memoryTags: [{ path: "Counter", type: "int" }] } }],
  namespace: [{ path: "Counter", type: "tag", driverId: "mem", driverAddr: "Counter" }],
  pages: [{ id: "p1", name: "Main", widgets }],
} as unknown as Project);

const widgetsNow = () => useProject.getState().project.pages[0]!.widgets;

/** What a drag from the namespace list puts on the DataTransfer. */
function dragFromList(name: string): DataTransfer {
  const data: Record<string, string> = {};
  const types: string[] = [];
  const dataTransfer = { types, setData: (t: string, v: string) => { data[t] = v; types.push(t); }, getData: (t: string) => data[t] ?? "", effectAllowed: "" } as unknown as DataTransfer;
  fireEvent.dragStart(screen.getByRole("treeitem", { name }), { dataTransfer });
  return dataTransfer;
}

describe("dropping a variable from the left panel on a widget", () => {
  it("binds the widget under the drop to the variable by its name", () => {
    load([{ id: "n1", type: "numericDisplay", x: 0, y: 0, w: 3, h: 2 }, { id: "b1", type: "button", x: 4, y: 0, w: 3, h: 2 }]);
    render(<><NamespaceList onOpenVariables={() => {}} /><Canvas /></>);
    const dataTransfer = dragFromList("Counter");
    expect(dataTransfer.getData(TAG_BINDING_MIME)).toBe("ns:Counter");

    // The canvas works out the cell from the pointer: cells are 80 by 64 pixels with an 8 pixel gap, so x = 370 is column 4 (the
    // button) and y = 20 is row 0. (jsdom measures every box as zero, so the pointer position is the position in the grid.)
    const canvas = document.querySelector("div.bg-zinc-950.select-none.relative")!;
    expect(canvas).toBeTruthy();
    // jsdom has no DragEvent, so the pointer position is put on the event by hand.
    const drop = createEvent.drop(canvas, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 370 });
    Object.defineProperty(drop, "clientY", { value: 20 });
    fireEvent(canvas, drop);
    expect(widgetsNow().find((w) => w.id === "b1")?.bindings?.value).toBe("ns:Counter");
    expect(widgetsNow().find((w) => w.id === "n1")?.bindings?.value).toBeUndefined();
  });
});

describe("a drop that is not on a widget", () => {
  it("binds nothing", () => {
    load([{ id: "b1", type: "button", x: 0, y: 0, w: 3, h: 2 }]);
    render(<><NamespaceList onOpenVariables={() => {}} /><Canvas /></>);
    const dataTransfer = dragFromList("Counter");
    const canvas = document.querySelector("div.bg-zinc-950.select-none.relative")!;
    const drop = createEvent.drop(canvas, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 900 }); // far to the right of the only widget
    Object.defineProperty(drop, "clientY", { value: 20 });
    fireEvent(canvas, drop);
    expect(widgetsNow()[0]!.bindings?.value).toBeUndefined();
  });

  it("is a drag the list makes only for variables, not folders", () => {
    useProject.getState().loadProject({
      schemaVersion: 7, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
      namespace: [{ path: "Plant", type: "folder" }, { path: "Plant.Level", type: "tag", driverId: "mem", driverAddr: "Level" }],
    } as unknown as Project);
    render(<NamespaceList onOpenVariables={() => {}} />);
    expect(screen.getByRole("treeitem", { name: "Plant" }).getAttribute("draggable")).toBeNull();
    expect(screen.getByRole("treeitem", { name: "Level" }).getAttribute("draggable")).toBe("true");
  });
});
