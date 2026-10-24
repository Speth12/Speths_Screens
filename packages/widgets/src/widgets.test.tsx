import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Faceplate, Widget } from "@speths-screens/shared-types";
import { RENDERED_TYPES, WidgetRenderer, toggled, rewriteBinding } from "./widgets";
import { WidgetHostProvider, EMPTY_TAG, inertHost, type TagState, type WidgetHost, type AlarmView } from "./host";
import { SYMBOLS } from "./symbols";

afterEach(cleanup);

/** A host with fixed tag values that records every write and navigation. */
function fakeHost(values: Record<string, unknown> = {}, extra: Partial<WidgetHost> = {}) {
  const state = (p: string | undefined): TagState =>
    p && p in values ? { value: values[p], quality: "Good", ts: 1 } : EMPTY_TAG;
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

function draw(w: Omit<Partial<Widget>, "type"> & { type: string }, host: WidgetHost = fakeHost()) {
  const widget = { id: "w1", x: 0, y: 0, w: 4, h: 4, ...w } as Widget;
  return render(<WidgetHostProvider value={host}><WidgetRenderer w={widget} /></WidgetHostProvider>);
}

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
    widgets: [{ localId: "v", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, binding: "plc:{pump}.speed" }],
  } as unknown as Faceplate;
  const alarms: AlarmView[] = [{ id: "a1", severity: "warning", ruleName: "Hot", message: "temp high", active: true, acked: false }];
  const values = { "plc:T": 42.5, "plc:On": true, "plc:Name": "Mixer", "plc:P1.speed": 1450, "plc:State": 1 };
  const host = fakeHost(values, {
    useFaceplate: (id) => (id === "fp1" ? fp : undefined),
    useAlarms: () => ({ alarms }),
    useImage: (id) => (id === "img1" ? "data:image/png;base64,AAAA" : undefined),
  });
  const sym = SYMBOLS[0]!;
  const cases: { type: string; w: Partial<Widget>; shows: string | RegExp }[] = [
    { type: "gauge",          w: { binding: "plc:T", config: { unit: "°C" } }, shows: "42.5 °C" },
    { type: "numericDisplay", w: { binding: "plc:T" },                          shows: "42.50" },
    { type: "textDisplay",    w: { binding: "plc:Name" },                       shows: "Mixer" },
    { type: "textDisplay",    w: { binding: "Pump status" },                    shows: "Pump status" },
    { type: "led",            w: { binding: "plc:On", config: { trueLabel: "RUN" } }, shows: "RUN" },
    { type: "tank",           w: { binding: "plc:T", config: { unit: "%" } },   shows: "42.50" },
    { type: "button",         w: { binding: "plc:On", config: { label: "Start" } }, shows: /Start/ },
    { type: "setpoint",       w: { binding: "plc:T" },                          shows: "43" },
    { type: "trend",          w: { binding: "plc:T" },                          shows: "5m" },
    { type: "numericInput",   w: { binding: "plc:T" },                          shows: "42.50" },
    { type: "textInput",      w: { binding: "plc:Name" },                       shows: "Mixer" },
    { type: "historyLog",     w: { binding: "plc:T" },                          shows: "No history" },
    { type: "multiState",     w: { binding: "plc:State" },                      shows: "RUNNING" },
    { type: "alarmBanner",    w: {},                                            shows: "Hot — temp high" },
    { type: "image",          w: { config: { src: "", label: "x" } },           shows: "No image" },
    { type: "symbol",         w: { config: { symbolId: sym.id, label: "Valve 1" } }, shows: "Valve 1" },
    { type: "faceplate",      w: { config: { faceplateId: "fp1", params: { pump: "P1" } } }, shows: "1450" },
    { type: "table",          w: { config: { rows: [{ label: "Temp", binding: "plc:T" }] } }, shows: "42.50" },
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
});

describe("writes go through the host", () => {
  it("a momentary button writes at once, press and release", () => {
    const host = fakeHost();
    draw({ type: "button", binding: "plc:Start", config: { momentary: true, onValue: 1, offValue: 0 } }, host);
    fireEvent.pointerDown(screen.getByRole("button"));
    fireEvent.pointerUp(screen.getByRole("button"));
    expect(host.write).toHaveBeenNthCalledWith(1, { binding: "plc:Start", value: 1, widgetId: "w1" });
    expect(host.write).toHaveBeenNthCalledWith(2, { binding: "plc:Start", value: 0, widgetId: "w1" });
    expect(host.requestWrite).not.toHaveBeenCalled();
  });

  it("a toggle button asks for the opposite value", () => {
    const host = fakeHost({ "plc:Run": true });
    draw({ type: "button", binding: "plc:Run", config: { momentary: false, onValue: 1, offValue: 0 } }, host);
    fireEvent.click(screen.getByRole("button"));
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:Run", value: 0, label: "OFF (0)", widgetId: "w1" });
  });

  it("a navigate button navigates", () => {
    const host = fakeHost();
    draw({ type: "button", config: { action: "navigate", navigateTo: "p2" } }, host);
    fireEvent.click(screen.getByRole("button"));
    expect(host.navigate).toHaveBeenCalledWith("p2");
  });

  it("a numeric input writes the keypad entry", () => {
    const host = fakeHost({ "plc:SP": 5 });
    draw({ type: "numericInput", binding: "plc:SP" }, host);
    fireEvent.click(screen.getByText("5"));
    fireEvent.click(screen.getByText("⌫")); // the keypad starts from the current value
    fireEvent.click(screen.getByText("7"));
    fireEvent.click(screen.getByText("✓"));
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:SP", value: 7, widgetId: "w1" });
  });

  it("an onClick action writes through requestWrite", () => {
    const host = fakeHost({ "plc:Count": 4 });
    draw({
      type: "numericDisplay", binding: "plc:Count",
      dynamics: [{ id: "d1", kind: "onClick", actionType: "incrementValue", writeTo: "plc:Count", step: 2 }],
    } as Omit<Partial<Widget>, "type"> & { type: string }, host);
    fireEvent.click(screen.getByText("4").closest("div.relative")!);
    expect(host.requestWrite).toHaveBeenCalledWith({ binding: "plc:Count", value: 6, widgetId: "w1" });
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
