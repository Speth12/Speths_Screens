import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { CustomWidget, FrameSlot, Widget } from "@speths-screens/shared-types";
import { WidgetRenderer } from "./widgets";
import { ChromeFrame } from "./ChromeFrame";
import { WidgetHostProvider, inertHost, type WidgetHost } from "./host";

// A header designed at 400 by 100: a logo at the left, a button anchored right, a bar that stretches.
const header: CustomWidget = {
  id: "hdr", name: "Header", params: [], width: 400, height: 100,
  widgets: [
    { localId: "logo", type: "textDisplay", x: 10, y: 10, w: 80, h: 80, props: { staticText: "LOGO" } },
    { localId: "go", type: "button", x: 300, y: 20, w: 90, h: 60, anchorX: "right", props: { label: "Go" }, events: { onClick: [{ type: "navigate", page: "p2" }] } },
    { localId: "bar", type: "shape", x: 0, y: 96, w: 400, h: 4, anchorX: "stretch", anchorY: "bottom" },
  ],
};
const host: WidgetHost = { ...inertHost, useCustomWidget: (id) => (id === "hdr" ? header : undefined) };
const part = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-part="${id}"]`)!;

// jsdom measures nothing: a ResizeObserver that reports the box the test sets.
let box = { width: 0, height: 0 };
beforeEach(() => {
  box = { width: 0, height: 0 };
  vi.stubGlobal("ResizeObserver", class {
    constructor(private cb: () => void) {}
    observe(el: HTMLElement) {
      Object.defineProperty(el, "clientWidth", { configurable: true, get: () => box.width });
      Object.defineProperty(el, "clientHeight", { configurable: true, get: () => box.height });
      this.cb();
    }
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("a custom widget with a designed size, placed on a page", () => {
  const draw = () => render(<WidgetHostProvider value={host}><WidgetRenderer w={{ id: "i1", type: "customWidget", x: 0, y: 0, w: 800, h: 200, props: { customWidgetId: "hdr" } } as Widget} /></WidgetHostProvider>);

  it("draws its parts at their designed pixels, and scales the whole to fit, centered", () => {
    box = { width: 800, height: 300 };
    const { container } = draw();
    expect(container.querySelector("[data-designed]")!.getAttribute("data-designed")).toBe("scaled");
    expect(part(container, "go").style.left).toBe("300px");
    expect(part(container, "go").style.width).toBe("90px");
    // 800 by 300 fits 400 by 100 twice; 100 px of height is left over, 50 above and 50 below.
    const inner = part(container, "logo").parentElement!;
    expect(inner.style.width).toBe("400px");
    expect(inner.style.transform).toBe("translate(0px, 50px) scale(2)");
  });

  it("draws at its own size until the place it is given is measured", () => {
    const { container } = draw();
    expect(part(container, "logo").parentElement!.style.transform).toBe("translate(0px, 0px) scale(1)");
  });
});

describe("a custom widget with a designed size, pinned to a screen edge", () => {
  const frame: FrameSlot[] = [{ id: "header", customWidgetId: "hdr", edge: "top", size: 100 }];
  const draw = (slots = frame) => render(<WidgetHostProvider value={host}><ChromeFrame frame={slots} device="desktop"><div data-testid="page">page</div></ChromeFrame></WidgetHostProvider>);

  it("is not scaled: its parts follow their anchors", () => {
    box = { width: 1200, height: 100 };
    const { container } = draw();
    expect(container.querySelector("[data-designed]")!.getAttribute("data-designed")).toBe("anchored");
    expect(part(container, "logo").style.cssText).toContain("left: 10px");
    expect(part(container, "go").style.right).toBe("10px");
    expect(part(container, "go").style.left).toBe("");
    expect(part(container, "bar").style.left).toBe("0px");
    expect(part(container, "bar").style.right).toBe("0px");
    expect(part(container, "bar").style.bottom).toBe("0px");
    expect(container.querySelector("[style*='scale(']")).toBeNull();
  });

  it("a custom widget placed inside it is scaled again, not anchored", () => {
    const inner: CustomWidget = { id: "in", name: "Inner", params: [], width: 50, height: 50, widgets: [{ localId: "x", type: "textDisplay", x: 0, y: 0, w: 50, h: 50 }] };
    const outer: CustomWidget = { ...header, widgets: [{ localId: "nested", type: "customWidget", x: 0, y: 0, w: 100, h: 100, props: { customWidgetId: "in" } }] };
    const h2: WidgetHost = { ...inertHost, useCustomWidget: (id) => (id === "hdr" ? outer : id === "in" ? inner : undefined) };
    const { container } = render(<WidgetHostProvider value={h2}><ChromeFrame frame={frame} device="desktop"><div /></ChromeFrame></WidgetHostProvider>);
    expect([...container.querySelectorAll("[data-designed]")].map((e) => e.getAttribute("data-designed"))).toEqual(["anchored", "scaled"]);
  });

  it("an overlay slot lies over the page and takes no room from it", () => {
    const { container, getByTestId } = draw([{ ...frame[0]!, overlay: true }, { id: "foot", customWidgetId: "hdr", edge: "bottom", size: 40, overlay: true }]);
    const slot = getByTestId("frame-header");
    expect(slot.hasAttribute("data-overlay")).toBe(true);
    expect(slot.style.position).toBe("absolute");
    expect(slot.style.top).toBe("0px");
    expect(slot.style.height).toBe("100px");
    expect(getByTestId("frame-foot").style.bottom).toBe("0px");
    // Both lie inside the page's area, beside the page.
    expect(slot.parentElement).toBe(getByTestId("page").parentElement);
    expect(container.querySelectorAll("[data-overlay]").length).toBe(2);
  });

  it("a slot that pushes the page aside is not inside the page's area", () => {
    const { getByTestId } = draw();
    expect(getByTestId("frame-header").parentElement).not.toBe(getByTestId("page").parentElement);
    expect(getByTestId("frame-header").style.position).toBe("");
  });
});

describe("a custom widget without a designed size", () => {
  it("still places its parts as fractions of its place, as before", () => {
    const old: CustomWidget = { id: "old", name: "Old", params: [], widgets: [{ localId: "a", type: "textDisplay", x: 2, y: 1, w: 2, h: 1 }] };
    const h: WidgetHost = { ...inertHost, useCustomWidget: () => old };
    const { container } = render(<WidgetHostProvider value={h}><WidgetRenderer w={{ id: "i", type: "customWidget", x: 0, y: 0, w: 4, h: 2, props: { customWidgetId: "old" } } as Widget} /></WidgetHostProvider>);
    expect(container.querySelector("[data-designed]")).toBeNull();
    const cell = container.querySelector<HTMLElement>(".absolute")!;
    expect([cell.style.left, cell.style.top, cell.style.width]).toEqual(["50%", "50%", "50%"]);
  });
});

