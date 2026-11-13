// One manifest per widget type, plus the frame settings every widget has.
// Defaults here match what the widgets draw when a setting is unset.
import type { WidgetType } from "@speths-screens/shared-types";
import type { BindingSlot, Field, GallerySample, WidgetManifest } from "./manifest";

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

/** What the widget gallery shows each widget type with. */
const SAMPLES: Record<WidgetType, GallerySample> = {
  gauge:          { value: 62, numeric: true, props: { min: 0, max: 100, unit: "%", label: "Level" } },
  numericDisplay: { value: 62.5, numeric: true, props: { unit: "bar", label: "Pressure" } },
  textDisplay:    { props: { staticText: "Pump 1", label: "Name" } },
  led:            { value: true, on: true, off: false, props: { trueLabel: "ON", falseLabel: "OFF", label: "Run" } },
  tank:           { value: 62, numeric: true, props: { min: 0, max: 100, unit: "%", label: "Tank" } },
  button:         { value: false, on: true, off: false, props: { label: "Start" } },
  setpoint:       { value: 62, numeric: true, props: { min: 0, max: 100, unit: "°C", label: "Setpoint" } },
  multiState:     { value: 1, on: 1, off: 0, props: { label: "Pump" } },
  trend:          { props: { label: "Trend" } },
  numericInput:   { value: 62, numeric: true, props: { unit: "bar", label: "Pressure" } },
  textInput:      { value: "Batch 7", props: { label: "Batch" } },
  historyLog:     { props: { label: "History" } },
  alarmBanner:    { props: { label: "Alarms" } },
  image:          { props: { label: "Image" } },
  customWidget:   { props: { label: "Custom widget" } },
  table:          { props: { label: "Table" } },
  symbol:         { value: true, on: true, off: false, props: { symbolId: "gate-valve", label: "Valve" } },
  pipe:           { value: true, on: true, off: false, props: { points: "0,50 100,50", weight: 8, label: "Pipe" } },
  pageList:       { props: { style: "list" } },
  clock:          { props: {} },
  driverStatus:   { props: {} },
  userMenu:       { props: {} },
  recipes:        { props: { label: "Recipes" } },
  shape:          { props: { kind: "rectangle", weight: 2, cornerRadius: 6 } },
  alarmIndicator: { props: {} },
  pageTitle:      { props: {} },
};

function widget(type: WidgetType, label: string, w: number, h: number, settings: Field[], opts: Partial<WidgetManifest> = {}): WidgetManifest {
  return { type, label, defaultSize: { w, h }, bindings: [tag], events: [...ALL_EVENTS], settings, sample: SAMPLES[type], ...opts };
}

/** In palette order. */
export const MANIFESTS: WidgetManifest[] = [
  widget("gauge", "Gauge", 4, 3, [
    ...range(), unit,
    { key: "thresholds", label: "Fill color thresholds", kind: "list", item: thresholdItem, newItem: nextThreshold, empty: "No thresholds — default fill color" },
  ]),
  widget("numericDisplay", "Numeric", 3, 2, [...range(), unit]),
  widget("textDisplay", "Text", 4, 2, [
    { key: "staticText", label: "Static text", kind: "text", multiline: true, placeholder: "e.g. Pump Status", note: "Leave blank to show the tag value. Enter starts a new line." },
    { key: "rotation", label: "Turned", kind: "choice", numeric: true, default: "0",
      options: [{ value: "0", label: "not turned" }, { value: "90", label: "90°" }, { value: "180", label: "180°" }, { value: "270", label: "270°" }] },
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
    { key: "autoscale", label: "Y scale", kind: "choice", default: "fit",
      options: [{ value: "fit", label: "follow the data" }, { value: "nice", label: "follow the data, round numbers" }, { value: "fixed", label: "fixed (min and max)" }] },
    ...range("Used by fixed; blank follows the data"),
    { key: "windows", label: "Window buttons (seconds, comma separated)", kind: "numbers", min: 5, placeholder: "30, 60, 300, 3600" },
    { key: "live", label: "Start running (off starts paused)", kind: "boolean", default: true },
    { key: "showToolbar", label: "Show window and history buttons", kind: "boolean", default: true },
    { key: "showGrid", label: "Show grid", kind: "boolean", default: true, half: true },
    { key: "showLegend", label: "Show legend", kind: "boolean", default: true, half: true },
    { key: "tags", label: "Series", kind: "list", max: 6,
      seed: (w) => (w.bindings?.value ? [{ binding: w.bindings.value, color: SERIES_COLORS[0]! }] : []),
      item: [
        { key: "binding", label: "Tag", kind: "binding" },
        { key: "label", label: "Label", kind: "text", half: true },
        { key: "color", label: "Color", kind: "color", default: SERIES_COLORS[0]!, half: true },
        { key: "yMin", label: "Y min", kind: "number", blank: "auto", half: true },
        { key: "yMax", label: "Y max", kind: "number", blank: "auto", half: true },
        { key: "style", label: "Pen", kind: "choice", default: "line", half: true,
          options: [{ value: "line" }, { value: "step" }, { value: "area" }, { value: "dots" }, { value: "bars" }] },
        { key: "dash", label: "Dash", kind: "choice", default: "solid", half: true,
          options: [{ value: "solid" }, { value: "dashed" }, { value: "dotted" }] },
        { key: "width", label: "Width (px)", kind: "number", min: 0.5, blank: "1.5", half: true },
        { key: "axis", label: "Y scale", kind: "choice", default: "own", half: true,
          options: [{ value: "own", label: "its own" }, { value: "shared", label: "shared" }] },
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
  widget("customWidget", "Custom widget", 4, 4, [
    { key: "customWidgetId", label: "Custom widget", kind: "customWidget" },
    { key: "params", label: "Parameters", kind: "customWidgetParams" },
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
    { key: "stroke", label: "Stroke color", kind: "color", optional: true },
    { key: "motion", label: "Moves while running", kind: "choice", display: "buttons", default: "still",
      options: [{ value: "still", label: "Still" }, { value: "spin", label: "Spin" }, { value: "pulse", label: "Pulse" }] },
    { key: "animate", label: "Moving now", kind: "boolean", default: false, note: "Drive this from a tag (Drives) so it moves while the machine runs." },
    { key: "cycleSeconds", label: "Seconds per turn", kind: "number", default: 2, min: 0.2, step: 0.1, showIf: (c) => !!c.motion && c.motion !== "still" },
  ], { bindings: [], palette: false }),
  widget("pipe", "Pipe", 4, 2, [
    { key: "points", label: "Corners (x,y from 0 to 100)", kind: "text", default: "0,50 100,50", placeholder: "0,50 60,50 60,100",
      note: "Each pair is a corner, as a percentage across and down the widget." },
    { key: "weight", label: "Width (px)", kind: "number", default: 8, min: 1, step: 1, half: true },
    { key: "cycleSeconds", label: "Seconds per step", kind: "number", default: 1, min: 0.2, step: 0.1, half: true },
    { key: "color", label: "Pipe color", kind: "color", optional: true },
    { key: "flowColor", label: "Flow color", kind: "color", optional: true },
    { key: "flow", label: "Flowing now", kind: "boolean", default: false, note: "Drive this from a tag (Drives) so it flows while the line runs." },
    { key: "reverse", label: "Flows from the last corner to the first", kind: "boolean", default: false },
  ], { bindings: [], palette: true }),
  widget("shape", "Shape", 3, 2, [
    { key: "kind", label: "Shape", kind: "choice", display: "buttons", default: "rectangle",
      options: [{ value: "rectangle", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }, { value: "line", label: "Line" }] },
    { key: "fill", label: "Fill", kind: "color", optional: true, showIf: (c) => c.kind !== "line" },
    { key: "stroke", label: "Line or outline color", kind: "color", optional: true },
    { key: "weight", label: "Width (px)", kind: "number", default: 2, min: 0, step: 1, half: true },
    { key: "cornerRadius", label: "Corner radius (px)", kind: "number", default: 0, min: 0, step: 1, half: true, showIf: (c) => (c.kind ?? "rectangle") === "rectangle" },
    { key: "dashed", label: "Dashed", kind: "boolean", default: false },
    { key: "direction", label: "Direction", kind: "choice", display: "select", default: "horizontal", showIf: (c) => c.kind === "line",
      options: [{ value: "horizontal", label: "Level" }, { value: "vertical", label: "Upright" }, { value: "down", label: "Top left to bottom right" }, { value: "up", label: "Bottom left to top right" }] },
    { key: "arrowStart", label: "Arrow at the start", kind: "boolean", default: false, half: true, showIf: (c) => c.kind === "line" },
    { key: "arrowEnd", label: "Arrow at the end", kind: "boolean", default: false, half: true, showIf: (c) => c.kind === "line" },
  ], { bindings: [], palette: true }),
  widget("alarmIndicator", "Alarm count", 1, 1, [
    { key: "page", label: "Page a click opens", kind: "text", placeholder: "a page id, e.g. p2", note: "Shows how many alarms are active, in the color of the worst." },
  ], { bindings: [], events: [] }),
  widget("pageTitle", "Page title", 3, 1, [
    { key: "showIcon", label: "Show the page's icon", kind: "boolean", default: true },
  ], { bindings: [], events: [] }),
  widget("pageList", "Page list", 3, 6, [
    { key: "style", label: "Style", kind: "choice", default: "list", display: "select", options: [
      { value: "list", label: "List (icon and name, grouped)" }, { value: "tabs", label: "Tabs (names in a row)" },
      { value: "icons", label: "Large icons in a row" }, { value: "bar", label: "Bar (icon over name)" },
    ] },
    { key: "showGroups", label: "Show group headings", kind: "boolean", default: true, showIf: (c) => (c.style ?? "list") === "list" },
    { key: "showIcons", label: "Show the pages' icons", kind: "boolean", default: true, showIf: (c) => c.style !== "tabs" },
    { key: "showLabels", label: "Show the pages' names", kind: "boolean", default: true, showIf: (c) => (c.style ?? "list") === "list", note: "Off leaves the icons, for a narrow sidebar." },
    { key: "showSettings", label: "List the Settings screen", kind: "boolean", default: true },
  ], { bindings: [], events: [] }),
  widget("clock", "Clock", 3, 1, [
    { key: "format", label: "Show", kind: "choice", default: "timeSeconds", display: "select", options: [
      { value: "time", label: "Time" }, { value: "timeSeconds", label: "Time with seconds" },
      { value: "dateTime", label: "Date and time" }, { value: "date", label: "Date" },
    ] },
    { key: "hour12", label: "12-hour clock", kind: "boolean", default: false },
    { key: "showWeekday", label: "Show the weekday", kind: "boolean", default: true },
  ], { bindings: [], events: [] }),
  widget("driverStatus", "Driver status", 4, 1, [
    { key: "compact", label: "One summary instead of a chip each", kind: "boolean", default: false },
  ], { bindings: [], events: [] }),
  widget("recipes", "Recipes", 4, 5, [
    { key: "recipeSetId", label: "Recipe set", kind: "recipe", note: "Blank shows the first set of the project." },
  ], { bindings: [], events: [], legacyProps: ["recipeId", "showEntries"] }),
  widget("userMenu", "User menu", 1, 1, [
    { key: "showName", label: "Show the name beside the icon", kind: "boolean", default: false },
  ], { bindings: [], events: [] }),
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
    { key: "showLabel", label: "Show the label", kind: "boolean", default: true },
    { key: "showUnit", label: "Show the unit", kind: "boolean", default: true },
    { key: "showQuality", label: "Always show quality (otherwise only when not Good)", kind: "boolean", default: false },
    { key: "noPadding", label: "No padding", kind: "boolean", default: false },
    { key: "padding", label: "Padding (px)", kind: "number", min: 0, blank: "theme", half: true },
    { key: "radius", label: "Corner radius (px)", kind: "number", min: 0, blank: "theme", half: true },
    { key: "borderWidth", label: "Border width (px)", kind: "number", min: 0, blank: "theme", half: true },
    { key: "shadow", label: "Shadow", kind: "boolean", default: true, half: true },
    { key: "valign", label: "Value position", kind: "choice", default: "",
      options: [{ value: "", label: "middle" }, { value: "top" }, { value: "bottom" }] },
  ] },
  { title: "Typography", fields: [
    { key: "fontFamily", label: "Font", kind: "font" },
    { key: "fontSize", label: "Size", kind: "choice", default: "",
      options: [{ value: "", label: "widget's own" }, { value: "xs" }, { value: "sm" }, { value: "lg" }, { value: "xl" }, { value: "2xl" }, { value: "3xl" }, { value: "4xl" }, { value: "5xl" }, { value: "6xl" }, { value: "fit", label: "fit the card" }] },
    { key: "fontPx", label: "Exact size (px)", kind: "number", min: 6, blank: "use size above" },
    { key: "fontWeight", label: "Weight", kind: "choice", display: "select", numeric: true, default: "", note: "A font draws the nearest weight it has.",
      options: [{ value: "", label: "default" }, { value: "100", label: "100 Thin" }, { value: "200", label: "200 Extra light" }, { value: "300", label: "300 Light" }, { value: "400", label: "400 Regular" }, { value: "500", label: "500 Medium" }, { value: "600", label: "600 Semibold" }, { value: "700", label: "700 Bold" }, { value: "800", label: "800 Extra bold" }, { value: "900", label: "900 Black" }] },
    { key: "fontBold", label: "Bold", kind: "boolean", default: false, half: true },
    { key: "fontItalic", label: "Italic", kind: "boolean", default: false, half: true },
    { key: "fontUnderline", label: "Underline", kind: "boolean", default: false, half: true },
    { key: "strike", label: "Strikethrough", kind: "boolean", default: false, half: true },
    { key: "textTransform", label: "Letters", kind: "choice", display: "select", default: "", options: [{ value: "", label: "the widget's own way" }, { value: "none", label: "as written" }, { value: "uppercase", label: "UPPER CASE" }, { value: "lowercase", label: "lower case" }, { value: "capitalize", label: "Each Word" }] },
    { key: "letterSpacing", label: "Letter spacing (em)", kind: "number", min: -0.2, max: 2, step: 0.01, blank: "normal", half: true },
    { key: "lineHeight", label: "Line height", kind: "number", min: 0.8, max: 4, step: 0.05, blank: "normal", half: true },
    { key: "wrap", label: "Long text", kind: "choice", display: "select", default: "",
      options: [{ value: "", label: "the widget's own way" }, { value: "wrap", label: "wraps onto more lines" }, { value: "nowrap", label: "stays on one line" }, { value: "ellipsis", label: "one line, cut off with …" }] },
    { key: "textShadow", label: "Behind the text", kind: "choice", display: "select", default: "",
      options: [{ value: "", label: "nothing" }, { value: "soft", label: "a soft shadow" }, { value: "strong", label: "a strong shadow" }, { value: "outline", label: "an outline" }] },
    { key: "textAlign", label: "Align", kind: "choice", default: "left",
      options: [{ value: "left" }, { value: "center" }, { value: "right" }] },
    { key: "textColor", label: "Text color", kind: "color", optional: true, default: "#e4e4e7" },
  ] },
  { title: "Label text", fields: [
    { key: "labelPosition", label: "Where", kind: "choice", default: "top",
      options: [{ value: "top", label: "above" }, { value: "bottom", label: "below" }, { value: "left", label: "left" }] },
    { key: "labelSize", label: "Size", kind: "choice", default: "",
      options: [{ value: "", label: "small" }, { value: "sm" }, { value: "base" }, { value: "lg" }, { value: "xl" }, { value: "2xl" }, { value: "3xl" }] },
    { key: "labelWeight", label: "Weight", kind: "choice", display: "select", numeric: true, default: "", options: [{ value: "", label: "default" }, { value: "100", label: "100 Thin" }, { value: "200", label: "200 Extra light" }, { value: "300", label: "300 Light" }, { value: "400", label: "400 Regular" }, { value: "500", label: "500 Medium" }, { value: "600", label: "600 Semibold" }, { value: "700", label: "700 Bold" }, { value: "800", label: "800 Extra bold" }, { value: "900", label: "900 Black" }] },
    { key: "labelTransform", label: "Letters", kind: "choice", display: "select", default: "",
      options: [{ value: "", label: "UPPER CASE (the default)" }, { value: "uppercase", label: "UPPER CASE" }, { value: "none", label: "as written" }, { value: "lowercase", label: "lower case" }, { value: "capitalize", label: "Each Word" }] },
    { key: "labelColor", label: "Color", kind: "color", optional: true, default: "#a1a1aa" },
  ] },
  { title: "Blinking (while the blink property is driven on)", fields: [
    { key: "blinkPeriodMs", label: "Period (ms)", kind: "number", default: 800, half: true },
    { key: "blinkColor", label: "Flash color (blank fades the widget)", kind: "color", optional: true, default: "#ef4444", half: true },
  ] },
];
