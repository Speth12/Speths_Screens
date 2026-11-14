import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, type WidgetHost } from "./index";
import { rowLook } from "./rows";

const alarms = [
  { id: "a1", severity: "critical", ruleName: "High level", message: "Tank 1", value: 97.5, active: true, acked: false, since: 1_700_000_000_000 },
  { id: "a2", severity: "warning", ruleName: "Low flow", message: "", value: 3.1, active: true, acked: false, since: 1_700_000_000_000 },
];
const host: WidgetHost = {
  ...inertHost,
  useTag: (p) => (p ? { ...EMPTY_TAG, value: 12.5, quality: "Good" } : EMPTY_TAG),
  useTags: (paths) => Object.fromEntries(paths.map((p) => [p, { ...EMPTY_TAG, value: 12.5, quality: "Good" }])),
  useAlarms: () => ({ alarms: alarms as never }),
};
const draw = (type: string, props: Record<string, unknown>) => renderToStaticMarkup(
  <WidgetHostProvider value={host}><WidgetRenderer w={{ id: "w", type, x: 0, y: 0, w: 6, h: 4, props } as Widget} /></WidgetHostProvider>,
);
const rows = [{ label: "Flow", binding: "ds:flow", unit: "l/min" }, { label: "Level", binding: "ds:level" }];

describe("rows of a list or a table", () => {
  it("nothing set leaves the widget as it was: no row attributes and no extra style", () => {
    expect(rowLook(undefined)).toEqual({ styled: false, attrs: { "data-rows": undefined, "data-row-size": undefined, "data-head": undefined }, style: undefined });
    for (const [type, props] of [["table", { rows }], ["alarmBanner", {}]] as const) {
      const html = draw(type, props);
      expect(html, type).not.toContain("data-rows");
      expect(html, type).not.toContain("<style>");
    }
  });

  it("a row style and a row height mark the list, and each row can be told", () => {
    for (const type of ["table", "alarmBanner"]) {
      const html = draw(type, { rows, rowStyle: "striped", rowSize: "roomy" });
      expect(html, type).toContain('data-rows="striped"');
      expect(html, type).toContain('data-row-size="roomy"');
      expect(html.match(/class="ss-row/g)!.length, type).toBe(2);
    }
  });

  it("a heading color gives the heading text that reads on it", () => {
    const look = rowLook({ headerColor: "#102030" });
    expect(look.style).toEqual({ "--list-head": "#102030", "--list-head-text": "#ffffff" });
    expect(rowLook({ headerColor: "#ffee00" }).style).toMatchObject({ "--list-head-text": "#111111" });
    expect(draw("table", { rows, headerColor: "#102030" })).toContain("data-head");
  });
});

describe("what a list shows", () => {
  it("a table's headings can be written or left out", () => {
    expect(draw("table", { rows })).toMatch(/>Tag<.*>Value</);
    expect(draw("table", { rows, nameHeader: "Signal", valueHeader: "Now" })).toMatch(/>Signal<.*>Now</);
    expect(draw("table", { rows, showHeader: false })).toContain('<thead style="display:none"');
  });

  it("an alarm's severity, value and time can each be left out", () => {
    const all = draw("alarmBanner", {});
    expect(all).toContain(">critical<");
    expect(all).toContain(">97.5<");
    const less = draw("alarmBanner", { showSeverity: false, showValue: false, showTime: false });
    expect(less).not.toContain(">critical<");
    expect(less).not.toContain(">97.5<");
    expect(less).toContain("High level");
  });

  it("a styled alarm row keeps its severity as a bar of its color", () => {
    expect(draw("alarmBanner", { rowStyle: "cards" })).toMatch(/class="ss-row[^>]*style="box-shadow:inset 3px 0 0/);
  });
});

describe("an icon before the label", () => {
  it("is drawn with the label when asked", () => {
    expect(draw("table", { rows, label: "Signals", labelIcon: "list" })).toMatch(/<svg[^>]*>.*Signals/);
    expect(draw("table", { rows, label: "Signals" })).not.toMatch(/<svg[^>]*>[^<]*<path[^>]*><\/path><\/svg><span class="truncate">Signals/);
  });
});
