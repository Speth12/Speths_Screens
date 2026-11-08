import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomWidget, Widget } from "@speths-screens/shared-types";
import { RENDERED_TYPES, WidgetRenderer, actionWrite, parsePipePoints, toggled, rewriteBinding } from "./widgets";
import { WidgetHostProvider, EMPTY_TAG, inertHost, type TagState, type WidgetHost, type AlarmView } from "./host";
import { SYMBOLS } from "./symbols";
import { driverSummary, formatClock } from "./shell";

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
  const fp: CustomWidget = {
    id: "fp1", name: "Pump", params: [{ name: "pump" }],
    widgets: [{ localId: "v", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, bindings: { value: "plc:{pump}.speed" } }],
  };
  const alarms: AlarmView[] = [{ id: "a1", severity: "warning", ruleName: "Hot", message: "temp high", active: true, acked: false }];
  const values = { "plc:T": 42.5, "plc:On": true, "plc:Name": "Mixer", "plc:P1.speed": 1450, "plc:State": 1 };
  const host = fakeHost(values, {
    useCustomWidget: (id) => (id === "fp1" ? fp : undefined),
    useAlarms: () => ({ alarms }),
    useImage: (id) => (id === "img1" ? "data:image/png;base64,AAAA" : undefined),
    usePages: () => ({ pages: [{ id: "p1", name: "Overview" }, { id: "p2", name: "Pumps" }], activeId: "p1" }),
    useDrivers: () => [{ id: "plc", label: "PLC", connected: true }, { id: "mqtt", label: "Broker", connected: false }],
    useUser: () => ({ name: "dan", role: "admin", loginRequired: true, logout: () => {} }),
    useRecipes: () => [{ id: "r1", name: "Batch A", entries: [{ binding: "plc:Setpoint", value: 40 }] }],
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
    { type: "pipe",           w: { props: { label: "Feed line", points: "0,50 100,50" } },  shows: "" },
    { type: "customWidget",      w: { props: { customWidgetId: "fp1", params: { pump: "P1" } } }, shows: "1450" },
    { type: "table",          w: { props: { rows: [{ label: "Temp", binding: "plc:T" }] } }, shows: "42.50" },
    { type: "pageList",       w: {},                                                   shows: "Pumps" },
    { type: "clock",          w: { props: { format: "date", showWeekday: false } },    shows: /\d/ },
    { type: "driverStatus",   w: {},                                                   shows: "Broker" },
    { type: "userMenu",       w: {},                                                   shows: "" },
    { type: "recipes",        w: {},                                                   shows: "Batch A" },
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

  describe("a custom widget laid out as a stack", () => {
    const header: CustomWidget = {
      id: "hdr", name: "Header", params: [],
      layout: { mode: "stack", direction: "row", gap: 4, phone: { direction: "column" } },
      widgets: [
        { localId: "title", type: "textDisplay", x: 0, y: 0, w: 2, h: 1, props: { staticText: "Plant" }, flex: { grow: 1 } },
        { localId: "clock", type: "textDisplay", x: 0, y: 0, w: 2, h: 1, props: { staticText: "12:00" }, hiddenOn: ["phone"] },
      ],
    };
    const show = (device: "desktop" | "tablet" | "phone") =>
      draw({ type: "customWidget", props: { customWidgetId: "hdr" } }, fakeHost({}, { useCustomWidget: () => header, useDevice: () => device }));

    it("lays its parts out in a flex container that grows the title", () => {
      const { container } = show("desktop");
      const stack = screen.getByText("Plant").closest("[style*='flex: 1 1 0px']")!.parentElement!;
      expect(stack.style.display).toBe("flex");
      expect(stack.style.flexDirection).toBe("row");
      expect(screen.getByText("12:00")).toBeTruthy();
      expect(container.querySelectorAll(".absolute").length).toBe(0);
    });

    it("turns to a column and leaves the clock out on a phone", () => {
      show("phone");
      expect(screen.getByText("Plant").closest("[style*='flex']")!.parentElement!.style.flexDirection).toBe("column");
      expect(screen.queryByText("12:00")).toBeNull();
    });
  });

  describe("quality is shown only when it is not Good, unless the widget says otherwise", () => {
    const bad = { value: null, quality: "Bad" as const, ts: 0 };
    const show = (props: Record<string, unknown>, quality: "Good" | "Bad") =>
      draw({ type: "numericDisplay", bindings: { value: "plc:T" }, props }, fakeHost({}, { useTag: () => (quality === "Bad" ? bad : { value: 5, quality: "Good", ts: 1 }) }));
    it("a Good value has no label, a Bad one says so", () => {
      show({}, "Good");
      expect(screen.queryByText("Good")).toBeNull();
      cleanup();
      show({}, "Bad");
      expect(screen.getByText("Bad")).toBeTruthy();
    });
    it("showQuality true always says it; false never does", () => {
      show({ showQuality: true }, "Good");
      expect(screen.getByText("Good")).toBeTruthy();
      cleanup();
      show({ showQuality: false }, "Bad");
      expect(screen.queryByText("Bad")).toBeNull();
    });
  });

  it("a text widget draws at the size it is given, and a button does not say its label twice", () => {
    const { container } = draw({ type: "textDisplay", props: { staticText: "small", fontSize: "xs" } });
    expect(container.querySelector(".text-lg")).toBeNull();
    cleanup();
    const big = draw({ type: "textDisplay", props: { staticText: "default" } });
    expect(big.container.querySelector(".text-lg")).not.toBeNull();
    cleanup();
    draw({ type: "button", props: { label: "Start" } });
    expect(screen.getAllByText("Start").length).toBe(1);
  });

  it("a custom widget inside another passes the outer one's parameters on", () => {
    const inner: CustomWidget = { id: "in", name: "Inner", params: [{ name: "v" }], widgets: [
      { localId: "n", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, bindings: { value: "{v}" } },
    ] };
    const outer: CustomWidget = { id: "out", name: "Outer", params: [{ name: "speed" }], layout: { mode: "stack", direction: "column" }, widgets: [
      { localId: "i", type: "customWidget", x: 0, y: 0, w: 2, h: 2, props: { customWidgetId: "in", params: { v: "{speed}" } } },
    ] };
    const host = fakeHost({ "plc:Speed": 77 }, { useCustomWidget: (id) => (id === "out" ? outer : id === "in" ? inner : undefined) });
    draw({ type: "customWidget", props: { customWidgetId: "out", params: { speed: "plc:Speed" } } }, host);
    expect(screen.getByText("77")).toBeTruthy();
  });

  it("a custom widget that contains itself stops instead of looping", () => {
    const loop: CustomWidget = { id: "loop", name: "Loop", params: [], widgets: [
      { localId: "again", type: "customWidget", x: 0, y: 0, w: 4, h: 4, props: { customWidgetId: "loop" } },
    ] };
    draw({ type: "customWidget", props: { customWidgetId: "loop" } }, fakeHost({}, { useCustomWidget: () => loop }));
    expect(screen.getAllByText("nested too deep").length).toBe(1);
  });

  it("a custom widget fills its parameters into its widgets' action tags", () => {
    const fp: CustomWidget = { id: "fp1", name: "Pump", params: [{ name: "pump" }], widgets: [
      { localId: "run", type: "button", x: 0, y: 0, w: 2, h: 2, props: { label: "Run" },
        events: { onPress: [{ type: "write", tag: "plc:{pump}.run", value: true }] } },
    ] };
    const host = fakeHost({}, { useCustomWidget: () => fp });
    draw({ type: "customWidget", props: { customWidgetId: "fp1", params: { pump: "P7" } } }, host);
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

  it("rewriteBinding fills custom widget parameters and leaves unknown ones", () => {
    expect(rewriteBinding("plc:{pump}.{x}", { pump: "P1" })).toBe("plc:P1.{x}");
    expect(rewriteBinding(undefined, {})).toBeUndefined();
  });
});

describe("process graphics", () => {
  const polylines = (c: HTMLElement) => Array.from(c.querySelectorAll("polyline"));
  const style = (c: HTMLElement) => c.querySelector("style")?.textContent ?? "";

  it("a pipe draws its corners, a dark outline under its color", () => {
    const { container } = draw({ type: "pipe", props: { points: "0,50 60,50 60,100", weight: 10, color: "#336699" } });
    const lines = polylines(container);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.getAttribute("points"))).toEqual(["0,50 60,50 60,100", "0,50 60,50 60,100"]);
    expect(lines[1]!.style.stroke).toBe("rgb(51, 102, 153)");
    expect(lines[1]!.style.strokeWidth).toBe("10");
    expect(Number(lines[0]!.style.strokeWidth)).toBeGreaterThan(10);
  });

  it("a pipe takes a design token as its color", () => {
    const { container } = draw({ type: "pipe", props: { color: "var(--process-running)" } });
    expect(container.querySelector("[data-pipe-body]")!.getAttribute("style")).toContain("var(--process-running)");
  });

  it("a pipe with no usable corners is a straight line, not nothing", () => {
    const { container } = draw({ type: "pipe", props: { points: "nonsense 5" } });
    expect(polylines(container)[0]!.getAttribute("points")).toBe("0,50 100,50");
  });

  it("corners outside the widget are held to its edge", () => {
    expect(parsePipePoints("-20,50 150,300")).toEqual([[0, 50], [100, 100]]);
  });

  it("a pipe moves only while flow is true, and reverse runs the other way", () => {
    expect(polylines(draw({ type: "pipe", props: { flow: false } }).container)).toHaveLength(2);
    cleanup();
    const on = draw({ type: "pipe", props: { flow: true } }).container;
    const dashes = polylines(on)[2]!;
    expect(dashes.getAttribute("data-ss-motion")).toBe("flow");
    expect(dashes.getAttribute("style")).toContain("--ss-flow-step: -18");
    cleanup();
    const back = draw({ type: "pipe", props: { flow: true, reverse: true } }).container;
    expect(polylines(back)[2]!.getAttribute("style")).toContain("--ss-flow-step: 18");
  });

  it("the flow honors a request for less motion", () => {
    const { container } = draw({ type: "pipe", props: { flow: true } });
    expect(style(container)).toContain("prefers-reduced-motion: reduce");
    expect(style(container)).toContain("animation: none");
  });

  it("a symbol spins or pulses only while animate is true", () => {
    const sym = SYMBOLS[0]!;
    const motion = (c: HTMLElement) => c.querySelector("[data-ss-motion]");
    expect(motion(draw({ type: "symbol", props: { symbolId: sym.id, motion: "spin", animate: false } }).container)).toBeNull();
    cleanup();
    const spin = motion(draw({ type: "symbol", props: { symbolId: sym.id, motion: "spin", animate: true, cycleSeconds: 3 } }).container)!;
    expect(spin.getAttribute("data-ss-motion")).toBe("spin");
    expect((spin as HTMLElement).style.animation).toContain("ss-spin 3s");
    cleanup();
    const pulse = motion(draw({ type: "symbol", props: { symbolId: sym.id, motion: "pulse", animate: true } }).container)!;
    expect((pulse as HTMLElement).style.animation).toContain("ss-pulse 2s");
    cleanup();
    expect(motion(draw({ type: "symbol", props: { symbolId: sym.id, animate: true } }).container)).toBeNull();
  });

  it("a driven flow turns the flow on from a tag", () => {
    const w = { type: "pipe", props: {}, dynamics: { flow: { expr: "{plc:Run} == 1" } } } as W;
    expect(polylines(draw(w, fakeHost({ "plc:Run": 1 })).container)).toHaveLength(3);
    cleanup();
    expect(polylines(draw(w, fakeHost({ "plc:Run": 0 })).container)).toHaveLength(2);
  });
});

describe("a drawing is not a card", () => {
  it("a pipe has no background, border or padding", () => {
    const { container } = draw({ type: "pipe", props: { label: "Feed" } });
    const el = container.querySelector("svg")!.closest("[style*='padding']") as HTMLElement;
    expect(el.style.background).toBe("transparent");
    expect(el.style.borderStyle).toBe("none");
    expect(el.style.padding).toMatch(/^0/);
  });
  it("a symbol is bare unless it has its own background or border, and shows its label once", () => {
    const sym = SYMBOLS[0]!;
    const { container } = draw({ type: "symbol", props: { symbolId: sym.id, label: "Valve 1" } });
    expect(screen.getAllByText("Valve 1")).toHaveLength(1);
    expect(container.querySelector("[style*='padding: 0']")).toBeTruthy();
    cleanup();
    const boxed = draw({ type: "symbol", props: { symbolId: sym.id, label: "Valve 1", bgColor: "#fff" } }).container;
    expect(boxed.querySelector("[style*='padding: 0']")).toBeNull();
  });
});

describe("header and navigation widgets", () => {
  const pages = [{ id: "p1", name: "Overview", icon: "home" as const }, { id: "p2", name: "Pumps", group: "Plant" }, { id: "p3", name: "Tanks", group: "Plant" }];
  const withPages = (navigate = vi.fn()) => fakeHost({}, { usePages: () => ({ pages, activeId: "p2" }), navigate });

  it("the page list marks the open page and goes to the one clicked", () => {
    const host = withPages();
    draw({ type: "pageList" }, host);
    expect(screen.getByRole("button", { name: /Pumps/ }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: /Tanks/ }));
    expect(host.navigate).toHaveBeenCalledWith("p3");
  });

  it("the list groups pages under their heading, and the heading can be left out", () => {
    draw({ type: "pageList" }, withPages());
    expect(screen.getByText("Plant")).toBeTruthy();
    cleanup();
    draw({ type: "pageList", props: { showGroups: false } }, withPages());
    expect(screen.queryByText("Plant")).toBeNull();
  });

  it.each(["tabs", "icons", "bar"] as const)("the %s style lists every page", (style) => {
    draw({ type: "pageList", props: { style } }, withPages());
    expect(screen.getAllByText(/Overview|Pumps|Tanks/).length).toBe(3);
  });

  it("the page names read in the language shown", () => {
    draw({ type: "pageList", props: { style: "tabs" } }, fakeHost({}, { usePages: () => ({ pages, activeId: "p1" }), useTranslate: () => (t: string) => (t === "Pumps" ? "Pumpen" : t) }));
    expect(screen.getByRole("tab", { name: "Pumpen" })).toBeTruthy();
  });

  it("formatClock follows the chosen format", () => {
    const d = new Date(2026, 10, 6, 15, 4, 9); // Friday
    expect(formatClock(d, { format: "time", showWeekday: false }, "en-GB")).toBe("15:04");
    expect(formatClock(d, { showWeekday: false }, "en-GB")).toBe("15:04:09");
    expect(formatClock(d, { format: "date", showWeekday: false }, "en-GB")).toBe("6 Nov");
    expect(formatClock(d, { format: "dateTime" }, "en-GB")).toBe("Fri 6 Nov 15:04");
    expect(formatClock(d, { format: "time", hour12: true, showWeekday: false }, "en-US")).toMatch(/^0?3:04\s?PM$/);
  });

  it("driver status shows a chip each with the state in words, or one summary", () => {
    const drivers = [{ id: "plc", label: "PLC", connected: true }, { id: "mqtt", label: "Broker", connected: false, lastError: "refused" }];
    draw({ type: "driverStatus" }, fakeHost({}, { useDrivers: () => drivers }));
    expect(screen.getByTestId("driver-mqtt").getAttribute("data-connected")).toBe("false");
    expect(screen.getByTestId("driver-mqtt").title).toContain("refused");
    expect(screen.getByText("(not connected)")).toBeTruthy();
    cleanup();
    draw({ type: "driverStatus", props: { compact: true } }, fakeHost({}, { useDrivers: () => drivers }));
    expect(screen.getByTestId("driver-summary").textContent).toBe("1/2");
  });

  it("driverSummary tells none, all, some and no drivers apart", () => {
    const d = (connected: boolean) => ({ id: "x", connected });
    expect(driverSummary([]).state).toBe("none");
    expect(driverSummary([d(true), d(true)]).state).toBe("ok");
    expect(driverSummary([d(true), d(false)]).state).toBe("partial");
    expect(driverSummary([d(false)]).state).toBe("down");
  });

  it("the user menu shows who is signed in and logs out", () => {
    const logout = vi.fn();
    draw({ type: "userMenu" }, fakeHost({}, { useUser: () => ({ name: "dan", role: "admin", loginRequired: true, logout }) }));
    fireEvent.click(screen.getByRole("button", { name: "Signed in as dan" }));
    expect(screen.getByText("admin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalled();
  });

  it("the menu is drawn outside the widget, so a header that clips its contents cannot hide it", () => {
    const { container } = draw({ type: "userMenu" }, fakeHost({}, { useUser: () => ({ name: "dan", loginRequired: true }) }));
    fireEvent.click(screen.getByRole("button", { name: "Signed in as dan" }));
    const menu = screen.getByRole("menu");
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it("with login required and nobody in, it says so; with security off, it says that", () => {
    draw({ type: "userMenu" }, fakeHost({}, { useUser: () => ({ loginRequired: true }) }));
    fireEvent.click(screen.getByRole("button", { name: "User" }));
    expect(screen.getByText("Not signed in.")).toBeTruthy();
    cleanup();
    draw({ type: "userMenu" }, fakeHost({}, { useUser: () => ({ loginRequired: false }) }));
    fireEvent.click(screen.getByRole("button", { name: "User" }));
    expect(screen.getByText("Security is off")).toBeTruthy();
  });
});

describe("recipes widget", () => {
  const recipes = [
    { id: "r1", name: "Batch A", description: "Slow ramp", entries: [{ binding: "plc:Setpoint", value: 40 }, { binding: "plc:Mode", value: "auto" }] },
    { id: "r2", name: "Batch B", entries: [{ binding: "plc:Setpoint", value: 80 }] },
  ];
  const withRecipes = (answer: { status?: number; body: unknown }) => {
    const apiFetch = vi.fn(async () => new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 }));
    return { apiFetch, host: fakeHost({}, { useRecipes: () => recipes, apiFetch }) };
  };

  it("lists every recipe with its tags and values, or just the chosen one", () => {
    draw({ type: "recipes" }, withRecipes({ body: {} }).host);
    expect(screen.getByText("Batch A")).toBeTruthy();
    expect(screen.getByText("Batch B")).toBeTruthy();
    expect(screen.getByText("Slow ramp")).toBeTruthy();
    expect(screen.getAllByText("Setpoint = 40").length).toBe(1);
    cleanup();
    draw({ type: "recipes", props: { recipeId: "r2", showEntries: false } }, withRecipes({ body: {} }).host);
    expect(screen.queryByText("Batch A")).toBeNull();
    expect(screen.queryByText(/Setpoint/)).toBeNull();
  });

  it("applies through the runtime and says how many tags were written", async () => {
    const { apiFetch, host } = withRecipes({ body: { ok: true, applied: 2 } });
    draw({ type: "recipes", props: { recipeId: "r1" } }, host);
    fireEvent.click(screen.getByRole("button", { name: "Apply recipe" }));
    expect(await screen.findByText(/Applied 2 tags/)).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/recipes/r1/apply", { method: "POST" });
  });

  it("shows why a recipe was refused", async () => {
    draw({ type: "recipes", props: { recipeId: "r1" } }, withRecipes({ status: 403, body: { error: "forbidden" } }).host);
    fireEvent.click(screen.getByRole("button", { name: "Apply recipe" }));
    expect(await screen.findByText(/Not allowed/)).toBeTruthy();
    cleanup();
    draw({ type: "recipes", props: { recipeId: "r1" } }, withRecipes({ status: 200, body: { ok: false, errors: ["plc:Setpoint: above the maximum 50"] } }).host);
    fireEvent.click(screen.getByRole("button", { name: "Apply recipe" }));
    expect(await screen.findByText(/above the maximum 50/)).toBeTruthy();
  });

  it("says so when there are no recipes", () => {
    draw({ type: "recipes" }, fakeHost());
    expect(screen.getByText("No recipes")).toBeTruthy();
  });
});
