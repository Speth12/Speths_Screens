// Builds samples/feature-tour.screens.json: a tour of what the product does, with no PLC needed.
// It shows the built-in header and navigation, animated process graphics, trends, alarms, controls
// that write, recipes, custom widgets (a free layout, a flex stack, one nested in another), one of
// every widget type, and every driven property with every kind of transform.
//
//   node scripts/samples/feature-tour.mjs [preset] [out]
//
// Data: a `sim` datasource of calculated tags that move on their own (a cycle of about 30 seconds), and a
// `mem` datasource of typed memory tags that the controls, recipes and a runtime script write.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const preset = process.argv[2] ?? "clean";
const out = process.argv[3] ?? resolve(root, "samples/feature-tour.screens.json");

const W = 1048, G = 16; // what the operator leaves for a page beside the 208 px sidebar, and the gap
const svg = (body) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">${body}</svg>`)}`;
const IMG_ON = svg(`<rect width="120" height="80" rx="10" fill="#16a34a"/><text x="60" y="48" font-family="sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#fff">RUNNING</text>`);
const IMG_OFF = svg(`<rect width="120" height="80" rx="10" fill="#64748b"/><text x="60" y="48" font-family="sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#fff">STOPPED</text>`);
const LOGO = svg(`<rect width="120" height="80" rx="10" fill="#2563eb"/><path d="M30 55 L55 25 L70 45 L90 20" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

// ── helpers ────────────────────────────────────────────────────────────────
/** A widget with its pixel box. */
const at = (id, type, x, y, w, h, rest = {}) => ({ id, type, x, y, w, h, ...rest });
/** The x and width of column i of n (a widget spanning `span` columns). */
const col = (n, i, span = 1, total = W) => { const cw = (total - (n - 1) * G) / n; return { x: Math.round(i * (cw + G)), w: Math.round(cw * span + (span - 1) * G) }; };
/** Widgets laid in a grid: cells of cols columns, each `h` tall, starting at y. Returns the widgets and the next free y. */
function grid(items, { cols: n, y = 0, h = 130, total = W }) {
  const out = items.map(([id, type, rest], i) => {
    const c = col(n, i % n, 1, total);
    return at(id, type, c.x, y + Math.floor(i / n) * (h + G), c.w, h, rest);
  });
  return { widgets: out, next: y + Math.ceil(items.length / n) * (h + G) };
}
const title = (id, text, y) => at(id, "textDisplay", 0, y, W, 36, { props: { staticText: text, fontBold: true, fontSize: "xl", bgColor: "transparent", borderColor: "none", noPadding: true } });
const note = (id, text, y, h = 40, x = 0, w = W) => at(id, "textDisplay", x, y, w, h, { props: { staticText: text, fontSize: "sm", textColor: "var(--muted-foreground)", bgColor: "transparent", borderColor: "none", noPadding: true } });

const running = { expr: "{sim:running} == 1" };
const colorByRunning = { expr: "{sim:running}", transform: { kind: "map", cases: [{ equals: 1, value: "token:process-running" }], default: "token:process-off" } };
const pumpOn = { expr: "{mem:Run} == 1" };
const colorByPumpOn = { expr: "{mem:Run}", transform: { kind: "map", cases: [{ equals: 1, value: "token:process-running" }], default: "token:process-off" } };

// ── data ───────────────────────────────────────────────────────────────────
const datasources = [
  {
    id: "sim", type: "virtual", label: "Simulation",
    config: {
      tags: [
        { path: "phase", expr: "((good({sim:phase}) ? {sim:phase} : 0) + 0.04) % 6.283" },
        { path: "pressure", expr: "60 + sin({sim:phase}) * 8" },
        { path: "flow", expr: "50 + sin({sim:phase} * 1.3) * 20" },
        { path: "level", expr: "50 + sin({sim:phase} * 0.7) * 40" },
        { path: "temp", expr: "70 + sin({sim:phase} * 0.5) * 25" },
        { path: "efficiency", expr: "75 + sin({sim:phase} * 0.9) * 10" },
        { path: "running", expr: "{sim:phase} < 4.7 ? 1 : 0" },
        { path: "mode", expr: "floor({sim:phase} / 1.571)" },
        { path: "ramp", expr: "({sim:phase} / 6.283) * 100" },
        { path: "square", expr: "sin({sim:phase} * 2) > 0 ? 1 : 0" },
      ],
    },
  },
  {
    id: "mem", type: "memory", label: "Controls",
    config: {
      memoryTags: [
        { path: "Run", type: "bool", initial: false },
        { path: "Auto", type: "bool", initial: false },
        { path: "Enable", type: "bool", initial: true },
        { path: "Setpoint", type: "real", initial: 50 },
        { path: "Speed", type: "real", initial: 40 },
        { path: "Mode", type: "int", initial: 0 },
        { path: "Batch", type: "string", initial: "B-001" },
        { path: "Clicks", type: "int", initial: 0 },
        { path: "Counter", type: "int", initial: 0 },
        { path: "RecipeTemp", type: "real", initial: 60 },
        { path: "RecipeSpeed", type: "real", initial: 30 },
        { path: "RecipeTime", type: "int", initial: 120 },
      ],
    },
  },
];

const alarmRules = [
  { id: "a-press-hi", name: "High pressure", expr: "{sim:pressure} > 64", severity: "warning", message: "Inlet pressure above 64 bar" },
  { id: "a-press-hihi", name: "Very high pressure", expr: "{sim:pressure} > 67", severity: "critical", message: "Inlet pressure above 67 bar: trip limit close" },
  { id: "a-level-lo", name: "Low level", expr: "{sim:level} < 20", severity: "warning", message: "Tank level below 20 %" },
  { id: "a-level-hi", name: "Tank nearly full", expr: "{sim:level} > 85", severity: "critical", message: "Tank level above 85 %" },
  { id: "a-temp", name: "High temperature", expr: "{sim:temp} > 85", severity: "warning", message: "Process temperature above 85 degC" },
  { id: "a-stopped", name: "Pump stopped", expr: "{sim:running} == 0", severity: "info", message: "Pump P-101 is stopped" },
  { id: "a-manual", name: "Manual mode", expr: "{mem:Auto} == 0", severity: "info", message: "Control is in manual mode" },
];

const recipes = [
  { id: "r-mild", name: "Mild batch", description: "Low temperature, slow stir", entries: [{ binding: "mem:RecipeTemp", value: 55 }, { binding: "mem:RecipeSpeed", value: 25 }, { binding: "mem:RecipeTime", value: 90 }] },
  { id: "r-std", name: "Standard batch", description: "The usual settings", entries: [{ binding: "mem:RecipeTemp", value: 70 }, { binding: "mem:RecipeSpeed", value: 40 }, { binding: "mem:RecipeTime", value: 120 }] },
  { id: "r-hot", name: "Hot batch", description: "High temperature, fast stir", entries: [{ binding: "mem:RecipeTemp", value: 85 }, { binding: "mem:RecipeSpeed", value: 60 }, { binding: "mem:RecipeTime", value: 150 }] },
];

const languages = ["en", "de"];
const translations = {
  de: {
    Overview: "Übersicht", Process: "Prozess", Trends: "Trends", Alarms: "Alarme", Controls: "Steuerung", Recipes: "Rezepte",
    "Custom widgets": "Eigene Widgets", Widgets: "Widgets", Dynamics: "Dynamik",
    "Inlet pressure": "Eingangsdruck", Flow: "Durchfluss", "Tank level": "Füllstand", Efficiency: "Wirkungsgrad",
    "Active alarms": "Aktive Alarme", Start: "Start", Stop: "Stopp", Setpoint: "Sollwert",
    Settings: "Einstellungen", Pressure: "Druck", Temperature: "Temperatur", "Pump P-101": "Pumpe P-101", "Pressure and flow": "Druck und Durchfluss",
  },
};

// ── custom widgets ─────────────────────────────────────────────────────────
const customWidgets = [
  {
    // A free layout designed at 300 x 150 px, with three parameters filled in where it is placed.
    id: "cw-pump", name: "Pump card", description: "A pump's state, speed and start button", params: [{ name: "run", description: "bool tag: running" }, { name: "speed", description: "number tag: speed" }],
    widgets: [
      { localId: "led", type: "led", x: 12, y: 8, w: 80, h: 72, bindings: { value: "{run}" }, props: { trueLabel: "RUN", falseLabel: "OFF", showQuality: false } },
      { localId: "speed", type: "numericDisplay", x: 104, y: 8, w: 184, h: 72, bindings: { value: "{speed}" }, props: { unit: "%", label: "Speed", showQuality: false } },
      { localId: "btn", type: "button", x: 12, y: 90, w: 276, h: 58, bindings: { value: "{run}" }, props: { label: "Start / stop", btnColor: "green" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } },
    ],
  },
  {
    // A flex stack: a row on a desktop and a tablet, a column on a phone; the title takes the free room.
    id: "cw-toolbar", name: "Toolbar", description: "A title and three buttons that stack on a phone", params: [],
    layout: { mode: "stack", direction: "row", gap: 8, padding: 8, align: "stretch", phone: { direction: "column" } },
    widgets: [
      { localId: "t", type: "textDisplay", x: 0, y: 0, w: 4, h: 1, flex: { grow: 1, phone: { grow: 0 } }, props: { staticText: "Toolbar (a flex stack)", fontBold: true, bgColor: "transparent", borderColor: "none" } },
      { localId: "b1", type: "button", x: 0, y: 0, w: 2, h: 1, flex: { basis: 130 }, props: { label: "Overview", btnColor: "blue", noPadding: true, bgColor: "transparent", borderColor: "none" }, events: { onClick: [{ type: "navigate", page: "p-overview" }] } },
      { localId: "b2", type: "button", x: 0, y: 0, w: 2, h: 1, flex: { basis: 130 }, props: { label: "Alarms", btnColor: "amber", noPadding: true, bgColor: "transparent", borderColor: "none" }, events: { onClick: [{ type: "navigate", page: "p-alarms" }] } },
      { localId: "b3", type: "button", x: 0, y: 0, w: 2, h: 1, flex: { basis: 130 }, hiddenOn: ["phone"], props: { label: "Recipes", btnColor: "purple", noPadding: true, bgColor: "transparent", borderColor: "none" }, events: { onClick: [{ type: "navigate", page: "p-recipes" }] } },
    ],
  },
  {
    // A stack that holds another custom widget (the pump card), to show nesting.
    id: "cw-tile", name: "Pump tile", description: "A heading over a pump card", params: [{ name: "run" }, { name: "speed" }],
    layout: { mode: "stack", direction: "column", gap: 6, padding: 6, align: "stretch" },
    widgets: [
      { localId: "h", type: "textDisplay", x: 0, y: 0, w: 4, h: 1, flex: { basis: 28 }, props: { staticText: "A custom widget inside a custom widget", fontSize: "xs", textColor: "var(--muted-foreground)", bgColor: "transparent", borderColor: "none", noPadding: true } },
      { localId: "card", type: "customWidget", x: 0, y: 0, w: 300, h: 150, flex: { grow: 1 }, props: { customWidgetId: "cw-pump", params: { run: "{run}", speed: "{speed}" }, noPadding: true } },
    ],
  },
];

// ── pages ──────────────────────────────────────────────────────────────────
const pages = [];
const page = (id, name, icon, widgets) => pages.push({ id: `p-${id}`, name, icon, widgets });

// Overview: the headline numbers, gauges, a tank, status lights, alarms and a trend.
{
  const kpi = (id, label, tag, unit, extra = {}) => [id, "numericDisplay", { bindings: { value: tag }, props: { label, unit, showQuality: false, ...extra } }];
  const k = grid([
    kpi("o-press", "Inlet pressure", "sim:pressure", "bar", { colorThresholds: [{ value: 64, color: "var(--alarm-warning)" }, { value: 67, color: "var(--alarm-critical)" }] }),
    kpi("o-flow", "Flow", "sim:flow", "m³/h"), kpi("o-level", "Tank level", "sim:level", "%"), kpi("o-eff", "Efficiency", "sim:efficiency", "%"),
  ], { cols: 4, h: 110 });
  const g = grid([
    ["o-g1", "gauge", { bindings: { value: "sim:pressure" }, props: { label: "Pressure", unit: "bar", min: 40, max: 80, thresholds: [{ value: 40, color: "#12a150" }, { value: 64, color: "#f59e0b" }, { value: 67, color: "#dc2626" }] } }],
    ["o-g2", "gauge", { bindings: { value: "sim:temp" }, props: { label: "Temperature", unit: "°C", min: 30, max: 110, thresholds: [{ value: 30, color: "#4c9aff" }, { value: 85, color: "#dc2626" }] } }],
    ["o-t1", "tank", { bindings: { value: "sim:level" }, props: { label: "T-101", unit: "%", min: 0, max: 100, thresholds: [{ value: 0, color: "#dc2626" }, { value: 20, color: "#4c9aff" }, { value: 85, color: "#f59e0b" }] } }],
    ["o-led1", "led", { bindings: { value: "sim:running" }, props: { label: "Pump P-101", trueLabel: "RUNNING", falseLabel: "STOPPED" } }],
  ], { cols: 4, y: k.next, h: 200 });
  // On a tablet (580 px) and a phone (366 px) the cards sit two by two and the alarms and trend are full width.
  const arranged = (width) => {
    const cw = Math.round((width - G) / 2), at2 = (i, y, h) => ({ x: (i % 2) * (cw + G), y: y + Math.floor(i / 2) * (h + G), w: cw, h });
    return {
      "o-press": at2(0, 0, 110), "o-flow": at2(1, 0, 110), "o-level": at2(2, 0, 110), "o-eff": at2(3, 0, 110),
      "o-g1": at2(0, 252, 200), "o-g2": at2(1, 252, 200), "o-t1": at2(2, 252, 200), "o-led1": at2(3, 252, 200),
      "o-alarms": { x: 0, y: 684, w: width, h: 240 }, "o-trend": { x: 0, y: 940, w: width, h: 240 },
    };
  };
  const tabBox = arranged(580), phoBox = arranged(366);
  const overview = [
    ...k.widgets, ...g.widgets,
    at("o-alarms", "alarmBanner", 0, g.next, col(2, 0).w, 240, { props: { label: "Active alarms", maxRows: 6 } }),
    at("o-trend", "trend", col(2, 1).x, g.next, col(2, 1).w, 240, { bindings: { value: "sim:pressure" }, props: { label: "Pressure and flow", duration: 120, tags: [{ binding: "sim:pressure", label: "Pressure (bar)", color: "#4c9aff" }, { binding: "sim:flow", label: "Flow (m³/h)", color: "#12a150" }] } }),
  ].map((w) => ({ ...w, layout: { tablet: tabBox[w.id], phone: phoBox[w.id] } }));
  page("overview", "Overview", "home", overview);
}

// Process: a pump you start and stop; the pipes flow, the pump spins and the valve follows.
{
  const run = pumpOn;
  page("process", "Process", "valve", [
    title("pr-title", "Start the pump and watch the process respond", 0),
    note("pr-note", "The pipes flow, the pump and mixer turn, and the colors change while the pump runs, all driven from the Run tag.", 36, 40, 0, 620),
    at("pr-tank", "tank", 0, 100, 130, 260, { bindings: { value: "sim:level" }, props: { label: "T-101", unit: "%", min: 0, max: 100, showQuality: false } }),
    at("pr-p1", "pipe", 130, 214, 110, 16, { props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: run, color: colorByPumpOn } }),
    at("pr-valve", "symbol", 240, 186, 60, 70, { props: { symbolId: "gate-valve", label: "V-12" }, dynamics: { stroke: colorByPumpOn } }),
    at("pr-p2", "pipe", 300, 214, 80, 16, { props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: run, color: colorByPumpOn } }),
    at("pr-pump", "symbol", 380, 168, 100, 110, { props: { symbolId: "centrifugal-pump", label: "P-101", motion: "spin", cycleSeconds: 1.2 }, dynamics: { animate: run, stroke: colorByPumpOn } }),
    at("pr-p3", "pipe", 480, 214, 230, 16, { props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: run, color: colorByPumpOn } }),
    at("pr-up", "pipe", 702, 100, 16, 122, { props: { points: "50,100 50,0", weight: 8 }, dynamics: { flow: run, color: colorByPumpOn } }),
    at("pr-mix", "symbol", 640, 40, 140, 70, { props: { symbolId: "fan", label: "Mixer X-201", motion: "spin", cycleSeconds: 2 }, dynamics: { animate: run, stroke: colorByPumpOn } }),
    at("pr-flow", "numericDisplay", 480, 150, 150, 54, { bindings: { value: "sim:flow" }, props: { unit: "m³/h", label: "Flow", showQuality: false } }),
    at("pr-btn", "button", 820, 90, 228, 64, { bindings: { value: "mem:Run" }, props: { label: "Start / stop pump", btnColor: "green", btnVariant: "filled" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }),
    at("pr-led", "led", 820, 170, 228, 64, { bindings: { value: "mem:Run" }, props: { label: "Pump command", trueLabel: "RUN", falseLabel: "STOP" } }),
    at("pr-speed", "setpoint", 820, 250, 228, 100, { bindings: { value: "mem:Speed" }, props: { label: "Speed setpoint", unit: "%", min: 0, max: 100, step: 5 } }),
    at("pr-temp", "gauge", 0, 380, 330, 220, { bindings: { value: "sim:temp" }, props: { label: "Temperature", unit: "°C", min: 30, max: 110, thresholds: [{ value: 30, color: "#4c9aff" }, { value: 70, color: "#f59e0b" }, { value: 85, color: "#dc2626" }] } }),
    at("pr-sym", "symbol", 360, 400, 100, 110, { props: { symbolId: "solenoid-valve", label: "SV-3", motion: "pulse", cycleSeconds: 1 }, dynamics: { animate: { expr: "{sim:square} == 1" } } }),
    at("pr-comp", "symbol", 500, 400, 120, 120, { props: { symbolId: "compressor", label: "K-1", motion: "spin", cycleSeconds: 2.4 }, dynamics: { animate: { expr: "{sim:running} == 1" }, stroke: colorByRunning } }),
    at("pr-rev", "pipe", 660, 440, 388, 16, { props: { points: "0,50 100,50", weight: 8, reverse: true, cycleSeconds: 1.4 }, dynamics: { flow: { expr: "{sim:running} == 1" }, color: colorByRunning } }),
    note("pr-rev-n", "A pipe that flows the other way (reverse), driven by the simulated pump.", 466, 40, 660, 388),
  ]);
}

// Trends: several pens, reference lines, fill, a fixed range per pen, and the write history.
page("trends", "Trends", "graph", [
  at("t-main", "trend", 0, 0, W, 330, { bindings: { value: "sim:pressure" }, props: { label: "Process variables, last 5 minutes", duration: 300, xFormat: "time", tags: [
    { binding: "sim:pressure", label: "Pressure (bar)", color: "#4c9aff", yMin: 40, yMax: 80 },
    { binding: "sim:flow", label: "Flow (m³/h)", color: "#12a150", yMin: 0, yMax: 100, style: "step" },
    { binding: "sim:level", label: "Level (%)", color: "#d97706", style: "area", yMin: 0, yMax: 100 },
    { binding: "sim:temp", label: "Temp (°C)", color: "#dc2626", yMin: 30, yMax: 110, dash: "dashed" },
  ], refLines: [{ value: 64, color: "#f59e0b", label: "pressure warning 64" }] } }),
  at("t-rel", "trend", 0, 346, col(2, 0).w, 250, { bindings: { value: "sim:level" }, props: { label: "Level, relative time, filled", duration: 120, xFormat: "relative", min: 0, max: 100, tags: [{ binding: "sim:level", label: "Level (%)", color: "#4c9aff", fill: true }], refLines: [{ value: 20, color: "#dc2626", label: "low 20" }, { value: 85, color: "#dc2626", label: "high 85" }] } }),
  at("t-short", "trend", col(2, 1).x, 346, col(2, 1).w, 250, { bindings: { value: "sim:efficiency" }, props: { label: "Efficiency, short time", duration: 60, xFormat: "time-short", tags: [{ binding: "sim:efficiency", label: "Efficiency (%)", color: "#12a150", style: "area", axis: "shared" }, { binding: "sim:ramp", label: "Ramp (%)", color: "#9333ea", style: "dots", axis: "shared" }], autoscale: "nice" } }),
  at("t-fit", "trend", 0, 612, col(2, 0).w, 250, { bindings: { value: "sim:pressure" }, props: { label: "Follows the data (try ◀ to step back, ⏸ to pause)", duration: 120, autoscale: "fit", windows: [30, 120, 600, 3600, 86400], tags: [{ binding: "sim:pressure", label: "Pressure (bar)", color: "#4c9aff", style: "bars", width: 1.5 }] } }),
  at("t-bare", "trend", col(2, 1).x, 612, col(2, 1).w, 250, { bindings: { value: "sim:temp" }, props: { label: "No buttons, grid or legend", duration: 90, showToolbar: false, showGrid: false, showLegend: false, autoscale: "fit", tags: [{ binding: "sim:temp", label: "Temp", color: "#dc2626", style: "area", width: 2 }] } }),
  at("t-log", "historyLog", 0, 878, W, 240, { bindings: { value: "mem:Setpoint" }, props: { label: "Write history (change a setpoint on the Controls page)", pageSize: 8 } }),
]);

// Alarms: the active alarms and the history, with a count by severity.
page("alarms", "Alarms", "alarm", [
  note("al-note", "Seven rules on the simulated tags, so alarms come and go every few seconds (one cycle is about 30 seconds). Acknowledge one with ACK.", 0, 40),
  at("al-main", "alarmBanner", 0, 50, W, 360, { props: { label: "Active alarms", maxRows: 12, showAcked: true } }),
  at("al-p", "numericDisplay", 0, 426, col(4, 0).w, 100, { bindings: { value: "sim:pressure" }, props: { label: "Pressure", unit: "bar", colorThresholds: [{ value: 64, color: "var(--alarm-warning)" }, { value: 67, color: "var(--alarm-critical)" }] } }),
  at("al-l", "numericDisplay", col(4, 1).x, 426, col(4, 1).w, 100, { bindings: { value: "sim:level" }, props: { label: "Level", unit: "%", colorThresholds: [{ value: 0, color: "var(--alarm-critical)" }, { value: 20, color: "var(--border)" }, { value: 85, color: "var(--alarm-critical)" }] } }),
  at("al-t", "numericDisplay", col(4, 2).x, 426, col(4, 2).w, 100, { bindings: { value: "sim:temp" }, props: { label: "Temperature", unit: "°C", colorThresholds: [{ value: 85, color: "var(--alarm-warning)" }] } }),
  at("al-led", "led", col(4, 3).x, 426, col(4, 3).w, 100, { bindings: { value: "sim:running" }, props: { label: "Pump", trueLabel: "RUNNING", falseLabel: "STOPPED", falseColor: "#f59e0b" } }),
  at("al-log", "historyLog", 0, 542, W, 220, { bindings: { value: "mem:Run" }, props: { label: "History", pageSize: 6 } }),
]);

// Controls: every kind of input and button, and what each does to the tags.
{
  const items = [
    ["c-toggle", "button", { bindings: { value: "mem:Run" }, props: { label: "Toggle Run", btnColor: "green" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
    ["c-moment", "button", { bindings: { value: "mem:Enable" }, props: { label: "Hold to disable", btnColor: "red", btnVariant: "outlined" }, events: { onPress: [{ type: "write", value: false }], onRelease: [{ type: "write", value: true }] } }],
    ["c-inc", "button", { bindings: { value: "mem:Clicks" }, props: { label: "Count a click", btnColor: "blue", btnVariant: "ghost" }, events: { onClick: [{ type: "increment", step: 1 }] } }],
    ["c-nav", "button", { props: { label: "Go to Alarms", btnColor: "amber", btnVariant: "flat" }, events: { onClick: [{ type: "navigate", page: "p-alarms" }] } }],
    ["c-url", "button", { props: { label: "Open the docs", btnColor: "zinc", btnVariant: "industrial" }, events: { onClick: [{ type: "openUrl", url: "https://example.com/help" }] } }],
    ["c-auto", "button", { bindings: { value: "mem:Auto" }, props: { label: "Auto mode", btnColor: "purple", btnRounded: "full", toggleOnColor: "#7c3aed", toggleOffColor: "#94a3b8" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
  ];
  const b = grid(items, { cols: 3, h: 72 });
  const inputs = grid([
    ["c-sp", "setpoint", { bindings: { value: "mem:Setpoint" }, props: { label: "Setpoint", unit: "°C", min: 0, max: 100, step: 5 } }],
    ["c-num", "numericInput", { bindings: { value: "mem:Speed" }, props: { label: "Speed (type a number)", unit: "%", min: 0, max: 100 } }],
    ["c-txt", "textInput", { bindings: { value: "mem:Batch" }, props: { label: "Batch (type text)" } }],
  ], { cols: 3, y: b.next, h: 110 });
  const state = grid([
    ["c-ms", "multiState", { bindings: { value: "mem:Mode" }, props: { label: "Mode", states: [
      { value: 0, label: "Idle", color: "#64748b", textColor: "#ffffff" }, { value: 1, label: "Starting", color: "#b45309", textColor: "#ffffff" }, { value: 2, label: "Running", color: "#15803d", textColor: "#ffffff" }, { value: 3, label: "Stopping", color: "#b91c1c", textColor: "#ffffff" }] } }],
    ["c-modebtn", "button", { bindings: { value: "mem:Mode" }, props: { label: "Next mode (0 to 3)" }, events: { onClick: [{ type: "increment", step: 1 }] } }],
    ["c-clicks", "numericDisplay", { bindings: { value: "mem:Clicks" }, props: { label: "Clicks counted" } }],
    ["c-led", "led", { bindings: { value: "mem:Enable" }, props: { label: "Enable", trueLabel: "ENABLED", falseLabel: "DISABLED" } }],
    ["c-counter", "numericDisplay", { bindings: { value: "mem:Counter" }, props: { label: "Seconds counted by a runtime script" } }],
    ["c-session", "textDisplay", { bindings: { value: "session:pump" }, props: { label: "Session variable: pump (this tab only)" } }],
  ], { cols: 3, y: inputs.next, h: 100 });
  const sess = grid([
    ["c-s1", "button", { props: { label: "Select pump 1" }, events: { onClick: [{ type: "write", tag: "session:pump", value: 1 }] } }],
    ["c-s2", "button", { props: { label: "Select pump 2" }, events: { onClick: [{ type: "write", tag: "session:pump", value: 2 }] } }],
    ["c-s3", "button", { props: { label: "Select pump 3", btnColor: "green" }, events: { onClick: [{ type: "write", tag: "session:pump", value: 3 }] } }],
  ], { cols: 3, y: state.next, h: 64 });
  page("controls", "Controls", "tools", [
    ...b.widgets, ...inputs.widgets, ...state.widgets, ...sess.widgets,
  ]);
}

// Recipes: pick a batch; the runtime writes its values through the same checks as any write.
page("recipes", "Recipes", "flask", [
  at("rc-w", "recipes", 0, 0, 500, 470, { props: { label: "Recipes" } }),
  at("rc-t", "numericDisplay", 516, 0, 252, 110, { bindings: { value: "mem:RecipeTemp" }, props: { label: "Temperature", unit: "°C" } }),
  at("rc-s", "numericDisplay", 784, 0, 264, 110, { bindings: { value: "mem:RecipeSpeed" }, props: { label: "Speed", unit: "%" } }),
  at("rc-time", "numericDisplay", 516, 126, 252, 110, { bindings: { value: "mem:RecipeTime" }, props: { label: "Time", unit: "s" } }),
  at("rc-ms", "multiState", 784, 126, 264, 110, { bindings: { value: "mem:RecipeTemp" }, props: { label: "Batch type from the temperature", states: [
    { value: 55, label: "Mild", color: "#1d4ed8", textColor: "#ffffff" }, { value: 70, label: "Standard", color: "#15803d", textColor: "#ffffff" }, { value: 85, label: "Hot", color: "#b91c1c", textColor: "#ffffff" }] } }),
  note("rc-note", "Press Apply on a recipe: the numbers above change. Applying needs the permission to apply recipes; the runtime says why if it refuses.", 252, 60, 516, 532),
  at("rc-one", "recipes", 516, 326, 532, 150, { props: { label: "One recipe, no tag list", recipeId: "r-hot", showEntries: false } }),
]);

// Custom widgets: three pump cards from one design, a stack toolbar, and one custom widget inside another.
{
  const card = (id, x, label, run, speed) => at(id, "customWidget", x, 40, 300, 160, { props: { customWidgetId: "cw-pump", params: { run, speed }, label } });
  const custom = [
    note("cw-n1", "One design (Pump card), three places, each with its own tags. Change the design once and all three follow.", 0, 36),
    card("cw-a", 0, "Pump A (controls)", "mem:Run", "mem:Speed"),
    card("cw-b", 374, "Pump B (simulated)", "sim:running", "sim:efficiency"),
    card("cw-c", 748, "Pump C (on Enable)", "mem:Enable", "sim:flow"),
    note("cw-n2", "A flex stack: a row here, a column on a phone. Resize the window to under 640 px to see it.", 224, 36),
    at("cw-tool", "customWidget", 0, 264, W, 64, { props: { customWidgetId: "cw-toolbar", label: "" } }),
    note("cw-n3", "A custom widget inside a custom widget.", 352, 30),
    at("cw-tile", "customWidget", 0, 384, 360, 240, { props: { customWidgetId: "cw-tile", params: { run: "mem:Run", speed: "sim:efficiency" }, label: "Pump tile" } }),
  ];
  // On a tablet and a phone everything stacks in one column; the toolbar becomes a column too (its own phone layout).
  const stacked = (width) => {
    const mid = (w) => Math.round((width - w) / 2);
    return {
      "cw-n1": { x: 0, y: 0, w: width, h: 44 },
      "cw-a": { x: mid(300), y: 52, w: 300, h: 160 }, "cw-b": { x: mid(300), y: 224, w: 300, h: 160 }, "cw-c": { x: mid(300), y: 396, w: 300, h: 160 },
      "cw-n2": { x: 0, y: 568, w: width, h: 44 }, "cw-tool": { x: 0, y: 620, w: width, h: width < 500 ? 210 : 64 },
      "cw-n3": { x: 0, y: width < 500 ? 842 : 696, w: width, h: 30 }, "cw-tile": { x: mid(360), y: width < 500 ? 880 : 734, w: 360, h: 240 },
    };
  };
  const cTab = stacked(580), cPho = stacked(366);
  page("custom", "Custom widgets", "pump", custom.map((w) => ({ ...w, layout: { tablet: cTab[w.id], phone: cPho[w.id] } })));
}

// Widgets: one of every widget type, in a labeled card each.
{
  const items = [
    ["w-gauge", "gauge", { bindings: { value: "sim:pressure" }, props: { label: "gauge", unit: "bar", min: 40, max: 80 } }],
    ["w-num", "numericDisplay", { bindings: { value: "sim:flow" }, props: { label: "numericDisplay", unit: "m³/h" } }],
    ["w-num-fit", "numericDisplay", { bindings: { value: "sim:flow" }, props: { label: "number only, fit", unit: "m³/h", showLabel: false, showUnit: false, fontSize: "fit", fontBold: true, textAlign: "center", textColor: "#ffffff", bgColor: "#0f766e", borderColor: "none", radius: 16, shadow: false } }],
    ["w-num-mono", "numericDisplay", { bindings: { value: "sim:pressure" }, props: { label: "mono, 36 px", unit: "bar", fontFamily: "mono", fontPx: 36, valign: "top", bgColor: "none", borderColor: "none", padding: 0 } }],
    ["w-ni-bare", "numericInput", { bindings: { value: "mem:Speed" }, props: { label: "input, number only", unit: "%", min: 0, max: 100, showLabel: false, showUnit: false, fontSize: "4xl", textAlign: "center", borderWidth: 2, radius: 4 } }],
    ["w-text", "textDisplay", { props: { label: "textDisplay", staticText: "Pump station 2" } }],
    ["w-led", "led", { bindings: { value: "sim:running" }, props: { label: "led", trueLabel: "ON", falseLabel: "OFF" } }],
    ["w-tank", "tank", { bindings: { value: "sim:level" }, props: { label: "tank", unit: "%", min: 0, max: 100 } }],
    ["w-btn", "button", { bindings: { value: "mem:Run" }, props: { label: "button" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
    ["w-sp", "setpoint", { bindings: { value: "mem:Setpoint" }, props: { label: "setpoint", unit: "°C", min: 0, max: 100, step: 5 } }],
    ["w-ms", "multiState", { bindings: { value: "sim:mode" }, props: { label: "multiState", states: [
      { value: 0, label: "Idle", color: "#64748b", textColor: "#ffffff" }, { value: 1, label: "Start", color: "#b45309", textColor: "#ffffff" }, { value: 2, label: "Run", color: "#15803d", textColor: "#ffffff" }, { value: 3, label: "Stop", color: "#b91c1c", textColor: "#ffffff" }] } }],
    ["w-trend", "trend", { bindings: { value: "sim:temp" }, props: { label: "trend", duration: 60, tags: [{ binding: "sim:temp", label: "Temp", color: "#dc2626" }] } }],
    ["w-ni", "numericInput", { bindings: { value: "mem:Speed" }, props: { label: "numericInput", unit: "%", min: 0, max: 100 } }],
    ["w-ti", "textInput", { bindings: { value: "mem:Batch" }, props: { label: "textInput" } }],
    ["w-hl", "historyLog", { bindings: { value: "mem:Setpoint" }, props: { label: "historyLog", pageSize: 3 } }],
    ["w-ab", "alarmBanner", { props: { label: "alarmBanner", maxRows: 3 } }],
    ["w-img", "image", { props: { label: "image", src: LOGO, fit: "contain" } }],
    ["w-sym", "symbol", { props: { label: "symbol", symbolId: "centrifugal-pump", motion: "spin", animate: true, cycleSeconds: 1.5 } }],
    ["w-pipe", "pipe", { props: { label: "pipe", points: "0,50 100,50", weight: 12, flow: true, color: "#2563eb" } }],
    ["w-table", "table", { props: { label: "table", rows: [{ label: "Pressure", binding: "sim:pressure", unit: "bar" }, { label: "Flow", binding: "sim:flow", unit: "m³/h" }, { label: "Level", binding: "sim:level", unit: "%" }, { label: "Setpoint", binding: "mem:Setpoint", unit: "°C" }] } }],
    ["w-cw", "customWidget", { props: { label: "customWidget", customWidgetId: "cw-pump", params: { run: "mem:Run", speed: "mem:Speed" } } }],
    ["w-pl", "pageList", { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "pageList (tabs)", style: "tabs" } }],
    ["w-clock", "clock", { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "clock", format: "dateTime" } }],
    ["w-ds", "driverStatus", { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "driverStatus" } }],
    ["w-um", "userMenu", { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "userMenu" } }],
    ["w-rec", "recipes", { props: { label: "recipes", recipeId: "r-std", showEntries: false } }],
  ];
  const g = grid(items, { cols: 3, h: 170 });
  page("widgets", "Widgets", "dial", [
    note("wd-n", "All 23 widget types, each live. (The page list also comes in list, icons and bar styles.)", 0, 30),
    ...g.widgets.map((w) => ({ ...w, y: w.y + 40 })),
  ]);
}

// Dynamics: every driven property, and every kind of transform, each on a widget that shows it.
{
  const d = (id, type, label, how, props, dynamics, rest = {}) => at(id, type, 0, 0, 0, 0, { props: { label, ...props }, dynamics, ...rest, _how: how });
  const cards = [
    d("d-visible", "textDisplay", "visible", "appears only while the simulated pump runs (a flag)", { staticText: "I appear while the pump runs" }, { visible: running }),
    d("d-disabled", "button", "disabled", "disabled while the mode is Starting (a flag)", { btnColor: "blue" }, { disabled: { expr: "{sim:mode} == 1" } }, { bindings: { value: "mem:Clicks" }, events: { onClick: [{ type: "increment", step: 1 }] } }),
    d("d-opacity", "textDisplay", "opacity", "fades with the level (linear 0..100 to 0.2..1)", { staticText: "Fading text", fontBold: true }, { opacity: { expr: "{sim:level}", transform: { kind: "linear", in: [0, 100], out: [0.2, 1] } } }),
    d("d-label", "numericDisplay", "label", "the label changes with the mode (map)", { unit: "bar" }, { label: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "Idle" }, { equals: 1, value: "Starting" }, { equals: 2, value: "Running" }], default: "Stopping" } } }, { bindings: { value: "sim:pressure" } }),
    d("d-bg", "textDisplay", "bgColor", "background by level (thresholds)", { staticText: "Level color", textColor: "#ffffff" }, { bgColor: { expr: "{sim:level}", transform: { kind: "thresholds", below: "#2563eb", steps: [{ above: 25, value: "#16a34a" }, { above: 60, value: "#f59e0b" }, { above: 85, value: "#dc2626" }] } } }),
    d("d-border", "textDisplay", "borderColor", "border by state, with theme tokens (map)", { staticText: "Border follows the mode" }, { borderColor: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "token:process-off" }, { equals: 1, value: "token:alarm-warning" }, { equals: 2, value: "token:process-running" }], default: "token:alarm-critical" } } }),
    d("d-text", "textDisplay", "textColor", "text color while running (map)", { staticText: "Green while running", fontBold: true }, { textColor: { expr: "{sim:running}", transform: { kind: "map", cases: [{ equals: 1, value: "#16a34a" }], default: "#dc2626" } } }),
    d("d-blink", "led", "blink", "blinks while pressure is above 64 (a flag)", { blinkPeriodMs: 500, blinkColor: "#dc2626", trueLabel: "HIGH", falseLabel: "OK" }, { blink: { expr: "{sim:pressure} > 64" } }, { bindings: { value: "sim:pressure" } }),
    d("d-rotate", "symbol", "rotate", "turns with the phase (linear 0..6.283 to 0..360)", { symbolId: "fan" }, { rotate: { expr: "{sim:phase}", transform: { kind: "linear", in: [0, 6.283], out: [0, 360] } } }),
    d("d-min", "gauge", "min and max", "the scale follows the mode (map)", { unit: "bar" }, { min: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: 0 }, { equals: 1, value: 20 }], default: 40 } }, max: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: 100 }, { equals: 1, value: 90 }], default: 80 } } }, { bindings: { value: "sim:pressure" } }),
    d("d-unit", "numericDisplay", "unit", "the unit follows the mode (map)", {}, { unit: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "bar" }, { equals: 1, value: "kPa" }, { equals: 2, value: "psi" }], default: "MPa" } } }, { bindings: { value: "sim:pressure" } }),
    d("d-step", "setpoint", "step", "the step size follows the mode (map)", { min: 0, max: 100, unit: "°C" }, { step: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: 1 }, { equals: 1, value: 5 }], default: 10 } } }, { bindings: { value: "mem:Setpoint" } }),
    d("d-static", "textDisplay", "staticText", "text built from a tag (format)", { staticText: "…" }, { staticText: { expr: "'Pressure ' + format({sim:pressure}, 1) + ' bar'" } }),
    d("d-true", "led", "trueColor, falseColor, trueLabel, falseLabel", "colors and words follow the mode", {}, { trueColor: { expr: "{sim:mode}", transform: { kind: "thresholds", below: "#16a34a", steps: [{ above: 2, value: "#dc2626" }] } }, falseColor: { expr: "{sim:mode}", transform: { kind: "linear", in: [0, 3], out: [0, 1], clamp: true } }, trueLabel: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "ZERO" }], default: "ON" } }, falseLabel: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "OFFLINE" }], default: "OFF" } } }, { bindings: { value: "sim:running" } }),
    d("d-btn", "button", "btnColor", "the button color follows the mode (map)", {}, { btnColor: { expr: "{sim:mode}", transform: { kind: "map", cases: [{ equals: 0, value: "zinc" }, { equals: 1, value: "amber" }, { equals: 2, value: "green" }], default: "red" } } }, { bindings: { value: "mem:Run" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }),
    d("d-src", "image", "src", "the picture swaps while the pump runs (map)", { fit: "contain" }, { src: { expr: "{sim:running}", transform: { kind: "map", cases: [{ equals: 1, value: IMG_ON }], default: IMG_OFF } } }),
    d("d-stroke", "symbol", "stroke and animate", "a spinning pump that follows the simulated run (a flag, a map)", { symbolId: "centrifugal-pump", motion: "spin", cycleSeconds: 1.2 }, { stroke: colorByRunning, animate: running }),
    d("d-pipe", "pipe", "color, flow, reverse", "flows while running, reverses with the square wave (a flag, a map)", { points: "0,50 100,50", weight: 12 }, { color: colorByRunning, flow: running, reverse: { expr: "{sim:square} == 1" } }),
    d("d-all", "textDisplay", "no transform", "an expression alone: a flag shows as 1 or 0", { staticText: "Text from a comparison" }, { staticText: { expr: "{sim:pressure} > 64 ? 'above 64' : 'normal'" } }),
    d("d-session", "textDisplay", "session variable", "shown only after Show details is pressed on the Controls page", { staticText: "Details shown (session variable)" }, { visible: { expr: "{session:pump} == 3" } }),
  ];
  // each card is the widget (130 tall) with a caption under it that says what drives what
  const CARD = 130, CELL = 190;
  const widgets = [];
  cards.forEach((c, i) => {
    const { _how, id, type, props, dynamics, x: _x, y: _y, w: _w, h: _h, ...rest } = c;
    const cx = col(3, i % 3), cy = 46 + Math.floor(i / 3) * CELL;
    widgets.push(at(id, type, cx.x, cy, cx.w, CARD, { props, dynamics, ...rest }));
    widgets.push(at(`${id}-cap`, "textDisplay", cx.x, cy + CARD + 4, cx.w, 48, { props: { staticText: _how, fontSize: "xs", textColor: "var(--muted-foreground)", bgColor: "transparent", borderColor: "none", noPadding: true } }));
  });
  page("dynamics", "Dynamics", "bolt", [
    note("dy-n", "Every property a tag can drive, and the three kinds of transform: linear, thresholds, map. The caption under each card says what drives what. They all move on their own.", 0, 40),
    ...widgets,
  ]);
}

const project = {
  schemaVersion: 6,
  version: "1.0.0",
  name: "Feature Tour",
  theme: { preset },
  shell: { nav: "sidebar" },
  canvasSnap: "pixel",
  canvasResolution: { type: "dynamic" },
  languages, translations,
  datasources, alarmRules, recipes, customWidgets,
  sessionVars: [{ name: "pump", type: "int", initial: 1 }],
  scripts: [{
    id: "counter", name: "Seconds counter", trigger: { every: 1000 }, writes: ["mem:Counter"],
    source: "await writeTag('mem:Counter', (readTag('mem:Counter') ?? 0) + 1);",
  }],
  pages,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");
const count = pages.reduce((n, p) => n + p.widgets.length, 0);
console.log(`wrote ${out}: ${pages.length} pages, ${count} widgets, ${customWidgets.length} custom widgets, theme ${preset}`);
