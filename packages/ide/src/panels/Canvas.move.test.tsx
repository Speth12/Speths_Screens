// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { Canvas } from "./Canvas";
import { useProject } from "../store/projectStore";

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const load = (widgets: unknown[], canvasSnap: "pixel" | "grid") => useProject.getState().loadProject({
  schemaVersion: 6, version: "1", canvasSnap, datasources: [],
  pages: [{ id: "p1", name: "Main", widgets }],
} as unknown as Project);

const widget = (id: string) => useProject.getState().project.pages[0]!.widgets.find((w) => w.id === id)!;
const place = (id: string) => { const w = widget(id); return { x: w.x, y: w.y, w: w.w, h: w.h }; };
const box = (id: string) => document.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)!;

/** A pointer event at a position; jsdom's events take no position of their own. */
function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element | Window, x: number, y: number, init: { altKey?: boolean } = {}) {
  const ev = createEvent[type](target as Element, { button: 0, bubbles: true });
  Object.defineProperty(ev, "clientX", { value: x });
  Object.defineProperty(ev, "clientY", { value: y });
  Object.defineProperty(ev, "button", { value: 0 });
  Object.defineProperty(ev, "altKey", { value: !!init.altKey });
  act(() => { fireEvent(target as Element, ev); });
}

const twoWidgets = [
  { id: "a", type: "textDisplay", x: 40, y: 40, w: 100, h: 60 },
  { id: "b", type: "textDisplay", x: 400, y: 200, w: 100, h: 60 },
];

describe("dragging a widget on a pixel canvas", () => {
  it("follows the pointer before it is let go, and changes the project once on release", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerMove", window, 150, 82);
    // Drawn where the drag has it (100 right, 32 down, on the 8 px grid), the project not yet changed.
    expect(box("a").style.left).toBe("144px");
    expect(box("a").style.top).toBe("72px");
    expect(place("a")).toEqual({ x: 40, y: 40, w: 100, h: 60 });
    pointer("pointerUp", window, 150, 82);
    expect(place("a")).toEqual({ x: 144, y: 72, w: 100, h: 60 });
    // One drag is one undo step.
    act(() => useProject.getState().undo());
    expect(place("a")).toEqual({ x: 40, y: 40, w: 100, h: 60 });
  });

  it("lands on a neighbor's edge and shows the line", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerMove", window, 413, 50); // left edge at 403: within reach of b's left edge at 400
    expect(document.querySelectorAll('[data-testid="snap-guide"]').length).toBe(1);
    pointer("pointerUp", window, 413, 50);
    expect(place("a").x).toBe(400);
    expect(document.querySelectorAll('[data-testid="snap-guide"]').length).toBe(0);
  });

  it("with Alt held lands exactly where it is put", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerMove", window, 413, 53, { altKey: true });
    pointer("pointerUp", window, 413, 53, { altKey: true });
    expect(place("a")).toEqual({ x: 403, y: 43, w: 100, h: 60 });
  });

  it("goes back where it was on Escape", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerMove", window, 250, 250);
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    pointer("pointerUp", window, 250, 250);
    expect(place("a")).toEqual({ x: 40, y: 40, w: 100, h: 60 });
  });

  it("a press without movement only selects", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerUp", window, 51, 51);
    expect(place("a")).toEqual({ x: 40, y: 40, w: 100, h: 60 });
    expect(useProject.getState().selectedWidgetId).toBe("a");
  });

  it("does not move a locked widget", () => {
    load([{ ...twoWidgets[0], locked: true }, twoWidgets[1]], "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerMove", window, 250, 250);
    pointer("pointerUp", window, 250, 250);
    expect(place("a")).toEqual({ x: 40, y: 40, w: 100, h: 60 });
  });

  it("resizes from a corner handle", () => {
    load(twoWidgets, "pixel");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 50, 50);
    pointer("pointerUp", window, 50, 50); // select it: the handles appear
    const handle = box("a").querySelector<HTMLElement>('[data-resize="br"]')!;
    expect(handle).toBeTruthy();
    pointer("pointerDown", handle, 140, 100);
    pointer("pointerMove", window, 190, 130);
    expect(box("a").style.width).toBe("152px");
    pointer("pointerUp", window, 190, 130);
    expect(place("a")).toEqual({ x: 40, y: 40, w: 152, h: 88 });
  });
});

describe("dragging a widget on the cell grid", () => {
  it("moves by whole cells and stays inside the columns", () => {
    load([{ id: "a", type: "textDisplay", x: 1, y: 0, w: 3, h: 2 }], "grid");
    render(<Canvas />);
    pointer("pointerDown", box("a"), 100, 10);
    pointer("pointerMove", window, 100 + 2 * 88 + 10, 10 + 72); // two columns of 88 px, one row of 72 px
    pointer("pointerUp", window, 100 + 2 * 88 + 10, 10 + 72);
    expect(place("a")).toEqual({ x: 3, y: 1, w: 3, h: 2 });
    pointer("pointerDown", box("a"), 100, 10);
    pointer("pointerMove", window, 5000, 10);
    pointer("pointerUp", window, 5000, 10);
    expect(place("a").x).toBe(9); // 12 columns, 3 wide
  });
});
