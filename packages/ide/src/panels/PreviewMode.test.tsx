import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useProject, type Project } from "../store/projectStore";
import { PreviewMode } from "./PreviewMode";

beforeEach(() => {
  // The preview listens for runtime events and measures its window; neither exists in jsdom.
  vi.stubGlobal("WebSocket", class { close() {} onmessage = null; onclose = null; });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 500, top: 0, left: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const led = { id: "w1", type: "led" as const };
const load = (more: Partial<Project>, x: number, y: number, w: number, h: number) =>
  useProject.getState().loadProject({
    schemaVersion: 6, version: "1", datasources: [],
    pages: [{ id: "p1", name: "Main", widgets: [{ ...led, x, y, w, h }] }],
    ...more,
  });

/** The stage (the scaled div) and the box the page's one widget is drawn in. */
function stage(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>('[style*="scale("]')!;
  return { el, box: el.firstElementChild as HTMLElement };
}

describe("PreviewMode layout", () => {
  it("grid: a widget sits on the canvas grid", () => {
    load({}, 1, 2, 2, 1);
    const { box } = stage(render(<PreviewMode onExit={() => {}} />).container);
    expect(box.style).toMatchObject({ left: "88px", top: "144px", width: "168px", height: "64px" });
  });

  it("pixel: the numbers are pixels", () => {
    load({ canvasSnap: "pixel" }, 100, 50, 300, 120);
    const { box } = stage(render(<PreviewMode onExit={() => {}} />).container);
    expect(box.style).toMatchObject({ left: "100px", top: "50px", width: "300px", height: "120px" });
  });

  it("a fixed resolution is the stage, scaled to fit the window", () => {
    load({ canvasSnap: "pixel", canvasResolution: { type: "fixed", width: 2000, height: 1000 } }, 0, 0, 100, 100);
    const { el } = stage(render(<PreviewMode onExit={() => {}} />).container);
    expect(el.style.width).toBe("2000px");
    expect(el.style.height).toBe("1000px");
    expect(el.style.transform).toBe("scale(0.5)");
  });

  it("a dynamic resolution is the widgets' extent, only shrunk to the window", () => {
    load({ canvasSnap: "pixel" }, 0, 0, 3000, 400);
    const { el } = stage(render(<PreviewMode onExit={() => {}} />).container);
    expect(el.style.width).toBe("3000px");
    expect(el.style.transform).toMatch(/^scale\(0\.333/);
  });

  it("a small dynamic page is not scaled up, and keeps the 12 by 6 cell minimum", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 2000, height: 1000, top: 0, left: 0, right: 2000, bottom: 1000, x: 0, y: 0, toJSON() {} });
    load({ canvasSnap: "pixel" }, 0, 0, 100, 100);
    const { el } = stage(render(<PreviewMode onExit={() => {}} />).container);
    expect(el.style.width).toBe("1048px");
    expect(el.style.height).toBe("424px");
    expect(el.style.transform).toBe("scale(1)");
  });
});
