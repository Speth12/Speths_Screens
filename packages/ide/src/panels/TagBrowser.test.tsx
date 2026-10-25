import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TagBrowser } from "./TagBrowser";
import { useProject } from "../store/projectStore";
import type { Project } from "@speths-screens/shared-types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const projectWith = (dsId: string): Project => ({
  schemaVersion: 2,
  version: "0.1.0",
  datasources: [{ id: dsId, name: dsId, type: "rest", config: {} } as unknown as Project["datasources"][number]],
  pages: [{ id: "p1", name: "Main", widgets: [] }],
});

it("reloads the tag list when another project with as many datasources opens", async () => {
  const f = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", f);
  const tagCalls = () => (f.mock.calls as unknown as [string][]).map(([u]) => u).filter((u) => u.endsWith("/tags"));

  useProject.getState().loadProject(projectWith("plc-a"));
  render(<TagBrowser />);
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/plc-a/tags"));

  act(() => useProject.getState().loadProject(projectWith("plc-b")));
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/plc-b/tags"));
});

const withTags = (namespace: Project["namespace"]): Project => ({
  ...projectWith("plc"),
  pages: [{ id: "p1", name: "Main", widgets: [{ id: "g1", type: "gauge", x: 0, y: 0, w: 2, h: 2 }] }],
  namespace,
});
const runtime = (posts: unknown[], namespaceUp = true) => vi.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith("/tags")) return new Response(JSON.stringify([{ Path: "Arp.Plc.Eclr/rTemp" }, { Path: "Arp.Plc.Eclr/xRun" }]));
  if (url.endsWith("/status")) return new Response(JSON.stringify({ connected: true, lastError: "", tagCount: 2 }));
  if (url.endsWith("/namespace")) {
    posts.push(JSON.parse(init!.body as string));
    if (!namespaceUp) throw new Error("Failed to fetch");
    return new Response("{}");
  }
  return new Response("[]");
});
const gaugeValue = () => useProject.getState().project.pages[0]!.widgets[0]!.bindings?.value;

it("binds a variable that is in the namespace by its ns: path", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject(withTags([{ path: "plant.temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" }]));
  useProject.getState().selectWidget("g1");
  render(<TagBrowser />);
  const row = await screen.findByText("Arp.Plc.Eclr/rTemp");
  expect(screen.getByText("◆ ns:plant.temp")).toBeTruthy();
  fireEvent.click(row);
  expect(gaugeValue()).toBe("ns:plant.temp");
  fireEvent.click(screen.getByText("Arp.Plc.Eclr/xRun"));
  expect(gaugeValue()).toBe("plc:Arp.Plc.Eclr/xRun");
});

it.each([
  ["with the runtime up", true, "Added ns:plc.xRun and bound it"],
  ["with the runtime down", false, "Added ns:plc.xRun and bound it; the runtime gets it on the next deploy"],
])("adds a variable to the namespace and binds it in one step, %s", async (_, up, message) => {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", runtime(posts, up));
  useProject.getState().loadProject(withTags([]));
  useProject.getState().selectWidget("g1");
  render(<TagBrowser />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.click(screen.getAllByTitle("Add to namespace")[1]!);
  expect((screen.getByPlaceholderText("Plant.Line1.TagName") as HTMLInputElement).value).toBe("plc.xRun");
  fireEvent.click(screen.getByText("Add"));
  await screen.findByText(`✓ ${message}`);
  expect(gaugeValue()).toBe("ns:plc.xRun");
  expect(useProject.getState().project.namespace).toEqual([{ path: "plc.xRun", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/xRun" }]);
  expect(posts).toEqual([{ path: "plc.xRun", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/xRun" }]);
});

it("refuses a namespace path that is taken", async () => {
  vi.stubGlobal("fetch", runtime([]));
  useProject.getState().loadProject(withTags([{ path: "plc.taken", type: "tag" }]));
  render(<TagBrowser />);
  await screen.findByText("Arp.Plc.Eclr/xRun");
  fireEvent.click(screen.getAllByTitle("Add to namespace")[1]!);
  fireEvent.change(screen.getByPlaceholderText("Plant.Line1.TagName"), { target: { value: "plc.taken" } });
  fireEvent.click(screen.getByText("Add"));
  expect(screen.getByText("✗ plc.taken is already in the namespace")).toBeTruthy();
  expect(useProject.getState().project.namespace).toHaveLength(1);
});
