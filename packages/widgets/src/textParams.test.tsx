import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CustomWidget, Widget } from "@speths-screens/shared-types";
import { WidgetHostProvider, WidgetRenderer, inertHost, EMPTY_TAG, type WidgetHost } from "./index";
import { fillTexts, textParams } from "./widgets";

const plain = { bgColor: "transparent", borderColor: "transparent" };
const card: CustomWidget = {
  id: "cw", name: "Pump row", width: 300, height: 40,
  params: [{ name: "run" }, { name: "title", kind: "text", default: "Pump" }, { name: "unit", kind: "text" }],
  widgets: [
    { localId: "name", type: "textDisplay", x: 0, y: 0, w: 150, h: 40, props: { ...plain, staticText: "{title} status" } },
    { localId: "state", type: "led", x: 150, y: 0, w: 150, h: 40, props: { ...plain, label: "{title}", trueLabel: "{title} on", falseLabel: "{nothing} off" }, bindings: { value: "{run}" } },
  ],
} as CustomWidget;

const seen: string[] = [];
const host: WidgetHost = {
  ...inertHost,
  useCustomWidget: (id) => (id === "cw" ? card : undefined),
  useTag: (p) => { if (p) seen.push(p); return p ? { ...EMPTY_TAG, value: true, quality: "Good" } : EMPTY_TAG; },
};
const draw = (params: Record<string, string>) => renderToStaticMarkup(
  <WidgetHostProvider value={host}>
    <WidgetRenderer w={{ id: "w", type: "customWidget", x: 0, y: 0, w: 300, h: 40, props: { ...plain, customWidgetId: "cw", params } } as Widget} />
  </WidgetHostProvider>,
);

describe("text parameters of a custom widget", () => {
  it("each use shows its own text, in every text of a part", () => {
    const html = draw({ run: "plc:P1.Run", title: "Feed pump" });
    expect(html).toContain("Feed pump status");
    expect(html).toContain("Feed pump on");
    expect(draw({ run: "plc:P2.Run", title: "Drain pump" })).toContain("Drain pump status");
  });

  it("a use that gives no text shows the default; braces that name no text parameter stay", () => {
    expect(draw({ run: "plc:P1.Run" })).toContain("Pump status");
    expect(draw({ run: "plc:P1.Run", title: "" })).toContain("Pump status");
    expect(fillTexts({ falseLabel: "{nothing} off", label: "{title}", min: 3 }, { title: "A" })).toEqual({ falseLabel: "{nothing} off", label: "A", min: 3 });
  });

  it("a tag parameter still fills the tags, and a text is never read as a tag", () => {
    seen.length = 0;
    draw({ run: "plc:P1.Run", title: "plc:Not.A.Tag" });
    expect(seen).toContain("plc:P1.Run");
    expect(seen).not.toContain("plc:Not.A.Tag");
  });

  it("a custom widget with no text parameters is filled as before", () => {
    expect(textParams([{ name: "run" }], { run: "a" })).toBeUndefined();
    expect(textParams(card.params, { title: "T" })).toEqual({ title: "T", unit: "" });
    const props = { label: "{run}" };
    expect(fillTexts(props, undefined)).toBe(props);
  });
});
