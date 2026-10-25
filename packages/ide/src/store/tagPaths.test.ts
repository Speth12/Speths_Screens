import { afterEach, describe, expect, it, vi } from "vitest";
import { addToNamespace, nsNodeFor, nsSuggestions, preferNs, suggestNsPath } from "./tagPaths";
import { useProject, type NamespaceNode, type Project } from "./projectStore";

afterEach(() => vi.unstubAllGlobals());

const project = (namespace: NamespaceNode[]): Project => ({
  schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], namespace,
});
const ns = project([
  { path: "plant", type: "folder" },
  { path: "plant.temp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp", description: "Tank temperature" },
  { path: "plant.pump1", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/xPump1" },
  { path: "plant.avg", type: "virtual", expression: "1" },
]);

describe("preferNs", () => {
  it.each([
    ["raw path in the namespace", "plc:Arp.Plc.Eclr/rTemp", "ns:plant.temp"],
    ["raw path not in the namespace", "plc:Arp.Plc.Eclr/other", "plc:Arp.Plc.Eclr/other"],
    ["same address, other datasource", "opc:Arp.Plc.Eclr/rTemp", "opc:Arp.Plc.Eclr/rTemp"],
    ["already ns:", "ns:plant.temp", "ns:plant.temp"],
    ["no datasource", "rTemp", "rTemp"],
  ])("%s", (_, binding, want) => {
    expect(preferNs(ns, binding)).toBe(want);
  });

  it("ignores folders and virtual nodes", () => {
    expect(nsNodeFor(project([{ path: "x", type: "virtual", driverId: "plc", driverAddr: "a" }]), "plc:a")).toBeUndefined();
  });
});

describe("suggestNsPath", () => {
  it.each([
    ["PLCnext REST", "Arp.Plc.Eclr/rTemp", [], "PLCnext_REST.rTemp"],
    ["plc", "ns=2;s=Level", [], "plc.Level"],
    ["opc", "ns=5;s=Arp.Plc.Eclr/rTemp", [], "opc.rTemp"],
    ["plc", "holding:100", [], "plc.100"],
    ["plc", "Arp.Plc.Eclr/rTemp", ["plc.rTemp"], "plc.rTemp_2"],
    ["plc", "Arp.Plc.Eclr/rTemp", ["plc.rTemp", "plc.rTemp_2"], "plc.rTemp_3"],
    ["", "", [], "plc.tag"],
  ])("%s %s", (label, addr, taken, want) => {
    expect(suggestNsPath(project(taken.map((path) => ({ path, type: "tag" as const }))), label, addr)).toBe(want);
  });
});

describe("nsSuggestions", () => {
  it.each([
    ["nothing typed: every tag, in order", "", ["plant.avg", "plant.pump1", "plant.temp"]],
    ["path prefix first", "ns:plant.p", ["plant.pump1"]],
    ["part of a path", "temp", ["plant.temp"]],
    ["description", "tank", ["plant.temp"]],
    ["PLC address", "xPump", ["plant.pump1"]],
    ["no match", "zzz", []],
  ])("%s", (_, typed, want) => {
    expect(nsSuggestions(ns, typed).map((n) => n.path)).toEqual(want);
  });
});

describe("addToNamespace", () => {
  it("adds to the project and tells the runtime", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    const upsert = vi.fn();
    const r = await addToNamespace(upsert, "plc.rTemp", "plc", "Arp.Plc.Eclr/rTemp");
    expect(r).toEqual({ binding: "ns:plc.rTemp" });
    expect(upsert).toHaveBeenCalledWith({ path: "plc.rTemp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" });
    const [url, init] = (f.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("/api/v1/namespace");
    expect(JSON.parse(init.body as string)).toEqual({ path: "plc.rTemp", type: "tag", driverId: "plc", driverAddr: "Arp.Plc.Eclr/rTemp" });
  });

  it.each([
    ["the runtime is down", async () => { throw new Error("Failed to fetch"); }, "Failed to fetch"],
    ["the runtime refuses", async () => new Response("no", { status: 403 }), "no"],
  ])("still adds to the project when %s", async (_, impl, why) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    const upsert = vi.fn();
    expect(await addToNamespace(upsert, "plc.x", "plc", "x")).toEqual({ binding: "ns:plc.x", runtimeError: why });
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("removeNamespaceNode", () => {
  it("removes the node and its children, not its look-alikes", () => {
    useProject.getState().loadProject(project([
      { path: "plant.pump1", type: "folder" },
      { path: "plant.pump1.run", type: "tag" },
      { path: "plant.pump10", type: "tag" },
      { path: "plant.pump2", type: "tag" },
    ]));
    useProject.getState().removeNamespaceNode("plant.pump1");
    expect(useProject.getState().project.namespace!.map((n) => n.path)).toEqual(["plant.pump10", "plant.pump2"]);
  });
});
