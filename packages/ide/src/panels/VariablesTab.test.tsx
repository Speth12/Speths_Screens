import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { VariablesTab, NODE_MIME, VAR_MIME } from "./VariablesTab";
import { Workspace } from "./Workspace";
import { useProject } from "../store/projectStore";
import { SCREEN_TAB, VARIABLES_TAB, useWorkspace } from "../store/workspace";

/** A node of the namespace tree, by its name (the variable list shows names too). */
const treeNode = (name: string) => screen.getByText(name, { selector: "[title='Double-click to rename']" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => useWorkspace.setState({ tabs: [SCREEN_TAB], activeId: SCREEN_TAB.id }));

const base = (dsIds: string[] = ["plc"]): Project => ({
  schemaVersion: 6,
  version: "0.1.0",
  datasources: dsIds.map((id) => ({ id, label: id.toUpperCase(), type: "rest", config: {} }) as unknown as Project["datasources"][number]),
  pages: [{ id: "p1", name: "Main", widgets: [{ id: "g1", type: "gauge", x: 0, y: 0, w: 2, h: 2 }] }],
});

const TAGS: Record<string, { Path: string; Writable?: boolean }[]> = {
  plc: [{ Path: "Arp.Plc.Eclr/rTemp" }, { Path: "Arp.Plc.Eclr/xRun", Writable: true }],
  opc: [{ Path: "ns=6;s=Arp.Plc.Eclr/Main.iA" }, { Path: "ns=6;s=Arp.Plc.Eclr/Main.iB" }, { Path: "ns=6;s=Arp.Plc.Eclr/Other.rC" }],
};
/** A runtime that browses the datasources above and records what is posted to its namespace. */
const runtime = (posts: unknown[], namespaceUp = true) => vi.fn(async (url: string, init?: RequestInit) => {
  const m = /\/datasources\/([^/]+)\/(tags|status)$/.exec(url);
  if (m && m[2] === "tags") return new Response(JSON.stringify(TAGS[m[1]!] ?? []));
  if (m) return new Response(JSON.stringify({ connected: true, lastError: "", tagCount: 2 }));
  if (url.endsWith("/namespace")) {
    posts.push(JSON.parse(init!.body as string));
    if (!namespaceUp) throw new Error("Failed to fetch");
    return new Response("{}");
  }
  return new Response("[]");
});
const gaugeValue = () => useProject.getState().project.pages[0]!.widgets[0]!.bindings?.value;
const nsPaths = () => (useProject.getState().project.namespace ?? []).map((n) => n.path).sort();
const dt = (mime: string, data: string) => ({ dataTransfer: { types: [mime], getData: (t: string) => (t === mime ? data : "") } });

it("lists every variable of every datasource in one flat list", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject(base(["plc", "opc"]));
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/rTemp");
  expect(screen.getByText("ns=6;s=Arp.Plc.Eclr/Main.iA")).toBeTruthy();
  expect(screen.getByText(/5 from 2 datasources/)).toBeTruthy();
});

it("search, datasource, writable and no-name filters narrow the list", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject({ ...base(["plc", "opc"]), namespace: [{ path: "t", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }] });
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/rTemp");
  fireEvent.change(screen.getByLabelText("Search variables"), { target: { value: "main.ib" } });
  expect(screen.getByText("ns=6;s=Arp.Plc.Eclr/Main.iB")).toBeTruthy();
  expect(screen.queryByText("ns=6;s=Arp.Plc.Eclr/Main.iA")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search variables"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Datasource", { selector: "section select" }), { target: { value: "plc" } });
  expect(screen.queryByText("ns=6;s=Arp.Plc.Eclr/Main.iA")).toBeNull();
  fireEvent.click(screen.getByLabelText("No name yet"));
  expect(screen.queryByText("Arp.Plc.Eclr/rTemp")).toBeNull(); // it has a name
  expect(screen.getByText("Arp.Plc.Eclr/xRun")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Writable"));
  expect(screen.getByText("Arp.Plc.Eclr/xRun")).toBeTruthy();
});

it("reads the datasources again when another project opens", async () => {
  const f = runtime([]);
  vi.stubGlobal("fetch", f);
  const tagCalls = () => (f.mock.calls as unknown as [string][]).map(([u]) => u).filter((u) => u.endsWith("/tags"));
  useProject.getState().loadProject(base(["plc"]));
  render(<VariablesTab />);
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/plc/tags"));
  act(() => useProject.getState().loadProject(base(["opc"])));
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/opc/tags"));
});

it.each([
  ["with the runtime up", true, 0],
  ["with the runtime down", false, 1],
])("gives a variable a name and tells the runtime, %s", async (_, up, _failedNote) => {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", runtime(posts, up));
  useProject.getState().loadProject(base());
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.click(screen.getAllByText("+ ns")[1]!);
  const node = { path: "xRun", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/xRun" };
  await waitFor(() => expect(useProject.getState().project.namespace).toEqual([node]));
  expect(posts).toEqual([node]);
  await screen.findByText(up ? "Added 1 variable at the top" : "Added 1 variable at the top; the runtime takes the rest on the next deploy");
});

it("binds the selected widget by the variable's name when it has one, by its address when not", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject({ ...base(), namespace: [{ path: "plant.temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }] });
  useProject.getState().selectWidget("g1");
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/rTemp");
  const binds = screen.getAllByText("Bind");
  fireEvent.click(binds[0]!);
  expect(gaugeValue()).toBe("ns:plant.temp");
  fireEvent.click(binds[1]!);
  expect(gaugeValue()).toBe("plc:Arp.Plc.Eclr/xRun");
});

it("dragging variables onto a folder names them under it", async () => {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", runtime(posts));
  useProject.getState().loadProject({ ...base(), namespace: [{ path: "Line1", type: "folder" }] });
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  const folder = screen.getByText("Line1");
  const drag = JSON.stringify([{ dsId: "plc", path: "Arp.Plc.Eclr/xRun" }, { dsId: "plc", path: "Arp.Plc.Eclr/rTemp" }]);
  fireEvent.dragOver(folder, dt(VAR_MIME, drag));
  fireEvent.drop(folder, dt(VAR_MIME, drag));
  await waitFor(() => expect(nsPaths()).toEqual(["Line1", "Line1.rTemp", "Line1.xRun"]));
  expect(posts).toHaveLength(2);
});

it("moving a node into a folder keeps every use of it pointing at it", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject({
    ...base(),
    namespace: [{ path: "Line1", type: "folder" }, { path: "temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }],
  });
  useProject.getState().updateWidget("p1", "g1", { bindings: { value: "ns:temp" } });
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.drop(screen.getByText("Line1"), dt(NODE_MIME, "temp"));
  expect(nsPaths()).toEqual(["Line1", "Line1.temp"]);
  expect(gaugeValue()).toBe("ns:Line1.temp");
  expect(screen.getByRole("status").textContent).toMatch(/Moved temp into Line1/);
});

it("renaming a node by double-click follows its uses, and says why when it cannot", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject({
    ...base(),
    namespace: [{ path: "temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }, { path: "taken", type: "tag", driverId: "plc", driverAddr: "x" }],
  });
  useProject.getState().updateWidget("p1", "g1", { bindings: { value: "ns:temp" } });
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.doubleClick(treeNode("temp"));
  fireEvent.change(screen.getByLabelText("New name"), { target: { value: "taken" } });
  fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Enter" });
  expect(screen.getByRole("status").textContent).toMatch(/already exists/);
  expect(gaugeValue()).toBe("ns:temp");
  fireEvent.doubleClick(treeNode("temp"));
  fireEvent.change(screen.getByLabelText("New name"), { target: { value: "Temperature" } });
  fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Enter" });
  expect(gaugeValue()).toBe("ns:Temperature");
});

it("deleting a node says how many uses it has first", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject({ ...base(), namespace: [{ path: "temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }] });
  useProject.getState().updateWidget("p1", "g1", { bindings: { value: "ns:temp" } });
  render(<VariablesTab />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.click(treeNode("temp"));
  fireEvent.click(screen.getByText("Delete"));
  expect(screen.getByText("Delete (1 uses)?")).toBeTruthy();
  fireEvent.click(screen.getAllByText("Delete")[0]!);
  expect(nsPaths()).toEqual([]);
});

it("imports the variables the user ticks, with the controller's own structure", async () => {
  const posts: { path: string }[] = [];
  vi.stubGlobal("fetch", runtime(posts));
  useProject.getState().loadProject(base(["opc"]));
  render(<VariablesTab />);
  await screen.findByText("ns=6;s=Arp.Plc.Eclr/Main.iA");
  fireEvent.click(screen.getByText("Import from datasource…"));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Arp");
  expect(within(dialog).getByText("Tick what to import")).toBeTruthy();
  fireEvent.click(within(dialog).getByLabelText("Import Arp.Plc.Eclr.Main"));
  expect(within(dialog).getByText(/2 to add/)).toBeTruthy();
  fireEvent.click(within(dialog).getByText(/^Import 2$/));
  await waitFor(() => expect(nsPaths()).toEqual(["OPC", "OPC.Main", "OPC.Main.iA", "OPC.Main.iB"].sort()));
  expect(useProject.getState().project.namespace!.find((n) => n.path === "OPC.Main.iA")).toMatchObject({ driverId: "opc", driverAddr: "ns=6;s=Arp.Plc.Eclr/Main.iA" });
  expect(posts.map((p) => p.path).sort()).toEqual(["OPC.Main.iA", "OPC.Main.iB"]);
  await screen.findByText(/Imported 2 variables from OPC into OPC/);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("the import can be cancelled and adds nothing", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject(base(["opc"]));
  render(<VariablesTab />);
  await screen.findByText("ns=6;s=Arp.Plc.Eclr/Main.iA");
  fireEvent.click(screen.getByText("Import from datasource…"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(nsPaths()).toEqual([]);
});

it("the workspace opens the tab beside the screen, keeps the screen mounted, and closes the tab", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject(base());
  render(<Workspace screen={<div data-testid="screen">the canvas</div>} />);
  expect(screen.getByTestId("screen")).toBeTruthy();
  act(() => useWorkspace.getState().open(VARIABLES_TAB));
  expect(await screen.findByText(/from 1 datasource/)).toBeTruthy();
  expect(screen.getByTestId("screen").parentElement!.className).toContain("hidden");
  fireEvent.click(screen.getByLabelText("Close Variables"));
  expect(screen.queryByText(/from 1 datasource/)).toBeNull();
  expect(screen.getByTestId("screen").parentElement!.className).not.toContain("hidden");
});
