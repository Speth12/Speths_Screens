import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NamedStyle, Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, type WidgetHost } from "./index";
import { applyStyle, lookSettings, removeStyle, withStyle } from "./styles";

const kpi: NamedStyle = { id: "kpi", name: "KPI card", props: { bgColor: "#102030", textColor: "#ffffff", cardStyle: "accent", fontWeight: 700, label: "not a look", min: 5 } };

describe("a named style", () => {
  it("holds only look settings: a label or a widget's own setting in it is ignored", () => {
    expect(lookSettings(kpi.props)).toEqual({ bgColor: "#102030", textColor: "#ffffff", cardStyle: "accent", fontWeight: 700 });
  });

  it("lies under the widget's own settings, which win", () => {
    expect(withStyle({ label: "Flow", textColor: "#ffee00" }, kpi)).toEqual({ bgColor: "#102030", textColor: "#ffee00", cardStyle: "accent", fontWeight: 700, label: "Flow" });
    const props = { label: "Flow" };
    expect(withStyle(props, undefined)).toBe(props);
  });

  it("taking a style names it and drops the widget's own look where the style has one", () => {
    expect(applyStyle({ label: "Flow", unit: "bar", bgColor: "transparent", borderColor: "transparent", fontWeight: 300 }, kpi))
      .toEqual({ label: "Flow", unit: "bar", borderColor: "transparent", styleId: "kpi" });
  });

  it("letting go of a style can keep its look in the widget, or not", () => {
    const props = { label: "Flow", styleId: "kpi", textColor: "#ffee00" };
    expect(removeStyle(props, kpi, true)).toEqual({ bgColor: "#102030", textColor: "#ffee00", cardStyle: "accent", fontWeight: 700, label: "Flow" });
    expect(removeStyle(props, kpi, false)).toEqual({ label: "Flow", textColor: "#ffee00" });
    expect(removeStyle({ styleId: "kpi" }, kpi, false)).toBeUndefined();
  });
});

describe("drawn", () => {
  const host = (styles: NamedStyle[]): WidgetHost => ({
    ...inertHost,
    useTag: (p) => (p ? { ...EMPTY_TAG, value: 5, quality: "Good" } : EMPTY_TAG),
    useStyle: (id) => styles.find((s) => s.id === id),
  });
  const draw = (props: Record<string, unknown>, styles: NamedStyle[] = [kpi]) => renderToStaticMarkup(
    <WidgetHostProvider value={host(styles)}>
      <WidgetRenderer w={{ id: "w", type: "numericDisplay", x: 0, y: 0, w: 3, h: 2, props, bindings: { value: "ds:t" } } as Widget} />
    </WidgetHostProvider>,
  );

  it("a widget with a style is drawn in its look; one change to the style reaches it", () => {
    const html = draw({ label: "Flow", styleId: "kpi" });
    expect(html).toContain("background:#102030");
    expect(html).toContain('data-card-style="accent"');
    expect(draw({ label: "Flow", styleId: "kpi" }, [{ ...kpi, props: { bgColor: "#445566" } }])).toContain("background:#445566");
  });

  it("the widget's own setting wins, and a style that is gone leaves the widget as itself", () => {
    expect(draw({ label: "Flow", styleId: "kpi", bgColor: "#ff0000" })).toContain("background:#ff0000");
    expect(draw({ label: "Flow", styleId: "gone" })).toBe(draw({ label: "Flow" }).replace("", ""));
  });
});
