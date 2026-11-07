// Builds samples/design-directions.screens.json: the pump station overview from the "Screen Design
// Directions" board, as a real project. It uses pixel positions so the layout can follow the board,
// the project's `layout` for the tablet and phone arrangements, and the `clean` preset; switch the
// theme to `calm` or `modern` in the IDE (Theme panel) for the other two directions.
//
//   node scripts/samples/design-directions.mjs [preset]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const preset = process.argv[2] ?? "clean";
const out = process.argv[3] ?? resolve(root, "samples/design-directions.screens.json");

const GAP = 16;
// What the operator leaves for the page beside the 208 px sidebar, and the width of a phone.
const WIDTH = { desktop: 1048, tablet: 580, phone: 366 };
const DESIGN_DIAGRAM_W = 688;

const px = (n) => Math.max(1, Math.round(n));
const running = { expr: "{sim:pump_running} == 1" };
const colorByRunning = {
  expr: "{sim:pump_running}",
  transform: { kind: "map", cases: [{ equals: 1, value: "token:process-running" }], default: "token:process-off" },
};

/** The diagram's parts in the board's own 688 px coordinates, relative to the card's corner. */
const diagram = [
  { id: "d-tank", type: "tank", x: 16, y: 44, w: 104, h: 200, bindings: { value: "sim:level" }, props: { label: "T-101", unit: "%", min: 0, max: 100, bgColor: "none", borderColor: "none", showQuality: false } },
  { id: "d-pipe-1", type: "pipe", x: 120, y: 170, w: 84, h: 16, props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: running, color: colorByRunning } },
  { id: "d-valve", type: "symbol", x: 204, y: 146, w: 52, h: 64, props: { symbolId: "gate-valve", label: "V-12 open" }, dynamics: { stroke: colorByRunning } },
  { id: "d-pipe-2", type: "pipe", x: 256, y: 170, w: 72, h: 16, props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: running, color: colorByRunning } },
  { id: "d-pump", type: "symbol", x: 328, y: 128, w: 84, h: 98, props: { symbolId: "centrifugal-pump", label: "P-101 running", motion: "spin", cycleSeconds: 1.4 }, dynamics: { animate: running, stroke: colorByRunning } },
  { id: "d-pipe-3", type: "pipe", x: 412, y: 170, w: 168, h: 16, props: { points: "0,50 100,50", weight: 8 }, dynamics: { flow: running, color: colorByRunning } },
  { id: "d-pipe-up", type: "pipe", x: 572, y: 60, w: 16, h: 118, props: { points: "50,100 50,0", weight: 8 }, dynamics: { flow: running, color: colorByRunning } },
  { id: "d-mixer", type: "textDisplay", x: 512, y: 16, w: 148, h: 48, props: { staticText: "X-201", fontBold: true, textAlign: "center" } },
  { id: "d-flow", type: "numericDisplay", x: 420, y: 124, w: 124, h: 44, bindings: { value: "sim:flow" }, props: { unit: "m³/h", bgColor: "none", borderColor: "none", noPadding: true, showQuality: false } },
];

const kpis = [
  { id: "k-pressure", type: "numericDisplay", bindings: { value: "sim:pressure" }, props: { label: "Inlet pressure", unit: "bar", showQuality: false, colorThresholds: [{ value: 62, color: "var(--alarm-warning)" }] } },
  { id: "k-flow", type: "numericDisplay", bindings: { value: "sim:flow" }, props: { label: "Flow", unit: "m³/h", showQuality: false } },
  { id: "k-level", type: "numericDisplay", bindings: { value: "sim:level" }, props: { label: "Tank level", unit: "%", showQuality: false } },
  { id: "k-eff", type: "numericDisplay", bindings: { value: "sim:efficiency" }, props: { label: "Efficiency", unit: "%", showQuality: false } },
];

/** Every Overview widget's box on a device. */
function boxes(device) {
  const W = WIDTH[device];
  const desktop = device === "desktop";
  const b = {};
  const cols = desktop ? 4 : 2;
  const kw = (W - GAP * (cols - 1)) / cols;
  const kh = desktop ? 124 : 132;
  kpis.forEach((k, i) => { b[k.id] = { x: px((i % cols) * (kw + GAP)), y: px(Math.floor(i / cols) * (kh + GAP)), w: px(kw), h: kh }; });
  const rowY = (desktop ? 1 : 2) * (kh + GAP);
  const dw = desktop ? DESIGN_DIAGRAM_W : W;
  const s = dw / DESIGN_DIAGRAM_W;
  const dh = px(268 * s);
  b["d-card"] = { x: 0, y: rowY, w: px(dw), h: dh };
  for (const p of diagram) b[p.id] = { x: px(p.x * s), y: px(rowY + p.y * s), w: px(p.w * s), h: px(p.h * s) };
  b["alarms"] = desktop ? { x: DESIGN_DIAGRAM_W + GAP, y: rowY, w: W - DESIGN_DIAGRAM_W - GAP, h: 268 } : { x: 0, y: rowY + dh + GAP, w: W, h: 220 };
  const trendY = desktop ? rowY + 268 + GAP : b.alarms.y + b.alarms.h + GAP;
  b["trend"] = { x: 0, y: trendY, w: W, h: 220 };
  return b;
}

const desk = boxes("desktop");
const tab = boxes("tablet");
const pho = boxes("phone");
const same = (a, c) => a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h;

/** A widget with its desktop box and, where they differ, its tablet and phone placements. */
function place(w, id = w.id) {
  const d = desk[id];
  const layout = {};
  if (!same(d, tab[id])) layout.tablet = { ...tab[id] };
  if (!same(tab[id], pho[id])) layout.phone = { ...pho[id] };
  return { ...w, x: d.x, y: d.y, w: d.w, h: d.h, ...(Object.keys(layout).length ? { layout } : {}) };
}

const overview = [
  ...kpis.map((k) => place(k)),
  place({ id: "d-card", type: "textDisplay", props: { label: "Pump station", staticText: " " } }),
  ...diagram.map((p) => place(p)),
  place({ id: "alarms", type: "alarmBanner", props: { label: "Active alarms", maxRows: 6 } }),
  place({ id: "trend", type: "trend", bindings: { value: "sim:pressure" }, props: { label: "Inlet pressure", duration: 120, min: 50, max: 70, tags: [{ binding: "sim:pressure", label: "Pressure (bar)", color: "#4c9aff", fill: true }], refLines: [{ value: 65, label: "limit 65", color: "#d92d20" }, { value: 60, label: "setpoint 60", color: "#8a97a8" }] } }),
].map((w) => w);

// The other pages: one thing each. Settings is not a page: the operator adds its own Settings screen last.
const full = { x: 0, y: 0, w: WIDTH.desktop };
const other = (id, name, icon, widgets) => ({ id: `p-${id}`, name, icon, widgets: widgets.map((w) => ({ x: 0, y: 0, ...w })) });

const project = {
  schemaVersion: 5,
  version: "1.0.0",
  name: "Pump Station 2",
  theme: { preset },
  shell: { nav: "sidebar" },
  canvasSnap: "pixel",
  canvasResolution: { type: "dynamic" },
  datasources: [{
    id: "sim", type: "virtual", label: "Simulation",
    config: {
      tags: [
        { path: "phase", expr: "((good({sim:phase}) ? {sim:phase} : 0) + 0.012) % 6.283" },
        { path: "pressure", expr: "62.3 + sin({sim:phase}) * 0.9" },
        { path: "flow", expr: "51.7 + sin({sim:phase} * 1.3) * 1.4" },
        { path: "level", expr: "66 + sin({sim:phase} * 0.7) * 3" },
        { path: "efficiency", expr: "69 + sin({sim:phase} * 0.5) * 1.5" },
        { path: "pump_running", expr: "1" },
      ],
    },
  }],
  alarmRules: [
    { id: "a-pressure", name: "High inlet pressure", expr: "{sim:pressure} > 62", severity: "warning", message: "Inlet pressure above 62 bar" },
    { id: "a-standby", name: "Pump 2 in standby", expr: "{sim:pump_running} == 1", severity: "info", message: "Pump 2 in standby, auto start enabled" },
    { id: "a-calibration", name: "Calibration due", expr: "{sim:pump_running} == 1", severity: "info", message: "Calibration due on flow transmitter FT-101" },
  ],
  pages: [
    { id: "p-overview", name: "Overview", icon: "home", widgets: overview },
    other("process", "Process", "valve", [
      { id: "pr-card", type: "textDisplay", ...full, h: 300, props: { label: "Pump station", staticText: " " } },
      ...diagram.map((p) => ({ ...p, y: p.y + 0 })),
    ]),
    other("trends", "Trends", "graph", [
      { id: "tr-main", type: "trend", ...full, h: 420, bindings: { value: "sim:pressure" }, props: { label: "Process variables", duration: 300, tags: [
        { binding: "sim:pressure", label: "Pressure (bar)", color: "#4c9aff" }, { binding: "sim:flow", label: "Flow (m³/h)", color: "#12a150" }, { binding: "sim:level", label: "Level (%)", color: "#d98300" } ] } },
    ]),
    other("alarms", "Alarms", "alarm", [
      { id: "al-main", type: "alarmBanner", ...full, h: 420, props: { label: "Active alarms", maxRows: 12, showAcked: true } },
    ]),
  ],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");
console.log(`wrote ${out}: ${overview.length} widgets on Overview, theme ${preset}`);
