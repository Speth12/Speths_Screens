import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomWidget, Widget } from "@speths-screens/shared-types";
import { WidgetRenderer } from "./widgets";
import { WidgetHostProvider, inertHost, type TagState, type WidgetHost } from "./host";
import { PopupLayer, popupBox } from "./popup";

afterEach(cleanup);

// A pump faceplate: the speed of the pump it is given, and a Done button that closes it.
const pump: CustomWidget = { id: "pump", name: "Pump", params: [{ name: "speed" }], width: 300, height: 120, widgets: [
  { localId: "v", type: "numericDisplay", x: 0, y: 0, w: 200, h: 80, bindings: { value: "{speed}" } },
  { localId: "done", type: "button", x: 200, y: 80, w: 100, h: 40, props: { label: "Done" }, events: { onClick: [{ type: "closePopup" }] } },
] };
const opener = (extra: object = {}): Widget => ({
  id: "b1", type: "button", x: 0, y: 0, w: 2, h: 1, props: { label: "Pump 1" },
  events: { onClick: [{ type: "openPopup", customWidgetId: "pump", params: { speed: "plc:P1.speed" }, title: "Pump 1", ...extra }] },
}) as Widget;

function draw(w: Widget) {
  const good = (value: unknown): TagState => ({ value, quality: "Good", ts: 1 });
  const host: WidgetHost = {
    ...inertHost, useCustomWidget: (id) => (id === "pump" ? pump : undefined),
    useTag: (p) => (p === "plc:P1.speed" ? good(1450) : inertHost.useTag(p)),
    useTags: (ps) => Object.fromEntries(ps.map((p) => [p, p === "plc:P1.speed" ? good(1450) : inertHost.useTag(p)])),
    requestWrite: vi.fn(),
  };
  render(<WidgetHostProvider value={host}><PopupLayer render={(x) => <WidgetRenderer w={x} />}><WidgetRenderer w={w} /></PopupLayer></WidgetHostProvider>);
}
const open = () => fireEvent.click(screen.getByText("Pump 1"));

describe("a popup", () => {
  it("opens the custom widget with the tags the button gives it, under its title", () => {
    draw(opener());
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    const dialog = screen.getByRole("dialog", { name: "Pump 1" });
    expect(dialog.textContent).toContain("1450");
  });

  it.each([
    ["its X", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ["a click outside it", () => fireEvent.pointerDown(screen.getByTestId("popup-backdrop"))],
    ["a Close popup action inside it", () => fireEvent.click(screen.getByText("Done"))],
  ])("closes with %s", (_name, close) => {
    draw(opener());
    open();
    act(() => close());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a click inside it does not close it", () => {
    draw(opener());
    open();
    fireEvent.pointerDown(screen.getByTestId("popup"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("is its designed size, or the size the action gives, plus its title bar", () => {
    draw(opener());
    open();
    expect(screen.getByTestId("popup").style.width).toBe("300px");
    cleanup();
    draw(opener({ width: 500, height: 200 }));
    open();
    expect(screen.getByTestId("popup").style.width).toBe("500px");
    expect(screen.getByTestId("popup").style.height).toBe("236px");
  });

  it("without a popup layer (the IDE canvas) the action does nothing", () => {
    const host: WidgetHost = { ...inertHost, useCustomWidget: () => pump };
    render(<WidgetHostProvider value={host}><WidgetRenderer w={opener()} /></WidgetHostProvider>);
    open();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("where the window goes", () => {
  const screenSize = { width: 1000, height: 800 };
  const size = { width: 300, height: 164 }; // 200 with the title bar
  it("in the middle", () => {
    expect(popupBox({}, size, screenSize)).toEqual({ left: 350, top: 300, width: 300, height: 200 });
  });
  it("under the widget that opened it", () => {
    expect(popupBox({ position: "widget", anchor: { left: 100, top: 50, right: 200, bottom: 90 } }, size, screenSize)).toMatchObject({ left: 100, top: 98 });
  });
  it("above it when there is no room below, and always inside the screen", () => {
    expect(popupBox({ position: "widget", anchor: { left: 900, top: 700, right: 980, bottom: 760 } }, size, screenSize)).toEqual({ left: 692, top: 492, width: 300, height: 200 });
  });
  it("a window bigger than the screen is held inside it", () => {
    expect(popupBox({}, { width: 2000, height: 2000 }, screenSize)).toEqual({ left: 8, top: 8, width: 984, height: 784 });
  });
});
