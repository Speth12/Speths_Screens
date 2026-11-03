import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Faceplate, Transform, Widget } from "@speths-screens/shared-types";
import { applyTransform, rewriteExpr, suit } from "./drive";
import { WidgetRenderer } from "./widgets";
import { WidgetHostProvider, EMPTY_TAG, inertHost, type TagState, type WidgetHost } from "./host";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("applyTransform", () => {
  const linear: Transform = { kind: "linear", in: [0, 100], out: [0, 270] };
  const steps: Transform = { kind: "thresholds", steps: [{ above: 80, value: "amber" }, { above: 95, value: "red" }], below: "grey" };
  it.each([
    ["no transform", 5, undefined, 5],
    ["linear", 50, linear, 135],
    ["linear clamps by default", 150, linear, 270],
    ["linear without clamping", 150, { ...linear, clamp: false }, 405],
    ["linear reads a flag as 0/1", true, { kind: "linear", in: [0, 1], out: [0, 10] }, 10],
    ["linear of text leaves the setting", "x", linear, undefined],
    ["linear with an empty input range", 7, { kind: "linear", in: [3, 3], out: [9, 1] }, 9],
    ["thresholds below the first step", 10, steps, "grey"],
    ["thresholds on a step", 80, steps, "amber"],
    ["thresholds past the last step", 99, steps, "red"],
    ["thresholds in any order", 99, { kind: "thresholds", steps: [{ above: 95, value: "red" }, { above: 80, value: "amber" }] }, "red"],
    ["thresholds without below", 10, { kind: "thresholds", steps: [{ above: 80, value: "amber" }] }, undefined],
    ["map", 2, { kind: "map", cases: [{ equals: 1, value: "run" }, { equals: 2, value: "stop" }], default: "?" }, "stop"],
    ["map: true equals 1", true, { kind: "map", cases: [{ equals: 1, value: "on" }] }, "on"],
    ["map: text is not a number", "1", { kind: "map", cases: [{ equals: 1, value: "on" }], default: "off" }, "off"],
    ["map without default", 9, { kind: "map", cases: [{ equals: 1, value: "on" }] }, undefined],
  ] as const)("%s", (_n, v, t, want) => expect(applyTransform(v, t as Transform | undefined)).toBe(want));
});

describe("suit", () => {
  it.each([
    ["visible", 0, false], ["visible", "x", true], ["blink", "", false],
    ["rotate", 45, 45], ["rotate", true, 1], ["rotate", "45", undefined],
    ["label", 12.5, "12.5"], ["label", true, "true"],
    ["bgColor", "#f00", "#f00"], ["bgColor", "", undefined], ["bgColor", 3, undefined],
  ] as const)("%s from %j", (prop, v, want) => expect(suit(prop, v)).toBe(want));
});

it("rewriteExpr fills in faceplate parameters", () => {
  expect(rewriteExpr("{run} && {ns:Auto} || {other}", { run: "plc:P1/Run" })).toBe("{plc:P1/Run} && {ns:Auto} || {other}");
});

// ── on screen ────────────────────────────────────────────────────────────

function host(values: Record<string, unknown | TagState>): WidgetHost {
  const state = (p: string | undefined): TagState => {
    if (!p || !(p in values)) return EMPTY_TAG;
    const v = values[p];
    return v && typeof v === "object" && "quality" in v ? (v as TagState) : { value: v, quality: "Good", ts: 1 };
  };
  return { ...inertHost, useTag: state, useTags: (paths) => Object.fromEntries(paths.map((p) => [p, state(p)])) };
}

function draw(w: Partial<Widget> & { type: Widget["type"] }, values: Record<string, unknown> = {}) {
  const widget = { id: "w1", x: 0, y: 0, w: 4, h: 4, ...w } as Widget;
  return render(<WidgetHostProvider value={host(values)}><WidgetRenderer w={widget} /></WidgetHostProvider>);
}

describe("driven properties on screen", () => {
  it("visible hides the widget while false", () => {
    const w = { type: "textDisplay" as const, props: { staticText: "hello" }, dynamics: { visible: { expr: "{plc:Show}" } } };
    draw(w, { "plc:Show": 0 });
    expect(screen.queryByText("hello")).toBeNull();
    cleanup();
    draw(w, { "plc:Show": 1 });
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("an unknown result leaves the setting: a Bad tag does not hide the widget", () => {
    draw({ type: "textDisplay", props: { staticText: "hello" }, dynamics: { visible: { expr: "{plc:Show}" } } },
      { "plc:Show": { value: 0, quality: "Bad", ts: 1 } });
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("drives a widget's own setting through a transform", () => {
    draw({ type: "textDisplay", props: { staticText: "static" },
      dynamics: { staticText: { expr: "{plc:Mode}", transform: { kind: "map", cases: [{ equals: 1, value: "Auto" }, { equals: 2, value: "Manual" }] } } } },
      { "plc:Mode": 2 });
    expect(screen.getByText("Manual")).toBeTruthy();
  });

  it("drives the frame's label and colors from an expression", () => {
    const { container } = draw({ type: "textDisplay", props: { staticText: "x" },
      dynamics: { label: { expr: "'Tank ' + {plc:N}" }, bgColor: { expr: "{plc:L} > 80 ? '#dc2626' : '#3f3f46'" } } },
      { "plc:N": 3, "plc:L": 90 });
    expect(screen.getByText("Tank 3")).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[style*='background']")?.style.background).toBe("rgb(220, 38, 38)");
  });

  it("value is the widget's value tag", () => {
    draw({ type: "textDisplay", bindings: { value: "plc:T" }, dynamics: { label: { expr: "value > 20 ? 'hot' : 'cold'" } } }, { "plc:T": 25 });
    expect(screen.getByText("hot")).toBeTruthy();
  });

  it("rotate and disabled act on the wrapper", () => {
    const { container } = draw({ type: "symbol", props: { symbolId: "valve" },
      dynamics: { rotate: { expr: "{plc:A}", transform: { kind: "linear", in: [0, 100], out: [0, 90] } }, disabled: { expr: "{plc:Lock}" } } },
      { "plc:A": 50, "plc:Lock": true });
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.style.transform).toBe("rotate(45.0deg)");
    expect(wrap.style.pointerEvents).toBe("none");
  });

  it("blink flashes the blink color at its period", () => {
    vi.useFakeTimers();
    const { container } = draw({ type: "led", props: { blinkPeriodMs: 400, blinkColor: "#ff0000" }, dynamics: { blink: { expr: "{plc:Alarm}" } } },
      { "plc:Alarm": true });
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.style.outline).toBe("2px solid #ff0000");
    act(() => { vi.advanceTimersByTime(200); });
    expect(wrap.style.outline).toBe("");
  });

  it("a faceplate fills its parameters into its widgets' expressions", () => {
    const fp: Faceplate = { id: "fp", name: "Pump", params: [{ name: "run" }], widgets: [
      { localId: "t", type: "textDisplay", x: 0, y: 0, w: 2, h: 1, props: { staticText: "x" }, dynamics: { label: { expr: "{run} ? 'running' : 'stopped'" } } },
    ] };
    const h = { ...host({ "plc:P1": true }), useFaceplate: (id: string) => (id === "fp" ? fp : undefined) };
    render(<WidgetHostProvider value={h}><WidgetRenderer w={{ id: "i", type: "faceplate", x: 0, y: 0, w: 4, h: 4, props: { faceplateId: "fp", params: { run: "plc:P1" } } } as Widget} /></WidgetHostProvider>);
    expect(screen.getByText("running")).toBeTruthy();
  });
});
