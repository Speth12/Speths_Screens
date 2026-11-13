import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Widget } from "@speths-screens/shared-types";
import { FONTS } from "./tokens";
import { fontStyle, labelStyle } from "./widgets";
import { WidgetHostProvider, WidgetRenderer, inertHost } from "./index";

describe("a widget's text settings", () => {
  it("nothing set styles nothing", () => {
    expect(Object.values(fontStyle({})).filter((v) => v !== undefined)).toEqual([]);
  });

  it("a font is a bundled one, one of the project's own, or the device's", () => {
    expect(fontStyle({ fontFamily: "roboto-condensed" }).fontFamily).toBe(FONTS["roboto-condensed"].stack);
    expect(fontStyle({ fontFamily: "acme" }).fontFamily).toContain("'pf-acme'");
    expect(fontStyle({ fontFamily: "mono" }).fontFamily).toBe("ui-monospace, monospace");
  });

  it("a weight wins over bold; bold alone still works", () => {
    expect(fontStyle({ fontWeight: 300, fontBold: true }).fontWeight).toBe(300);
    expect(fontStyle({ fontBold: true }).fontWeight).toBe("bold");
  });

  it("spacing, case, lines through and under, shadow and wrapping", () => {
    const s = fontStyle({ letterSpacing: 0.05, lineHeight: 1.4, textTransform: "uppercase", fontUnderline: true, strike: true, textShadow: "soft", wrap: "ellipsis" });
    expect(s).toMatchObject({ letterSpacing: "0.05em", lineHeight: 1.4, textTransform: "uppercase", textDecoration: "underline line-through", whiteSpace: "nowrap", textOverflow: "ellipsis" });
    expect(s.textShadow).toBeTruthy();
    expect(fontStyle({ textTransform: "none" }).textTransform).toBeUndefined();
  });

  it("the label keeps its faded look until given a color, and its own size, weight and case", () => {
    expect(labelStyle({}, "#111")).toMatchObject({ color: "#111", opacity: 0.6 });
    const s = labelStyle({ labelColor: "#c00", labelSize: "lg", labelWeight: 700, labelTransform: "none" }, "#111");
    expect(s).toMatchObject({ color: "#c00", fontSize: "1.125rem", fontWeight: 700, textTransform: "none", letterSpacing: "normal" });
    expect(s.opacity).toBeUndefined();
  });
});

const draw = (w: Partial<Widget>) => renderToStaticMarkup(
  <WidgetHostProvider value={inertHost}><WidgetRenderer w={{ id: "w", type: "textDisplay", x: 0, y: 0, w: 4, h: 2, ...w } as Widget} /></WidgetHostProvider>,
);

describe("drawn", () => {
  it("the label goes below the value when asked", () => {
    const html = draw({ props: { label: "Speed", staticText: "42", labelPosition: "bottom" } });
    expect(html.indexOf("42")).toBeLessThan(html.indexOf("Speed"));
    const top = draw({ props: { label: "Speed", staticText: "42" } });
    expect(top.indexOf("Speed")).toBeLessThan(top.indexOf("42"));
  });

  it("a text keeps its line breaks, and can be turned", () => {
    expect(draw({ props: { staticText: "one\ntwo" } })).toContain("white-space:pre-line");
    expect(draw({ props: { staticText: "up", rotation: 90 } })).toContain("writing-mode:vertical-rl");
  });
});
