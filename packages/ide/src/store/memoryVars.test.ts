import { describe, expect, it } from "vitest";
import type { Project } from "@speths-screens/shared-types";
import { addMemoryVariable, isMemoryDatasource, memoryTagsOf, NS_DATA_TYPE } from "./memoryVars";
import { projectTags, withProjectTags } from "./variables";

const project = (over: Partial<Project> = {}): Project => ({
  schemaVersion: 7, version: "1", pages: [{ id: "p", name: "Main", widgets: [] }],
  datasources: [
    { id: "mem", label: "Script state", type: "memory", config: { memoryTags: [{ path: "Counter", type: "int" }] } },
    { id: "plc", label: "PLC", type: "rest", config: {} },
    { id: "calc", label: "Calc", type: "virtual", config: { tags: [{ path: "double", expr: "{mem:Counter} * 2" }] } },
  ],
  ...over,
}) as unknown as Project;

const node = (path: string, over = {}) => ({ path, type: "tag" as const, driverId: "mem", driverAddr: path, ...over });

describe("memoryTagsOf and isMemoryDatasource", () => {
  it.each([
    [{ config: { memoryTags: [{ path: "a", type: "int" }] } }, ["a"]],
    [{ config: {} }, []],
    [{ config: undefined }, []],
  ])("%j", (ds, want) => expect(memoryTagsOf(ds as never).map((t) => t.path)).toEqual(want));

  it.each([["memory", true], ["virtual", false], ["rest", false]])("%s is %s", (type, want) => expect(isMemoryDatasource({ type })).toBe(want));
});

describe("NS_DATA_TYPE", () => {
  it("names the namespace's type for each memory type", () => {
    expect(NS_DATA_TYPE).toEqual({ bool: "bool", int: "int", real: "float", string: "string" });
  });
});

describe("addMemoryVariable", () => {
  it("adds the node to the namespace and the tag to the datasource, and touches nothing else", () => {
    const p = project();
    const r = addMemoryVariable(p, node("Virtual_Real"), { dsId: "mem", tag: { path: "Virtual_Real", type: "real", initial: 1.5, retain: true } });
    expect(r.error).toBeUndefined();
    expect(r.project!.namespace).toEqual([node("Virtual_Real")]);
    expect(memoryTagsOf(r.project!.datasources[0]!)).toEqual([{ path: "Counter", type: "int" }, { path: "Virtual_Real", type: "real", initial: 1.5, retain: true }]);
    expect(r.project!.datasources.slice(1)).toEqual(p.datasources.slice(1));
    expect(p.namespace).toBeUndefined(); // the project it was given is not changed
  });

  it("does not add a tag the datasource already has, only the node", () => {
    const r = addMemoryVariable(project(), node("Count", { driverAddr: "Counter" }), { dsId: "mem", tag: { path: "Counter", type: "real" } });
    expect(memoryTagsOf(r.project!.datasources[0]!)).toEqual([{ path: "Counter", type: "int" }]);
    expect(r.project!.namespace).toHaveLength(1);
  });

  it.each<[string, Partial<Project>, string, string]>([
    ["a path that is taken", { namespace: [{ path: "Virtual_Real", type: "folder" }] }, "mem", "ns:Virtual_Real already exists"],
    ["a datasource that is not there", {}, "nope", "there is no datasource nope"],
    ["a datasource that is not a memory datasource", {}, "plc", "PLC is not a memory datasource"],
  ])("refuses %s and changes nothing", (_, over, dsId, want) => {
    const r = addMemoryVariable(project(over), node("Virtual_Real"), { dsId, tag: { path: "Virtual_Real", type: "real" } });
    expect(r.error).toBe(want);
    expect(r.project).toBeUndefined();
  });
});

describe("projectTags", () => {
  it("lists a memory datasource's variables as writable, with their type", () => {
    expect(projectTags(project().datasources[0]!)).toEqual([{ Path: "Counter", Description: "memory variable, int", Writable: true }]);
  });

  it("lists a computed datasource's variables as read only, with their formula", () => {
    expect(projectTags(project().datasources[2]!)).toEqual([{ Path: "double", Description: "computed: {mem:Counter} * 2", Writable: false }]);
  });

  it.each([
    ["a datasource that browses to the controller", { type: "rest", config: {} }],
    ["a memory datasource with no tags", { type: "memory", config: {} }],
    ["no settings at all", { type: "memory", config: undefined }],
  ])("%s lists nothing", (_, ds) => expect(projectTags(ds)).toEqual([]));

  it("leaves out a tag with no name yet", () => {
    expect(projectTags({ type: "memory", config: { memoryTags: [{ path: "", type: "int" }, { path: "a", type: "int" }] } }).map((t) => t.Path)).toEqual(["a"]);
  });
});

describe("withProjectTags", () => {
  const ds = { type: "memory", config: { memoryTags: [{ path: "A", type: "int" }, { path: "B", type: "real" }] } };

  it("lists the project's variables when the runtime reported none", () => {
    expect(withProjectTags(ds, []).map((t) => t.Path)).toEqual(["A", "B"]);
  });

  it("keeps what the runtime reported, and adds only the project's variables it did not", () => {
    const out = withProjectTags(ds, [{ Path: "A", Description: "from the runtime", Writable: true }]);
    expect(out.map((t) => t.Path)).toEqual(["A", "B"]);
    expect(out[0]!.Description).toBe("from the runtime");
  });

  it("is the runtime's list for a datasource the project has nothing to add to", () => {
    const reported = [{ Path: "x" }];
    expect(withProjectTags({ type: "rest", config: {} }, reported)).toEqual(reported);
  });
});
