import { describe, expect, it } from "vitest";
import type { NamespaceNode, Project } from "@speths-screens/shared-types";
import { addrSegments, commonPrefixLen, countNsRefs, importPlan, moveNsNode, nsName, nsTree, rewriteNsRefs, uniquePath } from "./namespaceOps";

const project = (namespace: NamespaceNode[], extra: Partial<Project> = {}): Project => ({
  schemaVersion: 7, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], namespace, ...extra,
});

describe("names", () => {
  it("nsName keeps letters, digits and underscores", () => {
    expect(nsName("PLC REST (lab)")).toBe("PLC_REST_lab");
    expect(nsName("rTemp")).toBe("rTemp");
  });
  it("an OPC UA node id gives its levels", () => {
    expect(addrSegments("ns=6;s=Arp.Plc.Eclr/MainInstance.iInt")).toEqual(["Arp", "Plc", "Eclr", "MainInstance", "iInt"]);
    expect(addrSegments("holding:0")).toEqual(["holding", "0"]);
  });
  it("uniquePath adds a number when the name is taken", () => {
    expect(uniquePath(new Set(["a.t", "a.t_2"]), "a", "t")).toBe("a.t_3");
    expect(uniquePath(new Set(), "", "temp")).toBe("temp");
  });
});

describe("nsTree", () => {
  it("draws the levels a flat list implies as folders, folders first", () => {
    const tree = nsTree([
      { path: "plant.zeta", type: "tag", driverId: "d", driverAddr: "z" },
      { path: "plant.line1.temp", type: "tag", driverId: "d", driverAddr: "t" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.node.path).toBe("plant");
    expect(tree[0]!.implicit).toBe(true);
    expect(tree[0]!.children.map((c) => c.node.path)).toEqual(["plant.line1", "plant.zeta"]);
    expect(tree[0]!.children[0]!.implicit).toBe(true);
  });
});

describe("moving a node", () => {
  const tags: NamespaceNode[] = [
    { path: "plant", type: "folder" },
    { path: "plant.pump1", type: "tag", driverId: "d", driverAddr: "p1" },
    { path: "plant.pump10", type: "tag", driverId: "d", driverAddr: "p10" },
    { path: "other", type: "folder" },
  ];
  const uses = (p: Project) => p.pages[0]!.widgets[0]!.bindings!.value;
  const withWidget = (value: string) => project(tags, {
    pages: [{ id: "p1", name: "Main", widgets: [{ id: "w", type: "gauge", x: 0, y: 0, w: 2, h: 2, bindings: { value } } as never] }],
  });

  it("moves it and points a binding at the new path", () => {
    const r = moveNsNode(withWidget("ns:plant.pump1"), "plant.pump1", "other.pump1");
    expect(r.error).toBeUndefined();
    expect(r.project.namespace!.map((n) => n.path)).toContain("other.pump1");
    expect(r.project.namespace!.map((n) => n.path)).not.toContain("plant.pump1");
    expect(uses(r.project)).toBe("ns:other.pump1");
  });
  it("does not touch another name that starts the same (pump10)", () => {
    const r = moveNsNode(withWidget("ns:plant.pump10"), "plant.pump1", "other.pump1");
    expect(uses(r.project)).toBe("ns:plant.pump10");
  });
  it("moves a folder with what is in it and follows the uses under it", () => {
    const r = moveNsNode(withWidget("ns:plant.pump1"), "plant", "site");
    expect(r.project.namespace!.map((n) => n.path).sort()).toEqual(["other", "site", "site.pump1", "site.pump10"]);
    expect(uses(r.project)).toBe("ns:site.pump1");
  });
  it("follows uses in expressions and alarm rules too", () => {
    const p = project(tags, { alarmRules: [{ id: "a", name: "A", expr: "{ns:plant.pump1} > 5 && {ns:plant.pump10} < 1", severity: "warning", message: "m" } as never] });
    const r = moveNsNode(p, "plant.pump1", "plant.motor");
    expect((r.project.alarmRules![0] as { expr: string }).expr).toBe("{ns:plant.motor} > 5 && {ns:plant.pump10} < 1");
  });
  it("refuses a taken path, a folder into itself, and odd characters", () => {
    expect(moveNsNode(project(tags), "plant.pump1", "plant.pump10").error).toMatch(/already exists/);
    expect(moveNsNode(project(tags), "plant", "plant.sub").error).toMatch(/inside itself/);
    expect(moveNsNode(project(tags), "plant.pump1", "plant.pump 1").error).toMatch(/letters, digits/);
  });
  it("counts uses", () => {
    expect(countNsRefs(withWidget("ns:plant.pump1"), "plant.pump1")).toBe(1);
    expect(countNsRefs(withWidget("ns:plant.pump10"), "plant.pump1")).toBe(0);
    expect(countNsRefs(withWidget("ns:plant.pump1"), "plant")).toBe(1);
  });
  it("rewriteNsRefs leaves the namespace's own paths alone", () => {
    const r = rewriteNsRefs(project(tags), "plant", "site");
    expect(r.namespace!.map((n) => n.path)).toContain("plant.pump1");
  });
});

describe("import plan", () => {
  const tags = ["ns=6;s=Arp.Plc.Eclr/Main.iA", "ns=6;s=Arp.Plc.Eclr/Main.iB", "ns=6;s=Arp.Plc.Eclr/Other.rC"].map((path) => ({ path }));

  it("shared levels are dropped and the rest becomes folders and tags", () => {
    expect(commonPrefixLen(tags.map((t) => addrSegments(t.path)))).toBe(3);
    const plan = importPlan(tags, "opc", "PLC", [], true);
    expect(plan.nodes.map((n) => `${n.type}:${n.path}`)).toEqual([
      "folder:PLC", "folder:PLC.Main", "tag:PLC.Main.iA", "tag:PLC.Main.iB", "folder:PLC.Other", "tag:PLC.Other.rC",
    ]);
    expect(plan.nodes.find((n) => n.path === "PLC.Main.iA")).toMatchObject({ driverId: "opc", driverAddr: "ns=6;s=Arp.Plc.Eclr/Main.iA" });
  });
  it("keeps every level when asked", () => {
    const plan = importPlan(tags.slice(0, 1), "opc", "PLC", [], false);
    expect(plan.nodes.at(-1)!.path).toBe("PLC.Arp.Plc.Eclr.Main.iA");
  });
  it("skips variables that already have a name, and does not repeat folders that exist", () => {
    const have: NamespaceNode[] = [{ path: "PLC", type: "folder" }, { path: "PLC.x", type: "tag", driverId: "opc", driverAddr: tags[0]!.path }];
    const plan = importPlan(tags, "opc", "PLC", have, true);
    expect(plan.skipped).toBe(1);
    expect(plan.nodes.filter((n) => n.path === "PLC")).toHaveLength(0);
    expect(plan.nodes.some((n) => n.driverAddr === tags[0]!.path)).toBe(false);
  });
  it("two variables that end in the same name each get a path of their own", () => {
    const plan = importPlan([{ path: "x" }, { path: "x." }], "d", "R", [], false).nodes.filter((n) => n.type === "tag");
    expect(plan.map((n) => n.path)).toEqual(["R.x", "R.x_2"]);
  });
});
