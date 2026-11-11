// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { NamespaceList, TAG_BINDING_MIME } from "./NamespaceList";
import { useProject } from "../store/projectStore";

beforeEach(() => {
  // The live-value socket is not what is tested here.
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const load = (namespace: unknown[]) => useProject.getState().loadProject({
  schemaVersion: 6, version: "1", datasources: [], pages: [{ id: "p", name: "Main", widgets: [] }], namespace,
} as unknown as Project);

const NS = [
  { path: "Counter", type: "tag", driverId: "mem", driverAddr: "Counter" },
  { path: "Plant", type: "folder" },
  { path: "Plant.Pump1", type: "folder" },
  { path: "Plant.Pump1.Running", type: "tag", driverId: "mem", driverAddr: "Running" },
  { path: "Plant.Level", type: "tag", driverId: "mem", driverAddr: "Level" },
];

/** A drag as the browser makes it: the data a dragged element puts on the DataTransfer. */
function drag(el: HTMLElement) {
  const data: Record<string, string> = {};
  fireEvent.dragStart(el, { dataTransfer: { setData: (t: string, v: string) => { data[t] = v; }, effectAllowed: "" } });
  return data;
}

describe("NamespaceList", () => {
  it("says how to get variables here when there are none, and opens the Variables tab", () => {
    load([]);
    const open = vi.fn();
    render(<NamespaceList onOpenVariables={open} />);
    expect(screen.getByText(/No named variables yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Variables" }));
    expect(open).toHaveBeenCalled();
  });

  it("shows the namespace as a tree: folders before variables, each by name", () => {
    load(NS);
    render(<NamespaceList onOpenVariables={() => {}} />);
    const tree = screen.getByRole("tree", { name: "Named variables" });
    // Top level: the Plant folder, then the Counter variable; Plant starts open.
    const top = Array.from(tree.children).filter((c) => c.getAttribute("role") === "treeitem").map((c) => c.getAttribute("aria-label"));
    expect(top).toEqual(["Plant", "Counter"]);
    expect(within(tree).getByRole("treeitem", { name: "Level" })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "Pump1" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens and closes a folder", () => {
    load(NS);
    render(<NamespaceList onOpenVariables={() => {}} />);
    expect(screen.queryByRole("treeitem", { name: "Running" })).toBeNull();
    fireEvent.click(within(screen.getByRole("treeitem", { name: "Pump1" })).getAllByRole("button")[0]!);
    expect(screen.getByRole("treeitem", { name: "Running" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("treeitem", { name: "Pump1" })).getAllByRole("button")[0]!);
    expect(screen.queryByRole("treeitem", { name: "Running" })).toBeNull();
  });

  it("a variable is dragged as its ns: binding, the type the canvas binds a dropped widget from", () => {
    load(NS);
    render(<NamespaceList onOpenVariables={() => {}} />);
    const data = drag(screen.getByRole("treeitem", { name: "Counter" }));
    expect(TAG_BINDING_MIME).toBe("text/x-tag-binding");
    expect(data[TAG_BINDING_MIME]).toBe("ns:Counter");
    expect(drag(screen.getByRole("treeitem", { name: "Level" }))[TAG_BINDING_MIME]).toBe("ns:Plant.Level");
  });

  it("a variable is draggable and a folder is not", () => {
    load(NS);
    render(<NamespaceList onOpenVariables={() => {}} />);
    expect(screen.getByRole("treeitem", { name: "Counter" }).getAttribute("draggable")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "Plant" }).getAttribute("draggable")).toBeNull();
  });

  it("follows the project: a variable named later appears", () => {
    load([NS[0]]);
    render(<NamespaceList onOpenVariables={() => {}} />);
    expect(screen.queryByRole("treeitem", { name: "Level" })).toBeNull();
    load(NS);
    return screen.findByRole("treeitem", { name: "Level" });
  });
});
