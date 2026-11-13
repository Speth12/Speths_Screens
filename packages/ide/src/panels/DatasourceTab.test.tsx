import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { DatasourceTab } from "./DatasourceTab";
import { Workspace } from "./Workspace";
import { useProject } from "../store/projectStore";
import { SCREEN_TAB, datasourceTab, useWorkspace } from "../store/workspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(() => useWorkspace.setState({ tabs: [SCREEN_TAB], activeId: SCREEN_TAB.id, variablesDs: "" }));

const project = (config: Record<string, unknown> = {}, type = "rest"): Project => ({
  schemaVersion: 7, version: "0.1.0",
  datasources: [{ id: "plc", label: "Lab PLC", type, config }] as Project["datasources"],
  pages: [{ id: "p1", name: "Overview", widgets: [{ id: "g", type: "gauge", x: 0, y: 0, w: 2, h: 2, bindings: { value: "plc:Arp.T" } }] }],
});
const dsConfig = () => useProject.getState().project.datasources[0]!.config as Record<string, unknown>;
const runtime = (status: unknown | (() => unknown), code = 200) => vi.fn(async (url: string) => {
  if (url.endsWith("/status")) return new Response(JSON.stringify(typeof status === "function" ? (status as () => unknown)() : status), { status: code });
  return new Response("{}");
});

it("shows whether the datasource is connected and why not", async () => {
  vi.stubGlobal("fetch", runtime({ connected: false, lastError: "no answer from 10.0.0.210 (timed out)", tagCount: 0 }));
  useProject.getState().loadProject(project());
  render(<DatasourceTab dsId="plc" />);
  expect(await screen.findByText("no answer from 10.0.0.210 (timed out)")).toBeTruthy();
  expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
});

it("says so when the runtime does not know the datasource", async () => {
  vi.stubGlobal("fetch", runtime({ error: "datasource not found" }, 404));
  useProject.getState().loadProject(project());
  render(<DatasourceTab dsId="plc" />);
  expect((await screen.findAllByText(/does not know this datasource/)).length).toBeGreaterThan(0);
  expect(screen.getByText("No answer")).toBeTruthy();
});

it("keeps a log of what changed", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let status: unknown = { connected: false, lastError: "refused", tagCount: 0 };
  vi.stubGlobal("fetch", runtime(() => status));
  useProject.getState().loadProject(project());
  render(<DatasourceTab dsId="plc" />);
  await screen.findByText("Not connected: refused");
  status = { connected: true, lastError: "", tagCount: 12 };
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(1));
  expect(screen.getByText("Not connected: refused")).toBeTruthy(); // the earlier line stays
});

it("edits the connection settings, keeps what the form does not know, and saves on request", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ endpoint: "https://10.0.0.210", basePath: "/_pxc_api/v1.14", certCheck: "pinned", certFingerprint: "AA:BB", somethingElse: 7 }));
  render(<DatasourceTab dsId="plc" />);
  const save = screen.getByText("Save changes") as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Host"), { target: { value: "10.0.0.99" } });
  fireEvent.change(screen.getByLabelText("Base path"), { target: { value: "/_pxc_api/v1.2" } });
  expect(save.disabled).toBe(false);
  expect((dsConfig().endpoint)).toBe("https://10.0.0.210"); // nothing saved yet
  fireEvent.click(save);
  expect(dsConfig()).toMatchObject({ endpoint: "https://10.0.0.99", basePath: "/_pxc_api/v1.2", certCheck: "pinned", certFingerprint: "AA:BB", somethingElse: 7 });
  expect((screen.getByText("Save changes") as HTMLButtonElement).disabled).toBe(true);
});

it("a config the form would write differently is not a change", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ memoryTags: [{ path: "A", type: "int", initial: 5, retain: false, extra: 1 }] }, "memory"));
  render(<DatasourceTab dsId="plc" />);
  expect((screen.getByText("Save changes") as HTMLButtonElement).disabled).toBe(true);
});

it("revert puts the form back", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ endpoint: "https://10.0.0.210" }));
  render(<DatasourceTab dsId="plc" />);
  fireEvent.change(screen.getByLabelText("Host"), { target: { value: "elsewhere" } });
  fireEvent.click(screen.getByText("Revert"));
  expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("10.0.0.210");
});

it("a password is only replaced when one is typed, and no username removes the login", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ endpoint: "https://h", username: "admin", password: "old", certCheck: "off" }));
  render(<DatasourceTab dsId="plc" />);
  expect((screen.getByLabelText("Password") as HTMLInputElement).placeholder).toBe("unchanged");
  fireEvent.change(screen.getByLabelText("Base path"), { target: { value: "/x" } });
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig()).toMatchObject({ username: "admin", password: "old" });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "new" } });
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig().password).toBe("new");
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "" } });
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig().username).toBeUndefined();
  expect(dsConfig().password).toBeUndefined();
});

it("OPC UA: the endpoint is built from host and port, and a secure mode never keeps policy None", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ endpoint: "opc.tcp://10.0.0.210:4840", securityMode: "None", securityPolicy: "None" }, "opcua"));
  render(<DatasourceTab dsId="plc" />);
  expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe("10.0.0.210");
  expect((screen.getByLabelText("Port") as HTMLInputElement).value).toBe("4840");
  fireEvent.change(screen.getByLabelText("Port"), { target: { value: "4841" } });
  fireEvent.change(screen.getByLabelText("Security mode"), { target: { value: "SignAndEncrypt" } });
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig()).toMatchObject({ endpoint: "opc.tcp://10.0.0.210:4841", securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256" });
});

it("memory tags are edited in the tab", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ memoryTags: [{ path: "Count", type: "int", initial: 0 }] }, "memory"));
  render(<DatasourceTab dsId="plc" />);
  fireEvent.click(screen.getByText("+ add tag"));
  fireEvent.change(screen.getByLabelText("memory tag 2 path"), { target: { value: "Flag" } });
  fireEvent.change(screen.getByLabelText("memory tag 2 type"), { target: { value: "bool" } });
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig().memoryTags).toEqual([{ path: "Count", type: "int", initial: 0 }, { path: "Flag", type: "bool" }]);
});

it("Test connection shows the result and offers to pin the certificate it saw", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/status")) return new Response(JSON.stringify({ connected: true, lastError: "", tagCount: 1 }));
    if (url.includes("/datasources/test")) return new Response(JSON.stringify({ connected: true, tagCount: 5, certFingerprint: "11:22:33" }));
    void init;
    return new Response("{}");
  }));
  useProject.getState().loadProject(project({ endpoint: "https://h", certCheck: "pinned", certFingerprint: "" }));
  render(<DatasourceTab dsId="plc" />);
  fireEvent.click(screen.getByText("Test connection"));
  expect(await screen.findByText(/Connected · 5 variables/)).toBeTruthy();
  fireEvent.click(screen.getByText("Pin it"));
  fireEvent.click(screen.getByText("Save changes"));
  expect(dsConfig().certFingerprint).toBe("11:22:33");
});

it("lists what uses the datasource, and a page in the list opens on the screen", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project());
  useWorkspace.setState({ tabs: [SCREEN_TAB, datasourceTab("plc", "Lab PLC")], activeId: "ds:plc" });
  render(<DatasourceTab dsId="plc" />);
  fireEvent.click(screen.getByText("Overview"));
  expect(useProject.getState().activePageId).toBe("p1");
  expect(useWorkspace.getState().activeId).toBe("screen");
});

it("Browse variables opens the Variables tab showing this datasource", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project({ endpoint: "https://h" }));
  render(<DatasourceTab dsId="plc" />);
  fireEvent.click(screen.getByText("Browse variables"));
  expect(useWorkspace.getState().activeId).toBe("variables");
  expect(useWorkspace.getState().variablesDs).toBe("plc");
});

it("removing asks first, says what stops working, and closes the tab", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project());
  useWorkspace.setState({ tabs: [SCREEN_TAB, datasourceTab("plc", "Lab PLC")], activeId: "ds:plc" });
  render(<Workspace screen={<div>screen</div>} />);
  fireEvent.click(await screen.findByText("Remove this datasource…"));
  expect(screen.getByText(/1 use will stop working/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(useProject.getState().project.datasources).toHaveLength(0);
  await waitFor(() => expect(useWorkspace.getState().tabs.map((t) => t.id)).toEqual(["screen"]));
});

it("the tab follows the datasource's name, and goes when another project opens", async () => {
  vi.stubGlobal("fetch", runtime({ connected: true, lastError: "", tagCount: 1 }));
  useProject.getState().loadProject(project());
  useWorkspace.setState({ tabs: [SCREEN_TAB, datasourceTab("plc", "Lab PLC")], activeId: "ds:plc" });
  render(<Workspace screen={<div>screen</div>} />);
  act(() => useProject.getState().updateDatasource("plc", { label: "Line 1 PLC" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: /Line 1 PLC/ })).toBeTruthy());
  act(() => useProject.getState().loadProject({ ...project(), datasources: [] }));
  await waitFor(() => expect(useWorkspace.getState().tabs.map((t) => t.id)).toEqual(["screen"]));
});
