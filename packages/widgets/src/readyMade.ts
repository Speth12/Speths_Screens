// Ready-made custom widgets, offered under an element in the palette: a tank with its value, a number
// with its history line, and so on. Each is an ordinary custom widget built only from the individual
// elements, with one parameter (the tag), so a person can open it on the canvas, see how it is made,
// change it, or copy it to build their own. Choosing one adds it to the project (once) and places a
// copy on the page as a card with a label; the card is the placed copy's own look, so switching the
// copy to Plain leaves just the elements.
import type { CustomWidget, CustomWidgetPart, WidgetType } from "@speths-screens/shared-types";

export interface ReadyMade {
  /** The element it is listed under in the palette. */
  element: WidgetType;
  name: string;
  about: string;
  customWidget: CustomWidget;
}

// Every part is a plain element: no card and no label of its own.
const plain = { bgColor: "transparent", borderColor: "transparent", showLabel: false, noPadding: true } as const;
const TAG = "{tag}";

type PartInit = Pick<CustomWidgetPart, "type" | "x" | "y" | "w" | "h"> & { props?: Record<string, unknown>; anchorX?: CustomWidgetPart["anchorX"]; anchorY?: CustomWidgetPart["anchorY"]; bound?: boolean };

function part(localId: string, p: PartInit): CustomWidgetPart {
  const { props, bound = true, ...rest } = p;
  return { localId, ...rest, props: { ...plain, ...props }, ...(bound ? { bindings: { value: TAG } } : {}) } as CustomWidgetPart;
}

function make(element: WidgetType, id: string, name: string, about: string, width: number, height: number, widgets: CustomWidgetPart[]): ReadyMade {
  return { element, name, about, customWidget: { id: `rm-${id}`, name, description: about, params: [{ name: "tag", description: "The tag it shows" }], width, height, widgets } };
}

const number = (x: number, y: number, w: number, h: number, more: Record<string, unknown> = {}): PartInit =>
  ({ type: "numericDisplay", x, y, w, h, props: { fontSize: "fit", fontWeight: 600, ...more } });

export const READY_MADE: ReadyMade[] = [
  make("tank", "tank-value", "Tank with its value", "A cylinder with the number beside it", 220, 180, [
    part("tank", { type: "tank", x: 0, y: 0, w: 110, h: 180, props: { variant: "cylinder", showValue: false, wave: true } }),
    part("value", number(122, 110, 98, 44)),
  ]),
  make("tank", "silo-scale", "Silo with a scale", "A silo with marks at each quarter and the number under it", 180, 240, [
    part("tank", { type: "tank", x: 0, y: 0, w: 180, h: 190, props: { variant: "silo", showValue: false, showScale: true } }),
    part("value", number(0, 198, 180, 42, { textAlign: "center" })),
  ]),
  make("tank", "level-number", "Level bar with a large number", "A narrow level beside a large number", 240, 120, [
    part("tank", { type: "tank", x: 0, y: 0, w: 36, h: 120, props: { showValue: false } }),
    part("value", number(52, 30, 188, 60)),
  ]),
  make("gauge", "dial-number", "Dial with the number below", "A needle dial over a large number", 240, 200, [
    part("gauge", { type: "gauge", x: 0, y: 0, w: 240, h: 140, props: { variant: "dial", showValue: false } }),
    part("value", number(0, 146, 240, 54, { textAlign: "center" })),
  ]),
  make("gauge", "ring-status", "Ring with a state light", "A ring gauge with a light in its corner", 200, 200, [
    part("gauge", { type: "gauge", x: 0, y: 0, w: 200, h: 200, props: { variant: "ring" } }),
    part("light", { type: "led", x: 172, y: 4, w: 24, h: 24, props: { showText: false }, anchorX: "right" }),
  ]),
  make("gauge", "bar-meter", "Bar meter", "A bar across with the number at its end", 360, 44, [
    part("gauge", { type: "gauge", x: 0, y: 14, w: 260, h: 16, props: { variant: "bar", showValue: false, showTicks: false }, anchorX: "stretch" }),
    part("value", { ...number(272, 4, 88, 36, { textAlign: "right" }), anchorX: "right" }),
  ]),
  make("numericDisplay", "number-history", "Number with a history line", "A large number over the values since the screen opened", 240, 130, [
    part("value", number(0, 0, 240, 70)),
    part("line", { type: "numericDisplay", x: 0, y: 78, w: 240, h: 52, props: { variant: "sparkline", showNumber: false }, anchorX: "stretch" }),
  ]),
  make("numericDisplay", "number-range", "Number with a range bar", "A large number over a bar from the lowest to the highest value", 240, 120, [
    part("value", number(0, 0, 240, 70)),
    part("bar", { type: "numericDisplay", x: 0, y: 76, w: 240, h: 44, props: { variant: "range", showNumber: false }, anchorX: "stretch" }),
  ]),
  make("numericDisplay", "number-arrow", "Number with a rising or falling arrow", "A large number with an arrow beside it", 240, 80, [
    part("value", number(0, 6, 180, 68)),
    part("arrow", { type: "numericDisplay", x: 192, y: 16, w: 48, h: 48, props: { variant: "trend", showNumber: false }, anchorX: "right" }),
  ]),
  make("led", "lamp-text", "Light with a name and its state", "A light, a name you write, and the state as a pill", 280, 40, [
    part("light", { type: "led", x: 0, y: 6, w: 28, h: 28, props: { variant: "lamp", showText: false } }),
    part("name", { type: "textDisplay", x: 40, y: 0, w: 130, h: 40, props: { staticText: "Pump 1", fontWeight: 600 }, bound: false, anchorX: "stretch" }),
    part("state", { type: "led", x: 176, y: 4, w: 104, h: 32, props: { variant: "pill", trueLabel: "RUNNING", falseLabel: "STOPPED" }, anchorX: "right" }),
  ]),
  make("led", "status-tile", "Status tile with an icon", "A filled tile with an icon light beside it", 220, 64, [
    part("icon", { type: "led", x: 0, y: 8, w: 48, h: 48, props: { variant: "icon", icon: "pump", showText: false } }),
    part("tile", { type: "led", x: 60, y: 8, w: 160, h: 48, props: { variant: "tile", trueLabel: "RUNNING", falseLabel: "STOPPED" }, anchorX: "stretch" }),
  ]),
];

/** The ready-made custom widgets listed under an element. */
export function readyMadeFor(type: string): ReadyMade[] {
  return READY_MADE.filter((r) => r.element === type);
}
