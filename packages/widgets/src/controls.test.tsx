import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, type WidgetHost } from "./index";
import { MANIFESTS } from "./manifests";
import { knobValue, stepValue } from "./controls";

afterEach(cleanup);

const hostWith = (value: unknown, more: Partial<WidgetHost> = {}): WidgetHost => ({
  ...inertHost, useTag: (p) => (p ? { ...EMPTY_TAG, value, quality: "Good" } : EMPTY_TAG), ...more,
});
const widget = (type: string, props: Record<string, unknown>, events?: Widget["events"]) =>
  ({ id: "w", type, x: 0, y: 0, w: 4, h: 2, props, bindings: { value: "ds:tag" }, events } as Widget);
const draw = (type: string, props: Record<string, unknown>, value: unknown = 50, events?: Widget["events"]) => renderToStaticMarkup(
  <WidgetHostProvider value={hostWith(value)}><WidgetRenderer w={widget(type, props, events)} /></WidgetHostProvider>,
);
const TOGGLE = { onClick: [{ type: "toggle" as const, tag: "ds:tag" }] };
const options = (type: string, key: string) => {
  const f = MANIFESTS.find((m) => m.type === type)!.settings.find((x) => x.key === key)!;
  return f.kind === "choice" ? f.options.map((o) => o.value) : [];
};

describe("button", () => {
  it("an icon from the icon set, beside the text, over it, or alone", () => {
    expect(draw("button", { label: "Start", iconName: "pump" })).toMatch(/<svg[^>]*>.*Start/);
    expect(draw("button", { label: "Start", iconName: "pump", btnLayout: "stacked" })).toContain("flex-col");
    const only = draw("button", { label: "Start", iconName: "pump", btnLayout: "iconOnly" });
    expect(only).toContain('aria-label="Start"');
    expect(only).not.toContain(">Start<");
    // With no icon to show, icon only still says what the button is.
    expect(draw("button", { label: "Start", btnLayout: "iconOnly" })).toContain(">Start<");
  });

  it("every look and every shape is drawn, each differently", () => {
    const looks = options("button", "btnVariant"), shapes = options("button", "btnShape");
    expect(looks).toEqual(expect.arrayContaining(["filled", "raised", "glossy", "pushbutton"]));
    expect(shapes).toEqual(["rectangle", "square", "round", "pill"]);
    const seen = new Set<string>();
    for (const look of looks) for (const shape of shapes) {
      const html = draw("button", { label: "Go", btnVariant: look, btnShape: shape });
      expect(html, `${look} ${shape}`).toContain(`data-look="${look}"`);
      expect(html, `${look} ${shape}`).toContain(`data-shape="${shape}"`);
      seen.add(html);
    }
    expect(seen.size).toBe(looks.length * shapes.length);
  });

  it("round and square are as large as fits; round and pill have fully rounded ends", () => {
    expect(draw("button", { btnShape: "round" })).toMatch(/aspect-ratio:1 \/ 1[^"]*border-radius:999px/);
    expect(draw("button", { btnShape: "square", btnRounded: "none" })).toMatch(/aspect-ratio:1 \/ 1[^"]*border-radius:0/);
    expect(draw("button", { btnShape: "pill" })).not.toContain("aspect-ratio");
  });

  it("the 3D look has an edge to press into, and the pushbutton a cap in a metal ring that glows when on", () => {
    expect(draw("button", { btnVariant: "raised" })).toContain("ss-raised");
    const push = draw("button", { btnVariant: "pushbutton", btnShape: "round", btnColor: "red" });
    expect(push).toContain("conic-gradient");
    expect(push).toContain("ss-cap");
    const off = draw("button", { btnVariant: "pushbutton" }, 0, TOGGLE), on = draw("button", { btnVariant: "pushbutton" }, 1, TOGGLE);
    expect(on).toContain("0 0 14px 3px");
    expect(off).not.toContain("0 0 14px 3px");
    expect(on).toContain('aria-pressed="true"');
  });

  it("any color can be given, and text on it reads; the outlined looks lean on the page's text color", () => {
    expect(draw("button", { btnCustomColor: "#ffee00" })).toMatch(/background:#ffee00;color:#111111/);
    expect(draw("button", { btnCustomColor: "#102030" })).toMatch(/background:#102030;color:#ffffff/);
    expect(draw("button", { btnVariant: "outlined" })).toContain("var(--foreground)");
  });

  it("a project picture is drawn as its logo", () => {
    const html = renderToStaticMarkup(
      <WidgetHostProvider value={hostWith(0, { useImage: (id) => (id === "logo" ? "data:image/png;base64,AAAA" : undefined) })}>
        <WidgetRenderer w={widget("button", { label: "Acme", btnImage: "logo", btnLayout: "stacked" })} />
      </WidgetHostProvider>,
    );
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain("Acme");
  });

  it("a button has no card around it unless it is given a background", () => {
    expect(draw("button", { label: "Go" })).not.toContain("var(--card)");
    expect(draw("numericDisplay", { label: "Flow" })).toContain("var(--card)");
    expect(draw("button", { label: "Go", bgColor: "#eeeeee" })).toContain("background:#eeeeee");
  });

  it("each toggle style draws its own control and says whether it is on", () => {
    const styles = options("button", "toggleStyle").filter((s) => s !== "plain");
    expect(styles).toEqual(["switch", "rocker", "checkbox", "segments"]);
    for (const s of styles) {
      expect(draw("button", { label: "Pump", toggleStyle: s }, 1, TOGGLE), s).toContain(`data-toggle="${s}"`);
      expect(draw("button", { label: "Pump", toggleStyle: s }, 1, TOGGLE), s).toContain('aria-checked="true"');
      expect(draw("button", { label: "Pump", toggleStyle: s }, 0, TOGGLE), s).toContain('aria-checked="false"');
    }
    expect(draw("button", { toggleStyle: "segments", onLabel: "AUTO", offLabel: "MAN" }, 1, TOGGLE)).toMatch(/data-current="true"[^>]*>AUTO/);
  });

  it("a button that does not toggle stays a button whatever the toggle style", () => {
    expect(draw("button", { label: "Go", toggleStyle: "switch" })).not.toContain("data-toggle");
  });
});

describe("setpoint", () => {
  it("a step up or down stays in range and on the decimals of the step", () => {
    expect(stepValue(9.5, 1, 0, 10)).toBe(10);
    expect(stepValue(0.2, 0.1, 0, 1)).toBe(0.3);
    expect(stepValue(0, -5, 0, 100)).toBe(0);
  });

  it("the stepper writes one step more or less", () => {
    const requestWrite = vi.fn();
    render(<WidgetHostProvider value={hostWith(20, { requestWrite })}><WidgetRenderer w={widget("setpoint", { variant: "stepper", min: 0, max: 100, step: 5, unit: "rpm" })} /></WidgetHostProvider>);
    expect(screen.getByText("20 rpm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(requestWrite).toHaveBeenLastCalledWith({ binding: "ds:tag", value: 25, widgetId: "w" });
    fireEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(requestWrite).toHaveBeenLastCalledWith({ binding: "ds:tag", value: 15, widgetId: "w" });
  });

  it("the stepper stops at the ends", () => {
    render(<WidgetHostProvider value={hostWith(100)}><WidgetRenderer w={widget("setpoint", { variant: "stepper", min: 0, max: 100 })} /></WidgetHostProvider>);
    expect((screen.getByRole("button", { name: "More" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Less" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a knob points where the pointer is: bottom left is the lowest, the top the middle, bottom right the highest", () => {
    expect(knobValue(-10, 10, 0, 100, 1)).toBe(0);
    expect(knobValue(0, -10, 0, 100, 1)).toBe(50);
    expect(knobValue(10, 10, 0, 100, 1)).toBe(100);
    // In the gap at the bottom it goes to the nearer end.
    expect(knobValue(-1, 10, 0, 100, 1)).toBe(0);
    expect(knobValue(1, 10, 0, 100, 1)).toBe(100);
    expect(knobValue(10, 0, 0, 1, 0.1)).toBe(0.8);
  });

  it("the knob takes the arrow keys, and the thick slider is the same input restyled", () => {
    const requestWrite = vi.fn();
    render(<WidgetHostProvider value={hostWith(40, { requestWrite })}><WidgetRenderer w={widget("setpoint", { variant: "knob", min: 0, max: 100, step: 10 })} /></WidgetHostProvider>);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(requestWrite).toHaveBeenLastCalledWith({ binding: "ds:tag", value: 50, widgetId: "w" });
    const fat = draw("setpoint", { variant: "fat" });
    expect(fat).toContain('class="ss-fat"');
    expect(fat).toContain("::-webkit-slider-thumb");
  });

  it("the value and the end values can be left out", () => {
    const alone = draw("setpoint", { showValue: false, showTicks: false, min: 3, max: 97 }, 50);
    expect(alone).not.toContain(">50<");
    expect(alone).not.toContain(">97<");
    expect(draw("setpoint", { min: 3, max: 97 }, 50)).toContain(">97<");
  });
});

describe("multi-state", () => {
  const states = [{ value: 0, label: "Stopped", color: "#52525b" }, { value: 1, label: "Running", color: "#16a34a", icon: "pump" }, { value: 2, label: "Fault", color: "#dc2626" }];

  it("each style draws its own markup with the text of the current state", () => {
    const styles = options("multiState", "variant").filter((s) => s !== "tile");
    expect(styles).toEqual(["label", "pill", "stepper", "icon"]);
    for (const s of styles) {
      const html = draw("multiState", { variant: s, states }, 1);
      expect(html, s).toContain(`data-variant="${s}"`);
      expect(html, s).toContain("Running");
    }
    expect(draw("multiState", { variant: "tile", states }, 1)).toBe(draw("multiState", { states }, 1));
  });

  it("the row of steps shows every state and fills the current one in its color", () => {
    const html = draw("multiState", { variant: "stepper", states }, 2);
    for (const s of states) expect(html).toContain(s.label);
    expect(html).toMatch(/data-current="true"[^>]*background:#dc2626/);
    expect(html.match(/data-current/g)).toHaveLength(1);
  });

  it("a value that is no state shows as it is, with none current", () => {
    const html = draw("multiState", { variant: "stepper", states }, 9);
    expect(html).not.toContain("data-current");
    expect(draw("multiState", { variant: "pill", states }, 9)).toContain(">9<");
  });
});
