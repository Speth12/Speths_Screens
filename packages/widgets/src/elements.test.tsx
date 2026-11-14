import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, READY_MADE, readyMadeFor, MANIFESTS, type WidgetHost } from "./index";

const host = (value: unknown): WidgetHost => ({ ...inertHost, useTag: (p) => (p ? { ...EMPTY_TAG, value, quality: "Good" } : EMPTY_TAG) });
const plain = { bgColor: "transparent", borderColor: "transparent", showLabel: false };
const draw = (type: string, props: Record<string, unknown>, value: unknown = 42) => renderToStaticMarkup(
  <WidgetHostProvider value={host(value)}>
    <WidgetRenderer w={{ id: "w", type, x: 0, y: 0, w: 4, h: 3, props: { ...plain, ...props }, bindings: { value: "ds:tag" } } as Widget} />
  </WidgetHostProvider>,
);

// The value as text in the page (a number in a drawing's coordinates is inside a tag, not after ">").
const SHOWN = />37\.5/;

describe("an element on its own", () => {
  it("a tank without its value is only the tank, in every style", () => {
    for (const variant of [undefined, "cylinder", "silo", "vessel", "bottle"]) {
      expect(draw("tank", { variant }, 37.5), String(variant)).toMatch(SHOWN);
      expect(draw("tank", { variant, showValue: false }, 37.5), String(variant)).not.toMatch(SHOWN);
    }
  });

  it("a gauge without its value is only the gauge, in every style", () => {
    for (const variant of [undefined, "ring", "half", "dial", "bar", "vbar", "segments"]) {
      expect(draw("gauge", { variant, showTicks: false }, 37.5), String(variant)).toMatch(SHOWN);
      expect(draw("gauge", { variant, showTicks: false, showValue: false }, 37.5), String(variant)).not.toMatch(SHOWN);
    }
  });

  it("a bar with no value and no end values fills its place", () => {
    expect(draw("gauge", { variant: "bar", showValue: false, showTicks: false })).toContain("h-full");
    expect(draw("gauge", { variant: "bar", showValue: false })).toContain("h-3");
  });

  it("a light without its text is only the light, as large as its place", () => {
    for (const variant of [undefined, "lamp", "ring", "icon"]) {
      expect(draw("led", { variant, trueLabel: "RUNNING" }, true), String(variant)).toContain("RUNNING");
      const alone = draw("led", { variant, trueLabel: "RUNNING", showText: false }, true);
      expect(alone, String(variant)).not.toContain("RUNNING");
      expect(alone, String(variant)).toContain("aspect-square");
    }
  });

  it("a number's history line, range bar and arrow can each stand alone", () => {
    for (const variant of ["sparkline", "range", "trend"]) {
      const alone = draw("numericDisplay", { variant, showNumber: false, min: 0, max: 100 });
      expect(alone, variant).toContain(`data-element="${variant}"`);
      expect(alone, variant).not.toContain(">42<");
    }
    // A plain number with the number off would be nothing, so it stays.
    expect(draw("numericDisplay", { showNumber: false })).toContain("42");
  });
});

describe("ready-made custom widgets", () => {
  it("there are some under the tank, the gauge, the number and the light, each with its own id", () => {
    for (const type of ["tank", "gauge", "numericDisplay", "led"]) expect(readyMadeFor(type).length, type).toBeGreaterThanOrEqual(2);
    expect(new Set(READY_MADE.map((r) => r.customWidget.id)).size).toBe(READY_MADE.length);
  });

  it.each(READY_MADE.map((r) => [r.name, r] as const))("%s is built from plain elements inside its box, and takes one tag", (_name, rm) => {
    const cw = rm.customWidget;
    expect(cw.params.map((p) => p.name)).toEqual(["tag"]);
    const elements = new Set(MANIFESTS.map((m) => m.type as string));
    for (const part of cw.widgets) {
      expect(elements.has(part.type), part.localId).toBe(true);
      expect(part.type).not.toBe("customWidget");
      expect(part.props).toMatchObject({ bgColor: "transparent", borderColor: "transparent", showLabel: false });
      expect(part.x, part.localId).toBeGreaterThanOrEqual(0);
      expect(part.y, part.localId).toBeGreaterThanOrEqual(0);
      expect(part.x + part.w, part.localId).toBeLessThanOrEqual(cw.width!);
      expect(part.y + part.h, part.localId).toBeLessThanOrEqual(cw.height!);
    }
    expect(cw.widgets.some((p) => p.bindings?.value === "{tag}")).toBe(true);
    expect(cw.widgets.some((p) => p.type === rm.element)).toBe(true);
  });
});
