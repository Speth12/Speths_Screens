// One manifest per widget type, plus the frame settings every widget has.
// Defaults here match what the widgets draw when a setting is unset.
import type { WidgetType } from "@speths-screens/shared-types";
import type { BindingSlot, Field, WidgetManifest } from "./manifest";

type Config = Record<string, unknown>;

/** A titled group of settings in the properties panel, with the tag slots
 *  it edits shown first. */
export type SettingsGroup = { title: string; slots?: BindingSlot[]; fields: Field[] };

const range = (note?: string): Field[] => [
  { key: "min", label: "Min", kind: "number", blank: "auto", half: true, note },
  { key: "max", label: "Max", kind: "number", blank: "auto", half: true },
];
const unit: Field = { key: "unit", label: "Unit", kind: "text", placeholder: "°C, bar, rpm…" };

const thresholdItem: Field[] = [
  { key: "value", label: "From (≥)", kind: "number", default: 0, half: true },
  { key: "toValue", label: "To (<)", kind: "number", blank: "∞", half: true },
  { key: "color", label: "Color", kind: "color", default: "#ef4444" },
];
const nextThreshold = (items: Config[]) => ({ value: ((items.at(-1)?.value as number | undefined) ?? 75) + 10, color: "#ef4444" });

const BUTTON_SWATCHES = [
  { value: "blue", swatch: "#3b82f6" }, { value: "green", swatch: "#22c55e" }, { value: "red", swatch: "#ef4444" },
  { value: "amber", swatch: "#f59e0b" }, { value: "zinc", swatch: "#71717a" }, { value: "purple", swatch: "#a855f7" },
  { value: "orange", swatch: "#f97316" }, { value: "white", swatch: "#f4f4f5" },
];

const SERIES_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

export const DEFAULT_STATES = [
  { value: 0, label: "OFF",     color: "#27272a", textColor: "#a1a1aa" },
  { value: 1, label: "RUNNING", color: "#14532d", textColor: "#4ade80" },
  { value: 2, label: "FAULT",   color: "#450a0a", textColor: "#f87171" },
];

const tag = { name: "value", label: "Tag" } as const;
const ALL_EVENTS = ["onClick", "onPress", "onRelease"] as const;

function widget(type: WidgetType, label: string, w: number, h: number, settings: Field[], opts: Partial<WidgetManifest> = {}): WidgetManifest {
  return { type, label, defaultSize: { w, h }, bindings: [tag], events: [...ALL_EVENTS], settings, ...opts };
}

/** In palette order. */
export const MANIFESTS: WidgetManifest[] = [
  widget("gauge", "Gauge", 4, 3, [
    ...range(), unit,
    { key: "thresholds", label: "Fill color thresholds", kind: "list", item: thresholdItem, newItem: nextThreshold, empty: "No thresholds — default fill color" },
  ]),
  widget("numericDisplay", "Numeric", 3, 2, [...range(), unit]),
  widget("textDisplay", "Text", 4, 2, [
    { key: "staticText", label: "Static text", kind: "text", placeholder: "e.g. Pump Status", note: "Leave blank to show the tag value" },
  ]),
  widget("led", "LED", 2, 2, [
    { key: "trueColor", label: "ON color", kind: "color", default: "#22c55e", half: true },
    { key: "falseColor", label: "OFF color", kind: "color", default: "#3f3f46", half: true },
    { key: "trueLabel", label: "ON label", kind: "text", default: "ON", half: true },
    { key: "falseLabel", label: "OFF label", kind: "text", default: "OFF", half: true },
  ]),
  widget("tank", "Tank", 2, 4, [
    ...range(), unit,
    { key: "thresholds", label: "Fill color thresholds", kind: "list", item: thresholdItem, newItem: nextThreshold, empty: "No thresholds — default fill color" },
  ]),
  // What a button does is its events; new buttons write 1 while pressed.
  widget("button", "Button", 3, 2, [
    { key: "btnVariant", label: "Variant", kind: "choice", default: "filled",
      options: ["filled", "outlined", "ghost", "flat", "industrial"].map((value) => ({ value })) },
    { key: "btnColor", label: "Color", kind: "choice", display: "swatches", default: "blue", options: BUTTON_SWATCHES },
    { key: "btnRounded", label: "Corners", kind: "choice", default: "md",
      options: ["none", "sm", "md", "lg", "full"].map((value) => ({ value })) },
    { key: "icon", label: "Icon (emoji or symbol)", kind: "text", placeholder: "e.g. ▶ 🔴 ⚙" },
    { key: "toggleOnColor", label: "Toggle ON color", kind: "choice", display: "swatches", default: "green", options: BUTTON_SWATCHES,
      note: "Used when the button has a toggle action" },
    { key: "toggleOffColor", label: "Toggle OFF color", kind: "choice", display: "swatches", default: "zinc", options: BUTTON_SWATCHES },
  ], { defaults: { events: { onPress: [{ type: "write", value: 1 }], onRelease: [{ type: "write", value: 0 }] } } }),
  widget("setpoint", "Setpoint", 4, 2, [
    ...range(), unit,
    { key: "step", label: "Step", kind: "number", default: 1, min: 0.01, step: 0.1 },
  ]),
  widget("multiState", "Multi-State", 3, 2, [
    { key: "states", label: "States", kind: "list", seed: () => DEFAULT_STATES,
      item: [
        { key: "value", label: "Value", kind: "value", default: 0, half: true },
        { key: "label", label: "Label", kind: "text", half: true },
        { key: "color", label: "Background", kind: "color", default: "#1c1c1e", half: true },
        { key: "textColor", label: "Text", kind: "color", default: "#ffffff", half: true },
      ],
      newItem: (items) => ({ value: items.length, label: `STATE ${items.length}`, color: "#1c1c1e", textColor: "#ffffff" }) },
  ]),
  widget("trend", "Trend", 6, 4, [
    { key: "duration", label: "Duration (seconds)", kind: "number", default: 300, min: 10 },
    { key: "xFormat", label: "X-axis format", kind: "choice", display: "select", default: "time", options: [
      { value: "time", label: "HH:MM:SS" }, { value: "time-short", label: "HH:MM" },
      { value: "relative", label: "Relative (−5m, −1m…)" }, { value: "datetime", label: "Date + time" },
    ] },
    ...range("Leave blank for auto-scale"),
    { key: "tags", label: "Series", kind: "list", max: 6,
      seed: (w) => (w.bindings?.value ? [{ binding: w.bindings.value, color: SERIES_COLORS[0]! }] : []),
      item: [
        { key: "binding", label: "Tag", kind: "binding" },
        { key: "label", label: "Label", kind: "text", half: true },
        { key: "color", label: "Color", kind: "color", default: SERIES_COLORS[0]!, half: true },
        { key: "yMin", label: "Y min", kind: "number", blank: "auto", half: true },
        { key: "yMax", label: "Y max", kind: "number", blank: "auto", half: true },
        { key: "fill", label: "Fill area", kind: "boolean", default: false },
      ],
      newItem: (items) => ({ binding: "", color: SERIES_COLORS[items.length % SERIES_COLORS.length]!, label: "" }) },
    { key: "refLines", label: "Reference lines", kind: "list", empty: "No reference lines.",
      item: [
        { key: "value", label: "Value", kind: "number", default: 0, half: true },
        { key: "color", label: "Color", kind: "color", default: "#ef4444", half: true },
        { key: "label", label: "Label", kind: "text" },
      ],
      newItem: () => ({ value: 0, color: "#ef4444", label: "" }) },
  ]),
  widget("numericInput", "Numeric In", 3, 2, [...range("The runtime refuses writes outside it"), unit]),
  widget("textInput", "Text In", 3, 2, []),
  widget("historyLog", "History", 6, 4, [
    { key: "pageSize", label: "Rows to fetch", kind: "number", default: 100, min: 10, max: 500 },
  ]),
  widget("alarmBanner", "Alarms", 6, 3, [
    { key: "maxRows", label: "Max rows", kind: "number", default: 5, min: 1, max: 20 },
    { key: "showAcked", label: "Show acknowledged alarms", kind: "boolean", default: false },
  ], { bindings: [] }),
  widget("image", "Image", 3, 3, [
    { key: "src", label: "Image", kind: "image" },
    { key: "fit", label: "Fit", kind: "choice", display: "select", default: "contain", alias: "objectFit",
      options: [{ value: "contain", label: "Contain" }, { value: "cover", label: "Cover" }, { value: "fill", label: "Fill" }] },
  ], { bindings: [] }),
  widget("faceplate", "Faceplate", 4, 4, [
    { key: "faceplateId", label: "Faceplate", kind: "faceplate" },
    { key: "params", label: "Parameters", kind: "faceplateParams" },
  ], { bindings: [] }),
  widget("table", "Table", 4, 4, [
    { key: "rows", label: "Rows", kind: "list", empty: "No rows configured",
      item: [
        { key: "label", label: "Label", kind: "text", half: true },
        { key: "unit", label: "Unit", kind: "text", half: true },
        { key: "binding", label: "Tag", kind: "binding" },
      ],
      newItem: () => ({ label: "", binding: "" }) },
  ], { bindings: [] }),
  widget("symbol", "Symbol", 2, 2, [
    { key: "symbolId", label: "Symbol", kind: "symbol" },
    { key: "stroke", label: "Stroke color", kind: "color", default: "#d4d4d8" },
  ], { bindings: [], palette: false }),
];

const BY_TYPE = new Map(MANIFESTS.map((m) => [m.type, m]));

export function manifestFor(type: string): WidgetManifest | undefined {
  return BY_TYPE.get(type as WidgetType);
}

/** Settings of the frame around every widget. */
export const FRAME_SETTINGS: SettingsGroup[] = [
  { title: "Frame border color", slots: [{ name: "color", label: "Source tag (blank uses the widget's tag)" }], fields: [
    { key: "colorThresholds", label: "Thresholds", kind: "list", item: thresholdItem, newItem: nextThreshold, empty: "No thresholds — default border" },
  ] },
  { title: "Appearance", fields: [
    { key: "label", label: "Label", kind: "text" },
    { key: "bgColor", label: "Background", kind: "color", optional: true, none: "transparent", default: "#1c1c1e" },
    { key: "borderColor", label: "Border color", kind: "color", optional: true, none: "transparent", default: "#3f3f46" },
    { key: "showQuality", label: "Show quality indicator (Good / Bad)", kind: "boolean", default: true },
    { key: "noPadding", label: "Remove padding", kind: "boolean", default: false },
  ] },
  { title: "Typography", fields: [
    { key: "fontFamily", label: "Font", kind: "choice", default: "",
      options: [{ value: "", label: "default" }, { value: "mono" }, { value: "sans" }, { value: "serif" }] },
    { key: "fontSize", label: "Size", kind: "choice", default: "",
      options: [{ value: "xs" }, { value: "sm" }, { value: "", label: "base" }, { value: "lg" }, { value: "xl" }, { value: "2xl" }, { value: "3xl" }, { value: "4xl" }] },
    { key: "fontBold", label: "Bold", kind: "boolean", default: false, half: true },
    { key: "fontItalic", label: "Italic", kind: "boolean", default: false, half: true },
    { key: "fontUnderline", label: "Underline", kind: "boolean", default: false },
    { key: "textAlign", label: "Align", kind: "choice", default: "left",
      options: [{ value: "left" }, { value: "center" }, { value: "right" }] },
    { key: "textColor", label: "Text color", kind: "color", optional: true, default: "#e4e4e7" },
  ] },
];
