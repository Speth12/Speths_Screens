import { describe, expect, it } from "vitest";
import { BUILTIN_PRESETS } from "@speths-screens/widgets";
import { allPresets, convertWidget, instantiatePreset, presetFromWidgets } from "./presets";
import { validateProject } from "./validateProject";
import type { Preset, Project, Widget } from "./projectStore";

const w = (id: string, x: number, y: number, more: Partial<Widget> = {}): Widget => ({ id, type: "button", x, y, w: 2, h: 1, ...more });
const ids = () => { let n = 0; return () => `n${++n}`; };

describe("presetFromWidgets", () => {
  it("moves the group to 0,0 and keeps settings, tags and events", () => {
    const events = { onPress: [{ type: "write" as const, value: 1 }] };
    const p = presetFromWidgets([
      w("a", 3, 5, { props: { label: "Start" }, bindings: { value: "ns:plant.start" }, events, locked: true }),
      w("b", 5, 6),
    ], "ps1", "Pump", "Start and stop");
    expect(p).toEqual({
      id: "ps1", name: "Pump", description: "Start and stop",
      widgets: [
        { id: "a", type: "button", x: 0, y: 0, w: 2, h: 1, props: { label: "Start" }, bindings: { value: "ns:plant.start" }, events, locked: undefined },
        { id: "b", type: "button", x: 2, y: 1, w: 2, h: 1, locked: undefined },
      ],
    });
  });

  it("copies, so later edits to the page do not reach the preset", () => {
    const src = w("a", 0, 0, { props: { label: "Start" } });
    const p = presetFromWidgets([src], "ps1", "One");
    src.props!.label = "changed";
    expect(p.widgets[0]!.props).toEqual({ label: "Start" });
    expect("description" in p).toBe(false);
  });
});

describe("instantiatePreset", () => {
  const preset: Preset = {
    id: "ps", name: "Pair",
    widgets: [w("a", 0, 0, { groupId: "g1", events: { onClick: [{ type: "navigate", page: "p2" }] } }), w("b", 2, 0, { groupId: "g1" }), w("c", 0, 1)],
  };

  it.each([
    ["grid onto grid", "grid", "grid", { x: 4, y: 3 }, [[4, 3, 2, 1], [6, 3, 2, 1], [4, 4, 2, 1]]],
    ["grid onto pixel", "grid", "pixel", { x: 100, y: 50 }, [[100, 50, 168, 64], [276, 50, 168, 64], [100, 122, 168, 64]]],
  ] as const)("%s: new ids, placed at the drop point", (_, from, to, at, want) => {
    const out = instantiatePreset(preset, at, { from, to }, ids());
    expect(out.map((x) => x.id)).toEqual(["n2", "n3", "n4"]); // n1 went to the new group id
    expect(out.map((x) => [x.x, x.y, x.w, x.h])).toEqual(want);
  });

  it("gives a group inside the preset a new group id, shared by its members", () => {
    const out = instantiatePreset(preset, { x: 0, y: 0 }, { from: "grid", to: "grid" }, ids());
    expect(out[0]!.groupId).toBe("grp-n1");
    expect(out[1]!.groupId).toBe("grp-n1");
    expect(out[2]!.groupId).toBeUndefined();
  });

  it("copies, so editing an inserted widget leaves the preset alone", () => {
    const out = instantiatePreset(preset, { x: 0, y: 0 }, { from: "grid", to: "grid" }, ids());
    out[0]!.events!.onClick![0]!.page = "elsewhere";
    expect(preset.widgets[0]!.events!.onClick![0]!.page).toBe("p2");
  });
});

describe("convertWidget", () => {
  it.each([
    ["grid to pixel", w("a", 1, 2), "pixel", [88, 144, 168, 64]],
    ["pixel to grid", w("a", 88, 144, { w: 168, h: 64 }), "grid", [1, 2, 2, 1]],
    ["tiny pixel widget stays at least one cell", w("a", 0, 0, { w: 5, h: 5 }), "grid", [0, 0, 1, 1]],
  ] as const)("%s", (_, src, to, want) => {
    const out = convertWidget(src, to);
    expect([out.x, out.y, out.w, out.h]).toEqual(want);
  });
});

describe("built-in presets", () => {
  const base: Project = { schemaVersion: 2, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }] };

  it("all follow schema.json", () => {
    expect(validateProject({ ...base, presets: BUILTIN_PRESETS })).toEqual([]);
  });

  it("have unique ids, and the momentary buttons write 1 while pressed", () => {
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length);
    const jog = BUILTIN_PRESETS.find((p) => p.id === "builtin-jog")!.widgets[0]!;
    expect(jog.events).toEqual({ onPress: [{ type: "write", value: 1 }], onRelease: [{ type: "write", value: 0 }] });
  });

  it("come after the project's own, which are in the project's units", () => {
    const own: Preset = { id: "mine", name: "Mine", widgets: [w("a", 0, 0)] };
    const list = allPresets({ ...base, canvasSnap: "pixel", presets: [own] });
    expect(list[0]).toEqual({ preset: own, builtin: false, units: "pixel" });
    expect(list.slice(1).every((e) => e.builtin && e.units === "grid")).toBe(true);
  });
});
