import { afterEach, describe, expect, it } from "vitest";
import { useProject, type AlarmRule, type Project } from "./projectStore";
import { getClientAlarms } from "./alarmEngine";
import { virtualTagStore } from "./virtualTagStore";

// Tags of a virtual datasource ("sim:") come from virtualTagStore, so the
// test can set them directly.
const project = (alarmRules: AlarmRule[]): Project => ({
  schemaVersion: 6, version: "1", pages: [{ id: "p1", name: "Main", widgets: [] }], alarmRules,
  datasources: [{ id: "sim", type: "virtual", label: "Sim", config: { tags: [] } }],
});
const rule = (expr: string): AlarmRule => ({ id: "r1", name: "Tank high", expr, severity: "critical", message: "" });

afterEach(() => useProject.getState().loadProject(project([])));

const alarm = () => getClientAlarms().find((a) => a.ruleId === "r1");

describe("client alarms", () => {
  it("raises and clears on the rule's expression over several tags", () => {
    useProject.getState().loadProject(project([rule("{sim:level} > 95 && {sim:inlet}")]));
    virtualTagStore.set("sim:level", 97);
    expect(alarm()).toBeUndefined(); // the inlet tag has no value yet
    virtualTagStore.set("sim:inlet", true);
    expect(alarm()).toMatchObject({ binding: "sim:level", value: 97, message: "Tank high: {sim:level} > 95 && {sim:inlet}" });
    virtualTagStore.set("sim:inlet", false);
    expect(alarm()).toBeUndefined();
  });

  it("holds its state with the reason while an input is Bad", () => {
    useProject.getState().loadProject(project([rule("{sim:t} > 100")]));
    virtualTagStore.set("sim:t", 150);
    expect(alarm()?.reason).toBeUndefined();
    virtualTagStore.set("sim:t", 50, "Bad", "no answer");
    expect(alarm()).toMatchObject({ reason: "input {sim:t} is Bad" });
    virtualTagStore.set("sim:t", 150);
    expect(alarm()).toBeDefined();
    expect(alarm()?.reason).toBeUndefined();
    virtualTagStore.set("sim:t", 50);
    expect(alarm()).toBeUndefined();
  });

  it("a rule that does not compile raises nothing", () => {
    useProject.getState().loadProject(project([rule("{sim:t} >")]));
    virtualTagStore.set("sim:t", 150);
    expect(alarm()).toBeUndefined();
  });
});
