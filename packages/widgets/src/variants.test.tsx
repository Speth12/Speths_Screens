import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, type WidgetHost } from "./index";
import { MANIFESTS, FRAME_SETTINGS } from "./manifests";
import { GaugeVariant, SegmentDigits, direction, readableOn } from "./variants";

/** A host whose every tag holds `value`. */
const hostWith = (value: unknown, more: Partial<WidgetHost> = {}): WidgetHost => ({
  ...inertHost, useTag: (p) => (p ? { ...EMPTY_TAG, value, quality: "Good" } : EMPTY_TAG), ...more,
});
const draw = (type: string, props: Record<string, unknown>, value: unknown = 50, host?: Partial<WidgetHost>) => renderToStaticMarkup(
  <WidgetHostProvider value={hostWith(value, host)}>
    <WidgetRenderer w={{ id: "w", type, x: 0, y: 0, w: 4, h: 3, props, bindings: { value: "ds:tag" } } as Widget} />
  </WidgetHostProvider>,
);
const optionsOf = (type: string) => {
  const f = MANIFESTS.find((m) => m.type === type)!.settings.find((x) => x.key === "variant")!;
  return f.kind === "choice" ? f.options.map((o) => o.value) : [];
};

describe("every style a widget offers is drawn", () => {
  for (const type of ["gauge", "tank", "numericDisplay", "led"]) {
    it(`${type}: each style draws its own markup, and the first is the widget as it was`, () => {
      const [first, ...rest] = optionsOf(type);
      expect(rest.length).toBeGreaterThanOrEqual(4);
      expect(draw(type, { variant: first })).toBe(draw(type, {}));
      const seen = new Set<string>();
      for (const v of rest) {
        const html = draw(type, { variant: v, min: 0, max: 100 });
        expect(html, `${type} ${v}`).toContain(`data-variant="${v}"`);
        seen.add(html);
      }
      expect(seen.size).toBe(rest.length);
    });
  }
});

describe("gauge styles", () => {
  it("the bar is as wide as the value is of its range, held inside it", () => {
    expect(draw("gauge", { variant: "bar", min: 0, max: 200 }, 50)).toContain("width:25%");
    expect(draw("gauge", { variant: "bar", min: 0, max: 100 }, 500)).toContain("width:100%");
    expect(draw("gauge", { variant: "vbar", min: 0, max: 100 }, -5)).toContain("height:0%");
  });

  it("segments light up to the value; the threshold color fills them", () => {
    const html = draw("gauge", { variant: "segments", min: 0, max: 100, thresholds: [{ value: 40, color: "#ff0000" }] }, 50);
    expect(html.match(/data-lit/g)).toHaveLength(6);
    expect(html).toContain("background:#ff0000");
  });

  it("the end values can be left out", () => {
    const html = renderToStaticMarkup(<GaugeVariant variant="bar" pct={0.5} text="50" min={7} max={93} color="#000" showTicks={false} />);
    expect(html).not.toContain(">93<");
    expect(renderToStaticMarkup(<GaugeVariant variant="bar" pct={0.5} text="50" min={7} max={93} color="#000" />)).toContain(">93<");
  });
});

describe("tank styles", () => {
  it("a shape fills from the bottom, with a scale and a wave when asked", () => {
    const html = draw("tank", { variant: "cylinder", min: 0, max: 100, showScale: true, wave: true }, 25);
    expect(html).toContain('y="75"');
    expect(html).toContain("ss-wave");
    for (const mark of [">0<", ">25<", ">50<", ">75<", ">100<"]) expect(html).toContain(mark);
    expect(draw("tank", { variant: "cylinder" }, 25)).not.toContain("ss-wave");
  });
});

describe("number styles", () => {
  it("seven-segment digits light the right segments", () => {
    const one = renderToStaticMarkup(<SegmentDigits text="1" />);
    expect(one.match(/opacity:1/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<SegmentDigits text="8.8" />).match(/opacity:1/g)).toHaveLength(14);
    expect(renderToStaticMarkup(<SegmentDigits text="-12.5" />)).toContain('aria-label="-12.5"');
  });

  it("rising, falling and steady", () => {
    expect(direction([1, 2, 3, 4])).toBe("up");
    expect(direction([4, 3, 2, 1])).toBe("down");
    expect(direction([5, 5, 5])).toBe("steady");
    expect(direction([7])).toBe("steady");
  });
});

describe("state light styles", () => {
  it("a tile takes the state's color with text that reads on it", () => {
    expect(draw("led", { variant: "tile", trueColor: "#ffee00", trueLabel: "RUN" }, true)).toMatch(/background:#ffee00;color:#111111[^>]*>RUN/);
    expect(readableOn("#102030")).toBe("#ffffff");
    expect(readableOn("var(--primary)")).toBe("#ffffff");
  });
});

describe("card styles", () => {
  const styles = FRAME_SETTINGS.flatMap((g) => g.fields).find((f) => f.key === "cardStyle")!;

  it("each style draws differently, and plain is the card as it was", () => {
    const names = styles.kind === "choice" ? styles.options.map((o) => o.value).filter(Boolean) : [];
    expect(names).toHaveLength(7);
    const plain = draw("numericDisplay", { label: "Flow" });
    expect(draw("numericDisplay", { label: "Flow", cardStyle: "plain" })).toBe(plain);
    const seen = new Set(names.map((n) => draw("numericDisplay", { label: "Flow", cardStyle: n })));
    expect(seen.size).toBe(7);
  });

  it("the theme's style is used unless the widget has its own", () => {
    const themed = { useCardStyle: () => "accent" as const };
    expect(draw("numericDisplay", { label: "Flow" }, 1, themed)).toContain('data-card-style="accent"');
    expect(draw("numericDisplay", { label: "Flow", cardStyle: "inset" }, 1, themed)).toContain('data-card-style="inset"');
    expect(draw("numericDisplay", { label: "Flow", cardStyle: "plain" }, 1, themed)).not.toContain("data-card-style");
  });

  it("the header style puts the label on a band; a widget that is not a card has no style", () => {
    expect(draw("numericDisplay", { label: "Flow", cardStyle: "header" })).toContain("data-card-header");
    expect(draw("numericDisplay", { label: "Flow", cardStyle: "header", bgColor: "transparent", borderColor: "transparent" })).not.toContain("data-card-style");
    expect(draw("pipe", { cardStyle: "glass" })).not.toContain("data-card-style");
  });

  it("a rectangle given a card style is a card to build on; without one it is a plain rectangle", () => {
    const card = draw("shape", { cardStyle: "plain" });
    expect(card).toContain("var(--card)");
    expect(card).toContain("var(--radius");
    expect(draw("shape", { cardStyle: "glass" })).toContain("blur(10px)");
    expect(draw("shape", {})).not.toContain("var(--card)");
    expect(draw("shape", { kind: "ellipse", cardStyle: "glass" })).not.toContain("blur");
  });
});
