// Builds samples/plc-demo.screens.json: reading and writing a real PLC over OPC UA and REST, and a
// runtime script that acts on what the PLC reports.
//
//   node scripts/samples/plc-demo.mjs [--plc=10.0.0.210] [--opcua-fingerprint=..] [--rest-fingerprint=..]
//                                     [--rehearse] [--out=file]
//
// It uses the test variables of the lab AXC F 3152 (iOPC_/rOPC_/sOPC_Read and _Write, the REST twins,
// HMI_SIM_Temp and HMI_SIM_Volt). The PLC connections have no credentials (OPC UA anonymous, REST without
// login) and pin the controller's certificates: without --opcua-fingerprint and --rest-fingerprint the pin is
// empty and a datasource will not connect until the IDE's Test button shows the fingerprint to pin.
//
// The script writes only the two test variables its `writes` list names (iOPC_Write and, when mirroring is
// switched on, iREST_Write), and it starts switched off: nothing is written to the PLC until you switch the
// rule on, on the Script page.
//
// --rehearse swaps the two PLC datasources for memory datasources with the same names and tag paths, and adds a
// Simulator page whose sliders play the PLC's inputs, so the whole demo, scripts included, runs with no PLC.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : "true"]; }));
const plc = args.plc ?? "10.0.0.210";
const rehearse = "rehearse" in args;
const out = args.out ?? resolve(root, rehearse ? "samples/plc-demo.rehearsal.screens.json" : "samples/plc-demo.screens.json");

const W = 1048, G = 16;
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const op = (name) => `opcua:${O}${name}`;
const rs = (name) => `rest:${R}${name}`;
const IN = op("iOPC_Read"), OUT = op("iOPC_Write");

// ── helpers ──────────────────────────────────────────────────────────────
const at = (id, type, x, y, w, h, rest = {}) => ({ id, type, x, y, w, h, ...rest });
const col = (n, i, span = 1, total = W) => { const cw = (total - (n - 1) * G) / n; return { x: Math.round(i * (cw + G)), w: Math.round(cw * span + (span - 1) * G) }; };
function grid(items, { cols: n, y = 0, h = 110 }) {
  const widgets = items.map(([id, type, rest], i) => { const c = col(n, i % n); return at(id, type, c.x, y + Math.floor(i / n) * (h + G), c.w, h, rest); });
  return { widgets, next: y + Math.ceil(items.length / n) * (h + G) };
}
const title = (id, text, y) => at(id, "textDisplay", 0, y, W, 34, { props: { staticText: text, fontBold: true, fontSize: "xl", bgColor: "transparent", borderColor: "none", noPadding: true } });
const note = (id, text, y, h = 36, x = 0, w = W) => at(id, "textDisplay", x, y, w, h, { props: { staticText: text, fontSize: "sm", textColor: "var(--muted-foreground)", bgColor: "transparent", borderColor: "none", noPadding: true } });

// ── data ───────────────────────────────────────────────────────────────────
const opcVars = [
  ["iOPC_Read", "int", 0], ["rOPC_Read", "real", 0], ["sOPC_Read", "string", ""], ["HMI_SIM_Temp", "real", 75], ["HMI_SIM_Volt", "real", 5],
  ["rRTD_Fahrenheit", "real", 70], ["rVoltage_0_100_Scaled", "real", 50],
  ["iOPC_Write", "int", 0], ["rOPC_Write", "real", 0], ["sOPC_Write", "string", ""],
];
const restVars = [["iREST_Read", "int", 0], ["rREST_Read", "real", 0], ["sREST_Read", "string", ""], ["iREST_Write", "int", 0], ["rREST_Write", "real", 0], ["sREST_Write", "string", ""]];
const memVars = (vars, prefix) => vars.map(([name, type, initial]) => ({ path: `${prefix}${name}`, type, initial }));

const datasources = rehearse
  ? [
    { id: "opcua", type: "memory", label: "PLC OPC UA (rehearsal)", config: { memoryTags: memVars(opcVars, O) } },
    { id: "rest", type: "memory", label: "PLC REST (rehearsal)", config: { memoryTags: memVars(restVars, R) } },
  ]
  : [
    { id: "opcua", type: "opcua", label: "PLC OPC UA", config: { endpoint: `opc.tcp://${plc}:4840`, securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256", certCheck: "pinned", certFingerprint: args["opcua-fingerprint"] ?? "" } },
    { id: "rest", type: "rest", label: "PLC REST", config: { endpoint: `https://${plc}`, basePath: "/_pxc_api/v1.14", certCheck: "pinned", certFingerprint: args["rest-fingerprint"] ?? "" } },
  ];
datasources.push({
  id: "mem", type: "memory", label: "Script state",
  config: {
    memoryTags: [
      { path: "RuleEnable", type: "bool", initial: false },
      { path: "Threshold", type: "real", initial: 100 },
      { path: "WaitSeconds", type: "int", initial: 5 },
      { path: "Step", type: "int", initial: 100 },
      { path: "RuleState", type: "string", initial: "Switched off" },
      { path: "Countdown", type: "int", initial: 0 },
      { path: "Fired", type: "int", initial: 0 },
      { path: "LastFired", type: "string", initial: "never" },
      { path: "MirrorEnable", type: "bool", initial: false },
      { path: "Mirrored", type: "int", initial: 0 },
    ],
  },
});

// ── scripts ────────────────────────────────────────────────────────────────
// "If the OPC read-in stays above the limit for 5 seconds, increment the OPC write by 100", once each time the
// value goes above the limit (it re-arms when the value drops back). A runtime script cannot sleep (a run is cut
// off after 100 ms), so it checks four times a second and keeps the time the value first went over in `state`.
const ruleSource = `
// A run that awaits a write lets the next trigger start (every 250 ms, while a PLC write takes about 300 ms), so
// the runs would overlap and act twice. This one skips a trigger while the previous run is still waiting.
if (state.busy) return;
state.busy = true;
try {
  const IN = ${JSON.stringify(IN)}, OUT = ${JSON.stringify(OUT)};
  const set = async (text, left) => {
    if (state.text !== text) { state.text = text; await writeTag('mem:RuleState', text); }
    if (state.left !== left) { state.left = left; await writeTag('mem:Countdown', left); }
  };
  if (!readTag('mem:RuleEnable')) { state.since = undefined; state.done = false; await set('Switched off', 0); return; }
  const value = readTag(IN);
  if (quality(IN) !== 'Good' || typeof value !== 'number') { state.since = undefined; await set('Waiting for the PLC', 0); return; }
  const limit = readTag('mem:Threshold') ?? 100;
  const wait = (readTag('mem:WaitSeconds') ?? 5) * 1000;
  if (value <= limit) { state.since = undefined; state.done = false; await set('Input at or below the limit', 0); return; }
  state.since ??= Date.now();
  const left = wait - (Date.now() - state.since);
  if (left > 0) { await set('Input above the limit, waiting', Math.ceil(left / 1000)); return; }
  if (state.done) { await set('Done: waiting for the input to drop', 0); return; }
  const current = readTag(OUT);
  const next = (typeof current === 'number' ? current : 0) + (readTag('mem:Step') ?? 100);
  const r = await writeTag(OUT, next);
  if (r.status !== 'confirmed') { log('increment not confirmed:', r.status, r.reason ?? ''); await set('Write failed: ' + (r.reason ?? r.status), 0); return; }
  state.done = true;
  state.fired = (state.fired ?? 0) + 1;
  await writeTag('mem:Fired', state.fired);
  await writeTag('mem:LastFired', new Date().toLocaleTimeString() + ': ' + OUT.split('/').pop() + ' = ' + next);
  emit('plc.increment', { value, limit, wrote: next, n: state.fired });
  log('input', value, 'was above', limit, 'for', wait / 1000, 's: wrote', next);
  await set('Done: waiting for the input to drop', 0);
} finally {
  state.busy = false;
}
`;
// When switched on, the OPC read-in is copied to the REST write variable each time it changes: a value
// read over one protocol written over the other.
const mirrorSource = `
const IN = ${JSON.stringify(IN)}, OUT = ${JSON.stringify(rs("iREST_Write"))};
if (!readTag('mem:MirrorEnable') || event.quality !== 'Good' || typeof event.value !== 'number') return;
if (event.value === state.last) return;
state.last = event.value;
const r = await writeTag(OUT, Math.round(event.value));
if (r.status !== 'confirmed') { log('mirror not confirmed:', r.status, r.reason ?? ''); return; }
state.count = (state.count ?? 0) + 1; // counted before the await, so runs that overlap cannot repeat a number
await writeTag('mem:Mirrored', state.count);
`;
const scripts = [
  { id: "increment-rule", name: "Increment when the input stays high", trigger: { every: 250 }, writes: [OUT, "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired"], source: ruleSource.trim() },
  { id: "mirror", name: "Mirror the OPC read-in to REST", trigger: { onChange: [IN] }, writes: [rs("iREST_Write"), "mem:Mirrored"], source: mirrorSource.trim() },
];

// ── pages ──────────────────────────────────────────────────────────────────
const pages = [];
const page = (id, name, icon, widgets) => pages.push({ id: `p-${id}`, name, icon, widgets });
const num = (id, label, tag, unit) => [id, "numericDisplay", { bindings: { value: tag }, props: { label, ...(unit ? { unit } : {}), showQuality: true } }];
const txt = (id, label, tag) => [id, "textDisplay", { bindings: { value: tag }, props: { label } }];

// 1. PLC: what the controller reports, over both protocols.
{
  const a = grid([
    num("r-i", "OPC UA: iOPC_Read", IN), num("r-r", "OPC UA: rOPC_Read", op("rOPC_Read")), txt("r-s", "OPC UA: sOPC_Read", op("sOPC_Read")),
    num("r-ri", "REST: iREST_Read", rs("iREST_Read")), num("r-rr", "REST: rREST_Read", rs("rREST_Read")), txt("r-rs", "REST: sREST_Read", rs("sREST_Read")),
  ], { cols: 3, y: 46, h: 100 });
  const b = grid([
    ["g-temp", "gauge", { bindings: { value: op("HMI_SIM_Temp") }, props: { label: "HMI_SIM_Temp", unit: "°C", min: 0, max: 150 } }],
    ["g-volt", "gauge", { bindings: { value: op("HMI_SIM_Volt") }, props: { label: "HMI_SIM_Volt", unit: "V", min: 0, max: 10 } }],
    num("r-f", "rRTD_Fahrenheit", op("rRTD_Fahrenheit"), "°F"),
    num("r-sc", "rVoltage_0_100_Scaled", op("rVoltage_0_100_Scaled"), "%"),
  ], { cols: 4, y: a.next, h: 190 });
  page("plc", "PLC", "dial", [
    title("pl-t", "What the PLC reports", 0),
    ...a.widgets, ...b.widgets,
    at("pl-ds", "driverStatus", 0, b.next, 520, 80, { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "Connections" } }),
    at("pl-trend", "trend", 0, b.next + 96, W, 280, { bindings: { value: op("HMI_SIM_Temp") }, props: { label: "Temperature, voltage and the OPC UA read-in", duration: 300, tags: [
      { binding: op("HMI_SIM_Temp"), label: "HMI_SIM_Temp (°C)", color: "#dc2626" }, { binding: op("HMI_SIM_Volt"), label: "HMI_SIM_Volt (V)", color: "#2563eb" }, { binding: IN, label: "iOPC_Read", color: "#16a34a" },
    ] } }),
  ]);
}

// 2. Write: the test variables, over both protocols; the value shown is read back from the PLC.
{
  const mk = (id, label, tag, type, extra = {}) => [id, type, { bindings: { value: tag }, props: { label, ...extra } }];
  const w = grid([
    mk("w-oi", "OPC UA: iOPC_Write (whole number)", OUT, "numericInput", { min: 0, max: 100000 }),
    mk("w-or", "OPC UA: rOPC_Write (decimal)", op("rOPC_Write"), "setpoint", { min: 0, max: 1000, step: 0.5 }),
    mk("w-os", "OPC UA: sOPC_Write (text)", op("sOPC_Write"), "textInput"),
    mk("w-ri", "REST: iREST_Write (whole number)", rs("iREST_Write"), "numericInput", { min: 0, max: 100000 }),
    mk("w-rr", "REST: rREST_Write (decimal)", rs("rREST_Write"), "setpoint", { min: 0, max: 1000, step: 0.5 }),
    mk("w-rs", "REST: sREST_Write (text)", rs("sREST_Write"), "textInput"),
  ], { cols: 3, y: 84, h: 124 });
  const btns = grid([
    ["wb-add", "button", { bindings: { value: OUT }, props: { label: "Add 100 to iOPC_Write", btnColor: "green" }, events: { onClick: [{ type: "increment", step: 100 }] } }],
    ["wb-sub", "button", { bindings: { value: OUT }, props: { label: "Subtract 100", btnColor: "amber" }, events: { onClick: [{ type: "increment", step: -100 }] } }],
    ["wb-zero", "button", { bindings: { value: OUT }, props: { label: "Set to 0", btnColor: "zinc", btnVariant: "outlined" }, events: { onClick: [{ type: "write", value: 0 }] } }],
  ], { cols: 3, y: w.next, h: 60 });
  page("write", "Write", "tools", [
    title("wr-t", "Writing to the PLC", 0),
    note("wr-n", "Each box writes the PLC's variable and shows what the PLC holds afterwards (read back). A write the PLC does not confirm is reported.", 36, 40),
    ...w.widgets, ...btns.widgets,
    at("wr-log", "historyLog", 0, btns.next, W, 220, { bindings: { value: OUT }, props: { label: "Write history for iOPC_Write", pageSize: 6 } }),
  ]);
}

// 3. Script: the rule, its settings and what it is doing.
{
  const s = grid([
    ["s-enable", "button", { bindings: { value: "mem:RuleEnable" }, props: { label: "Rule on / off", btnColor: "green" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
    ["s-led", "led", { bindings: { value: "mem:RuleEnable" }, props: { label: "Rule", trueLabel: "ON: it may write to the PLC", falseLabel: "OFF: nothing is written" } }],
    txt("s-state", "What the rule is doing", "mem:RuleState"),
  ], { cols: 3, y: 100, h: 90 });
  const set = grid([
    ["s-limit", "numericInput", { bindings: { value: "mem:Threshold" }, props: { label: "Limit (the input must be above this)", min: 0, max: 10000 } }],
    ["s-wait", "numericInput", { bindings: { value: "mem:WaitSeconds" }, props: { label: "Wait (seconds)", min: 1, max: 600 } }],
    ["s-step", "numericInput", { bindings: { value: "mem:Step" }, props: { label: "Increment by", min: 1, max: 10000 } }],
  ], { cols: 3, y: s.next, h: 100 });
  const live = grid([
    num("s-in", "Input: iOPC_Read", IN), num("s-cd", "Seconds until it acts", "mem:Countdown", "s"),
    num("s-out", "Output: iOPC_Write", OUT), num("s-fired", "Times it has acted", "mem:Fired"),
  ], { cols: 4, y: set.next, h: 150 });
  const mirror = grid([
    ["s-menable", "button", { bindings: { value: "mem:MirrorEnable" }, props: { label: "Mirror to REST on / off", btnColor: "purple" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
    num("s-mirrored", "Values mirrored to iREST_Write", "mem:Mirrored"),
    num("s-rest", "iREST_Write (what REST holds)", rs("iREST_Write")),
  ], { cols: 3, y: live.next + 112, h: 90 });
  page("script", "Script", "bolt", [
    title("sc-t", "A script acting on what the PLC reports", 0),
    note("sc-n", "When iOPC_Read stays above the limit for the wait time, the script adds the step to iOPC_Write, once. It acts again only after the input has dropped to the limit or below and risen again. It starts OFF.", 36, 56),
    ...s.widgets, ...set.widgets, ...live.widgets,
    at("sc-last", "textDisplay", 0, live.next, W, 56, { bindings: { value: "mem:LastFired" }, props: { label: "Last time it acted" } }),
    note("sc-mn", "A second script: when switched on, each new iOPC_Read value over OPC UA is written to iREST_Write over REST.", live.next + 72, 32),
    ...mirror.widgets,
  ]);
}

// 4. Alarms: rules on the PLC's values.
page("alarms", "Alarms", "alarm", [
  title("al-t", "Alarms from the PLC's values", 0),
  note("al-n", "Raised from the live values (and cleared when they drop); a PLC that goes offline keeps the alarm's state and says why.", 36, 36),
  at("al-b", "alarmBanner", 0, 84, W, 380, { props: { label: "Active alarms", maxRows: 12, showAcked: true } }),
  at("al-h", "historyLog", 0, 480, W, 220, { bindings: { value: "mem:Fired" }, props: { label: "Each time the script acted", pageSize: 6 } }),
]);

// The Simulator page, rehearsal only: sliders that play the PLC's inputs.
if (rehearse) {
  page("sim", "Simulator", "flask", [
    title("sm-t", "Rehearsal: you are the PLC", 0),
    note("sm-n", "These sliders write the values the PLC would report, so the demo and its scripts can be tried with no PLC connected.", 36, 40),
    at("sm-i", "setpoint", 0, 90, 520, 120, { bindings: { value: IN }, props: { label: "iOPC_Read (the input the rule watches)", min: 0, max: 300, step: 10 } }),
    at("sm-t2", "setpoint", 536, 90, 512, 120, { bindings: { value: op("HMI_SIM_Temp") }, props: { label: "HMI_SIM_Temp", unit: "°C", min: 0, max: 150, step: 1 } }),
    at("sm-v", "setpoint", 0, 226, 520, 120, { bindings: { value: op("HMI_SIM_Volt") }, props: { label: "HMI_SIM_Volt", unit: "V", min: 0, max: 10, step: 0.1 } }),
    at("sm-r", "setpoint", 536, 226, 512, 120, { bindings: { value: op("rOPC_Read") }, props: { label: "rOPC_Read", min: 0, max: 100, step: 1 } }),
  ]);
}

const project = {
  schemaVersion: 6,
  version: "1.0.0",
  name: rehearse ? "PLC Demo (rehearsal)" : "PLC Demo",
  theme: { preset: "clean" },
  shell: { nav: "sidebar" },
  canvasSnap: "pixel",
  canvasResolution: { type: "dynamic" },
  datasources,
  alarmRules: [
    { id: "a-input", name: "Input above the limit", expr: `{${IN}} > {mem:Threshold}`, severity: "warning", message: "iOPC_Read is above the limit" },
    { id: "a-temp", name: "High temperature", expr: `{${op("HMI_SIM_Temp")}} > 100`, severity: "warning", message: "HMI_SIM_Temp above 100" },
    { id: "a-acted", name: "The script acted", expr: "{mem:Fired} > 0", severity: "info", message: "The increment script has written to iOPC_Write" },
  ],
  scripts,
  pages,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");
console.log(`wrote ${out}: ${pages.length} pages, ${pages.reduce((n, p) => n + p.widgets.length, 0)} widgets, ${scripts.length} scripts${rehearse ? " (rehearsal: no PLC)" : `, PLC ${plc}`}`);
