// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { CustomWidgets } from "./CustomWidgets";
import { useProject } from "../store/projectStore";

afterEach(cleanup);

/** A project with one free-layout custom widget, the feature tour's pump card. */
const project = (snap: "pixel" | "grid", parts: { x: number; y: number; w: number; h: number }[], placed?: { w: number; h: number }): Project => ({
  schemaVersion: 6,
  version: "0.1.0",
  canvasSnap: snap,
  datasources: [],
  pages: [{ id: "p1", name: "Main", widgets: placed ? [{ id: "i1", type: "customWidget", x: 0, y: 0, ...placed, props: { customWidgetId: "cw" } }] : [] }],
  customWidgets: [{
    id: "cw", name: "Pump card", params: [{ name: "run" }],
    widgets: parts.map((p, i) => ({ localId: `p${i}`, type: i === 2 ? "button" : "led", ...p })),
  }],
} as unknown as Project);

const PUMP = [{ x: 12, y: 8, w: 80, h: 72 }, { x: 104, y: 8, w: 184, h: 72 }, { x: 12, y: 90, w: 276, h: 58 }];

function openEditor(p: Project) {
  useProject.getState().loadProject(p);
  render(<CustomWidgets />);
  fireEvent.click(screen.getByDisplayValue("Pump card").parentElement!);
  fireEvent.click(screen.getByText("Open Visual Editor"));
  const canvas = screen.getByTestId("custom-widget-canvas");
  const px = (v: string) => parseFloat(v);
  const box = { w: px(canvas.style.width), h: px(canvas.style.height) };
  const parts = Array.from(canvas.querySelectorAll<HTMLElement>("[data-part]")).map((el) => ({
    el, left: px(el.style.left), top: px(el.style.top), right: px(el.style.left) + px(el.style.width), bottom: px(el.style.top) + px(el.style.height),
  }));
  return { canvas, box, parts };
}
const saved = () => useProject.getState().project.customWidgets![0]!.widgets.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));

describe("the custom widget editor", () => {
  it("draws a pixel project's parts inside the box, at the size the widget has on a page", () => {
    const { box, parts } = openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    expect(box).toEqual({ w: 600, h: 320 }); // 300 by 160 px at twice the size
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeLessThanOrEqual(box.w);
      expect(p.bottom).toBeLessThanOrEqual(box.h);
    }
    expect(screen.getByText("300 × 160 px, the size it has on a page — drag to place")).toBeTruthy();
  });

  it("still draws a grid project on 12 by 8 cells", () => {
    const { box, parts } = openEditor(project("grid", [{ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 3, h: 2 }, { x: 0, y: 2, w: 5, h: 1 }]));
    expect(box).toEqual({ w: 864, h: 576 });
    expect(parts[1]!.left).toBe(2 * 72 + 2);
    expect(screen.getByText("12 × 8 grid — drag to place")).toBeTruthy();
  });

  it("opening and saving changes nothing", () => {
    openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.click(screen.getByText("Save & Close"));
    expect(saved()).toEqual(PUMP);
  });

  it("a drag moves a pixel part by pixels of the widget, not of the screen", () => {
    const { parts } = openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[0]!.el, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 120 }); // 40 by 20 on screen, at twice the size
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByText("Save & Close"));
    expect(saved()[0]).toEqual({ x: 32, y: 18, w: 80, h: 72 });
  });

  it("the position fields are in pixels and keep the part inside the box", () => {
    const { parts } = openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    // A real click: press, release, then the click event, which used to reach the canvas and deselect the part.
    fireEvent.mouseDown(parts[0]!.el, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    fireEvent.click(parts[0]!.el);
    expect(screen.getByText("X (px)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "5000" } });
    fireEvent.click(screen.getByText("Save & Close"));
    expect(saved()[0]).toEqual({ x: 220, y: 8, w: 80, h: 72 });
  });

  it("a click on the empty canvas deselects", () => {
    const { canvas, parts } = openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.mouseDown(parts[0]!.el, { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(window);
    fireEvent.click(parts[0]!.el);
    expect(screen.queryByLabelText("X")).toBeTruthy();
    fireEvent.click(canvas);
    expect(screen.queryByLabelText("X")).toBeNull();
  });

  it("a part added in a pixel project starts at a size in pixels", () => {
    openEditor(project("pixel", PUMP, { w: 300, h: 160 }));
    fireEvent.click(screen.getByText("LED"));
    fireEvent.click(screen.getByText("Save & Close"));
    expect(saved()[3]).toEqual({ x: 0, y: 0, w: 168, h: 136 }); // 2 by 2 cells of the page grid
  });
});
