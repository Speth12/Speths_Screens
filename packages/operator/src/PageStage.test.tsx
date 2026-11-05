// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WidgetHostProvider, inertHost } from "@speths-screens/widgets";
import type { Widget } from "@speths-screens/shared-types";
import { PageStage, pageScale } from "./PageStage";

afterEach(cleanup);

const led = (id: string, x: number, y: number, w: number, h: number) => ({ id, type: "led", x, y, w, h }) as Widget;
const stage = () => screen.getByTestId("page-stage");
const inner = () => stage().firstElementChild as HTMLElement;
const draw = (props: Partial<Parameters<typeof PageStage>[0]> & { widgets: Widget[] }) =>
  render(
    <WidgetHostProvider value={inertHost}>
      <PageStage pixel={false} fit={false} viewport={{ width: 1000, height: 500 }} {...props} />
    </WidgetHostProvider>,
  );

describe("PageStage", () => {
  it("grid: widgets sit on the canvas grid (80 by 64 cells, 8 pixel gap), not a 12-column CSS grid", () => {
    draw({ widgets: [led("a", 1, 2, 2, 1), led("b", 14, 0, 1, 1)] });
    const [a, b] = Array.from(inner().children) as HTMLElement[];
    expect(a!.style).toMatchObject({ position: "absolute", left: "88px", top: "144px", width: "168px", height: "64px" });
    // a widget past column 12 sits where the IDE draws it instead of spilling into an auto column
    expect(b!.style.left).toBe(`${14 * 88}px`);
  });

  it("pixel: the numbers are pixels", () => {
    draw({ widgets: [led("a", 100, 50, 300, 120)], pixel: true });
    expect((inner().firstElementChild as HTMLElement).style).toMatchObject({ left: "100px", top: "50px", width: "300px", height: "120px" });
  });

  it("dynamic: the stage is the widgets' extent, shown at full size unless Fit is on", () => {
    draw({ widgets: [led("a", 0, 0, 2000, 400)], pixel: true });
    expect(inner().style.width).toBe("2000px");
    expect(inner().style.transform).toBe("scale(1)");
    expect(stage().style.width).toBe("2000px");
  });

  it("dynamic with Fit on: scaled to the window's width, and the outer box takes the scaled size", () => {
    draw({ widgets: [led("a", 0, 0, 2000, 400)], pixel: true, fit: true });
    expect(inner().style.transform).toBe("scale(0.5)");
    expect(stage().style.width).toBe("1000px");
    expect(stage().style.height).toBe("200px");
  });

  it("fixed: the resolution is the stage and it fits the window whatever Fit says", () => {
    for (const fit of [false, true]) {
      cleanup();
      draw({ widgets: [led("a", 0, 0, 100, 100)], pixel: true, fit, resolution: { type: "fixed", width: 2000, height: 1000 } });
      expect(inner().style.width).toBe("2000px");
      expect(inner().style.height).toBe("1000px");
      expect(inner().style.transform).toBe("scale(0.5)");
      expect(stage().style.margin).toBe("0px auto");
    }
  });

  it("fixed: the height can be the limit", () => {
    draw({ widgets: [], pixel: true, resolution: { type: "fixed", width: 1000, height: 2000 } });
    expect(inner().style.transform).toBe("scale(0.25)");
  });

  it("an unmeasured window draws at full size", () => {
    draw({ widgets: [led("a", 0, 0, 100, 100)], pixel: true, viewport: { width: 0, height: 0 }, resolution: { type: "fixed", width: 2000, height: 1000 } });
    expect(inner().style.transform).toBe("scale(1)");
  });
});

describe("pageScale", () => {
  const vp = { width: 1000, height: 500 };
  it.each([
    ["dynamic, Fit off", { width: 2000, height: 400, fixed: false }, false, 1],
    ["dynamic, Fit on, wider than the window", { width: 2000, height: 400, fixed: false }, true, 0.5],
    ["dynamic, Fit on, narrower than the window: grows to the width", { width: 500, height: 400, fixed: false }, true, 2],
    ["fixed, Fit off", { width: 2000, height: 1000, fixed: true }, false, 0.5],
    ["fixed, Fit on", { width: 2000, height: 1000, fixed: true }, true, 0.5],
  ])("%s", (_, st, fit, want) => {
    expect(pageScale(st, vp, fit)).toBe(want);
  });
});

describe("PageStage on a smaller screen", () => {
  const widgets = [
    { id: "a", type: "textDisplay", x: 0, y: 0, w: 4, h: 1, props: { staticText: "Alpha" } },
    { id: "b", type: "textDisplay", x: 4, y: 0, w: 4, h: 1, props: { staticText: "Bravo" }, layout: { phone: { x: 0, y: 1, w: 4, hidden: false }, tablet: { x: 0, y: 1 } } },
    { id: "c", type: "textDisplay", x: 8, y: 0, w: 4, h: 1, props: { staticText: "Charlie" }, layout: { phone: { hidden: true } } },
  ] as never;
  const view = { width: 400, height: 800 };
  const left = (text: string) => screen.getByText(text).closest("[style*='position: absolute']") as HTMLElement;

  it("the desktop keeps every widget where it is", () => {
    render(<PageStage widgets={widgets} pixel={false} fit={false} viewport={view} />);
    expect(screen.getByText("Charlie")).toBeTruthy();
    expect(left("Bravo").style.left).toBe("352px");
  });

  it("a phone moves a widget to its phone place and drops one it hides", () => {
    render(<PageStage widgets={widgets} pixel={false} fit={false} viewport={view} device="phone" />);
    expect(screen.queryByText("Charlie")).toBeNull();
    expect(left("Bravo").style.left).toBe("0px");
    expect(left("Bravo").style.top).toBe("72px");
    expect(left("Alpha").style.left).toBe("0px");
  });

  it("a fixed stage gives way to a page that has its own layout for the device", () => {
    const res = { type: "fixed", width: 1920, height: 1080 } as never;
    render(<PageStage widgets={widgets} resolution={res} pixel={false} fit={false} viewport={view} device="phone" />);
    expect(Number.parseInt(screen.getByTestId("page-stage").style.height)).toBeLessThan(300);
  });
});
