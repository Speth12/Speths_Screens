import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Faceplate, Widget } from "@speths-screens/shared-types";
import { RENDERED_TYPES, WidgetRenderer, actionWrite, toggled, rewriteBinding } from "./widgets";
import { WidgetHostProvider, EMPTY_TAG, inertHost, type TagState, type WidgetHost, type AlarmView } from "./host";
import { SYMBOLS } from "./symbols";

afterEach(cleanup);

const good = (value: unknown): TagState => ({ value, quality: "Good", ts: 1 });

/** A host with fixed tag values that records every write and navigation. */
function fakeHost(values: Record<string, unknown> = {}, extra: Partial<WidgetHost> = {}) {
  const state = (p: string | undefined): TagState => (p && p in values ? good(values[p]) : EMPTY_TAG);
  const host: WidgetHost = {
    ...inertHost,
    useTag: state,
    useTags: (paths) => Object.fromEntries(paths.map((p) => [p, state(p)])),
    requestWrite: vi.fn(),
    write: vi.fn(),
    navigate: vi.fn(),
    ...extra,
  };
  return host;
}

type W = Omit<Partial<Widget>, "type"> & { type: string };
function draw(w: W, host: WidgetHost = fakeHost()) {
  const widget = { id: "w1", x: 0, y: 0, w: 4, h: 4, ...w } as Widget;
  return render(<WidgetHostProvider value={host}><WidgetRenderer w={widget} /></WidgetHostProvider>);
}
const tag = (value: string) => ({ bindings: { value } });

describe("widget types", () => {
  it("every widget type in schema.json has a renderer, and the other way round", () => {
    const schema = JSON.parse(readFileSync(resolve(__dirname, "../../../schema.json"), "utf8"));
    const types: string[] = schema.$defs.WidgetType.enum;
    expect([...RENDERED_TYPES].sort()).toEqual([...types].sort());
  });
});

// One case per widget type: what it shows for a given setup.
describe("each widget renders", () => {
  const fp: Faceplate = {
    id: "fp1", name: "Pump", params: [{ name: "pump" }],
    widgets: [{ localId: "v", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, bindings: { value: "plc:{pump}.speed" } }],
  };
  const alarms: AlarmView[] = [{ id: "a1", severity: "warning", ruleName: "Hot", message: "temp high", active: true, acked: false }];
  const values = { "plc:T": 42.5, "plc:On": true, "plc:Name": "Mixer", "plc:P1.speed": 1450, "plc:State": 1 };
  const host = fakeHost(values, {
    useFaceplate: (id) => (id === "fp1" ? fp : undefined),
    useAlarms: () => ({ alarms }),
    useImage: (id) => (id === "img1" ? "data:image/png;base64,AAAA" : undefined),
  });
  const sym = SYMBOLS[0]!;
  const cases: { type: string; w: Omit<W, "type">; shows: string | RegExp }[] = [
    { type: "gauge",          w: { ...tag("plc:T"), props: { unit: "°C" } },           shows: "42.5 °C" },
    { type: "numericDisplay", w: tag("plc:T"),                                         shows: "42.50" },
    { type: "textDisplay",    w: tag("plc:Name"),                                      shows: "Mixer" },
    { type: "textDisplay",    w: { props: { staticText: "Pump status" } },             shows: "Pump status" },
    { type: "led",            w: { ...tag("plc:On"), props: { trueLabel: "RUN" } },     shows: "RUN" },
    { type: "tank",           w: { ...tag("plc:T"), props: { unit: "%" } },             shows: "42.50" },
    { type: "button",         w: { ...tag("plc:On"), props: { label: "Start" } },       shows: /Start/ },
    { type: "setpoint",       w: tag("plc:T"),                                         shows: "43" },
    { type: "trend",          w: tag("plc:T"),                                         shows: "5m" },
    { type: "numericInput",   w: tag("plc:T"),                                         shows: "42.50" },
    { type: "textInput",      w: tag("plc:Name"),                                      shows: "Mixer" },
    { type: "historyLog",     w: tag("plc:T"),                                         shows: "No history" },
    { type: "multiState",     w: tag("plc:State"),                                     shows: "RUNNING" },
    { type: "alarmBanner",    w: {},                                                   shows: "Hot — temp high" },
    { type: "image",          w: { props: { src: "", label: "x" } },                   shows: "No image" },
    { type: "symbol",         w: { props: { symbolId: sym.id, label: "Valve 1" } },    shows: "Valve 1" },
    { type: "faceplate",      w: { props: { faceplateId: "fp1", params: { pump: "P1" } } }, shows: "1450" },
    { type: "table",          w: { props: { rows: [{ label: "Temp", binding: "plc:T" }] } }, shows: "42.50" },
  ];
  for (const c of cases) {
    it(`${c.type}: ${String(c.shows)}`, () => {
      draw({ type: c.type, ...c.w }, host);
      expect(screen.getAllByText(c.shows).length).toBeGreaterThan(0);
    });
  }

  it("covers every widget type", () => {
    expect(new Set(cases.map((c) => c.type))).toEqual(new Set(RENDERED_TYPES));
  });

  it("an unknown type shows its name", () => {
    draw({ type: "sparkline" });
    expect(screen.getByText("sparkline")).toBeTruthy();
  });

  it("the visible tag hides the widget while it is off", () => {
    draw({ type: "numericDisplay", bindings: { value: "plc:T", visible: "plc:Off" } }, fakeHost({ "plc:T": 1, "plc:Off": false }));
    expect(screen.queryByText("1")).toBeNull();
  });
});

describe("events go through the host", () => {
  const momentary = { onPress: [{ type: "write" as const, value: 1 }], onRelease: [{ type: "write" as const, value: 0 }] };

  it("press and release write at once; leaving after release writes nothing more", () => {
    const host = fakeHost();
    draw({ type: "button", ...tag("plc:Start"), events: momentary }, host);
    const b = screen.getByRole("button");
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    fireEvent.pointerLeave(b);
    expect(host.write).toHaveBeenNthCalledWith(1, { binding: "plc:Start", value: 1, widgetId: "w1" });
    expect(host.write).toHaveBeenNthCalledWith(2, { binding: "plc:Start", value: 0, widgetId: "w1" });
    expect(host.write).toHaveBeenCalledTimes(2);
    expect(host.requestWrite).not.toHaveBeenCalled();
  });

  it("leaving while pressed releases", () => {
    const host = fakeHost();
    draw({ type: "button", ...tag("plc:Start"), events: momentary }, host);
    fireEvent.pointerDown(screen.getByRole("button"));
    fireEvent.pointerLeave(screen.getByRole("button"));
    expect(host.write).toHaveBeenLastCalledWith({ binding: "plc:Start", value: 0, widgetId: "w1" });
  });

  it("a toggle asks for the opposite value, with a label", () => {
    const host = fakeHost({ "plc:Run": true });
    draw({ type: "button", ...tag("plc:Run"), events: { onClick: [{ type: "toggle", on: 1, off: 0 }] } }, host);
    fireEvent.click(screen.getByRole("button"));
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:Run", value: 0, label: "OFF (0)", widgetId: "w1" });
  });

  it("navigate and an action on another tag", () => {
    const host = fakeHost({ "plc:Count": 4 });
    draw({ type: "numericDisplay", ...tag("plc:Count"),
      events: { onClick: [{ type: "navigate", page: "p2" }, { type: "increment", tag: "plc:Count", step: 2 }] } }, host);
    fireEvent.click(screen.getByText("4").closest("div.relative")!);
    expect(host.navigate).toHaveBeenCalledWith("p2");
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:Count", value: 6, widgetId: "w1" });
  });

  it("a numeric input writes the keypad entry", () => {
    const host = fakeHost({ "plc:SP": 5 });
    draw({ type: "numericInput", ...tag("plc:SP") }, host);
    fireEvent.click(screen.getByText("5"));
    fireEvent.click(screen.getByText("⌫")); // the keypad starts from the current value
    fireEvent.click(screen.getByText("7"));
    fireEvent.click(screen.getByText("✓"));
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:SP", value: 7, widgetId: "w1" });
  });

  it("a faceplate fills its parameters into its widgets' action tags", () => {
    const fp: Faceplate = { id: "fp1", name: "Pump", params: [{ name: "pump" }], widgets: [
      { localId: "run", type: "button", x: 0, y: 0, w: 2, h: 2, props: { label: "Run" },
        events: { onPress: [{ type: "write", tag: "plc:{pump}.run", value: true }] } },
    ] };
    const host = fakeHost({}, { useFaceplate: () => fp });
    draw({ type: "faceplate", props: { faceplateId: "fp1", params: { pump: "P7" } } }, host);
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(host.write).toHaveBeenCalledWith({ binding: "plc:P7.run", value: true, widgetId: "run" });
  });
});

describe("actionWrite", () => {
  const w = { id: "w1", type: "button", x: 0, y: 0, w: 1, h: 1, bindings: { value: "plc:V" } } as Widget;
  const vals = { "plc:V": good(1), "plc:B": good(false), "plc:N": good(4) };
  it.each([
    ["write to the value tag", { type: "write", value: 5 }, { binding: "plc:V", value: 5, widgetId: "w1" }],
    ["write to another tag", { type: "write", tag: "plc:N", value: "x" }, { binding: "plc:N", value: "x", widgetId: "w1" }],
    ["toggle with values, currently on", { type: "toggle", on: 1, off: 0 }, { binding: "plc:V", value: 0, label: "OFF (0)", widgetId: "w1" }],
    ["toggle without values, a bool", { type: "toggle", tag: "plc:B" }, { binding: "plc:B", value: true, widgetId: "w1" }],
    ["increment by step", { type: "increment", tag: "plc:N", step: 2 }, { binding: "plc:N", value: 6, widgetId: "w1" }],
    ["increment by 1 from nothing", { type: "increment", tag: "plc:Missing" }, { binding: "plc:Missing", value: 1, widgetId: "w1" }],
    ["navigate writes nothing", { type: "navigate", page: "p2" }, undefined],
  ] as const)("%s", (_, action, want) => {
    expect(actionWrite(action as never, w, vals)).toEqual(want);
  });
  it("no tag at all writes nothing", () => {
    expect(actionWrite({ type: "write", value: 1 }, { ...w, bindings: undefined }, vals)).toBeUndefined();
  });
});

describe("helpers", () => {
  it.each([
    [true, false], [false, true], [1, 0], [0, 1], [null, 1], ["", 1],
  ])("toggled(%j) = %j", (cur, want) => expect(toggled(cur)).toBe(want));

  it("rewriteBinding fills faceplate parameters and leaves unknown ones", () => {
    expect(rewriteBinding("plc:{pump}.{x}", { pump: "P1" })).toBe("plc:P1.{x}");
    expect(rewriteBinding(undefined, {})).toBeUndefined();
  });
});
