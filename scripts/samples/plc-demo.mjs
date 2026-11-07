// Builds samples/plc-demo.screens.json: a round trip through a real PLC over OPC UA and REST, and runtime scripts
// that act on what the PLC reports.
//
//   node scripts/samples/plc-demo.mjs [--plc=10.0.0.210] [--opcua-fingerprint=..] [--rest-fingerprint=..]
//                                     [--rehearse] [--out=file]
//
// The lab AXC F 3152 runs a small program that copies each "Read" variable into its "Write" twin on every scan:
//     iOPC_Write := iOPC_Read;   rOPC_Write := rOPC_Read;   sOPC_Write := sOPC_Read;
//     iREST_Write := iREST_Read; rREST_Write := rREST_Read; sREST_Write := sREST_Read;
// "Read" and "Write" are named from the PLC's side: it reads the first in and writes the second out. So the HMI
// WRITES the *_Read variables (the PLC's inputs) and READS the *_Write variables (its outputs) to see the PLC
// answer: a round trip HMI to PLC to HMI, over each protocol. A value written straight to a *_Write variable is
// overwritten on the next scan, so this demo never does that.
//
// The PLC connections have no credentials (OPC UA anonymous, REST without login) and pin the controller's
// certificates: without --opcua-fingerprint and --rest-fingerprint the pin is empty and a datasource will not
// connect until the IDE's Test button shows the fingerprint to pin.
//
// Two runtime scripts, both off until switched on (the Script page), each writing only the one PLC variable it names:
//   increment-rule  when the PLC's iOPC_Write stays above a limit for a wait time, add a step to the input
//                   iOPC_Read, once; the PLC copies it to iOPC_Write.
//   carry           when iOPC_Write changes, write it to iREST_Read: an OPC UA output carried into a REST input,
//                   which the PLC copies to iREST_Write.
//
// The Logic page has xActivate, xAnomaly, rSine_Out, SIM_Temp and SIM_Volt. The PLC exposes those over REST (its HMI
// attribute) and not over OPC UA, which lists a different set (the *_Read/_Write pairs and HMI_SIM_Temp/Volt), so the
// page reads and writes them through the REST datasource. rCelsius and PN_BK are exposed by neither.
//
// --rehearse swaps the two PLC datasources for memory datasources with the same names and tag paths, and adds a
// script that plays the PLC's program (copy Read to Write, a sine while xActivate is set), so the whole demo runs
// with no PLC.
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
// The rule watches what the PLC reports (iOPC_Write) and nudges what the PLC reads in (iOPC_Read).
const ECHO = op("iOPC_Write"), INPUT = op("iOPC_Read");
const REST_INPUT = rs("iREST_Read");

// ── helpers ──────────────────────────────────────────────────────────────
const at = (id, type, x, y, w, h, rest = {}) => ({ id, type, x, y, w, h, ...rest });
const col = (n, i, span = 1, total = W) => { const cw = (total - (n - 1) * G) / n; return { x: Math.round(i * (cw + G)), w: Math.round(cw * span + (span - 1) * G) }; };
function grid(items, { cols: n, y = 0, h = 110 }) {
  const widgets = items.map(([id, type, rest], i) => { const c = col(n, i % n); return at(id, type, c.x, y + Math.floor(i / n) * (h + G), c.w, h, rest); });
  return { widgets, next: y + Math.ceil(items.length / n) * (h + G) };
}
const title = (id, text, y) => at(id, "textDisplay", 0, y, W, 34, { props: { staticText: text, fontBold: true, fontSize: "xl", bgColor: "transparent", borderColor: "none", noPadding: true } });
const note = (id, text, y, h = 36, x = 0, w = W) => at(id, "textDisplay", x, y, w, h, { props: { staticText: text, fontSize: "sm", textColor: "var(--muted-foreground)", bgColor: "transparent", borderColor: "none", noPadding: true } });
const num = (id, label, tag, unit) => [id, "numericDisplay", { bindings: { value: tag }, props: { label, ...(unit ? { unit } : {}), showQuality: true } }];
const txt = (id, label, tag) => [id, "textDisplay", { bindings: { value: tag }, props: { label } }];
/** Says whether the PLC's reply equals what was sent, from the two tags. */
const matches = (label, sent, reply) => ({
  props: { label, staticText: "…" },
  dynamics: {
    staticText: { expr: `good({${reply}}) ? ({${reply}} == {${sent}} ? 'the PLC echoes it' : 'waiting for the PLC') : 'no reply'` },
    textColor: { expr: `good({${reply}}) && {${reply}} == {${sent}}`, transform: { kind: "map", cases: [{ equals: 1, value: "#16a34a" }], default: "#b45309" } },
  },
});

// ── data ───────────────────────────────────────────────────────────────────
// [name, type, value on the lab PLC]
const opcVars = [
  ["iOPC_Read", "int", 123], ["rOPC_Read", "real", 1.23], ["sOPC_Read", "string", "test"],
  ["iOPC_Write", "int", 123], ["rOPC_Write", "real", 1.23], ["sOPC_Write", "string", "test"],
  ["HMI_SIM_Temp", "real", 75], ["HMI_SIM_Volt", "real", 50], ["rRTD_Fahrenheit", "real", 32], ["rVoltage_0_100_Scaled", "real", 0],
];
const restVars = [
  ["iREST_Read", "int", 123], ["rREST_Read", "real", 1.23], ["sREST_Read", "string", "test"],
  ["iREST_Write", "int", 123], ["rREST_Write", "real", 1.23], ["sREST_Write", "string", "test"],
];
// Exposed by the lab PLC over REST only (rehearsal: memory tags with starting values).
const logicVars = [["xActivate", "bool", false], ["xAnomaly", "bool", false], ["rSine_Out", "real", 0], ["SIM_Temp", "real", 0], ["SIM_Volt", "real", 0]];
const memVars = (vars, prefix) => vars.map(([name, type, initial]) => ({ path: `${prefix}${name}`, type, initial }));

const datasources = rehearse
  ? [
    { id: "opcua", type: "memory", label: "PLC OPC UA (rehearsal)", config: { memoryTags: memVars(opcVars, O) } },
    { id: "rest", type: "memory", label: "PLC REST (rehearsal)", config: { memoryTags: [...memVars(restVars, R), ...memVars(logicVars, R)] } },
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
      { path: "CarryEnable", type: "bool", initial: false },
      { path: "Carried", type: "int", initial: 0 },
    ],
  },
});

// ── scripts ────────────────────────────────────────────────────────────────
// "If the value stays above the limit for the wait time, add the step", once each time it goes above the limit
// (it re-arms when the value drops back). A runtime script cannot sleep (a run is cut off after 100 ms), so it checks
// four times a second and keeps the time the value first went over in `state`. A run that awaits a write lets the next
// trigger start, and a PLC write takes about 300 ms, so the runs would overlap and act twice: a run returns at the top
// while the previous one is still waiting, and counts in `state` before its first await.
const ruleSource = `
if (state.busy) return;
state.busy = true;
try {
  const ECHO = ${JSON.stringify(ECHO)}, INPUT = ${JSON.stringify(INPUT)};
  const set = async (text, left) => {
    if (state.text !== text) { state.text = text; await writeTag('mem:RuleState', text); }
    if (state.left !== left) { state.left = left; await writeTag('mem:Countdown', left); }
  };
  if (!readTag('mem:RuleEnable')) { state.since = undefined; state.done = false; await set('Switched off', 0); return; }
  const value = readTag(ECHO);
  if (quality(ECHO) !== 'Good' || typeof value !== 'number') { state.since = undefined; await set('Waiting for the PLC', 0); return; }
  const limit = readTag('mem:Threshold') ?? 100;
  const wait = (readTag('mem:WaitSeconds') ?? 5) * 1000;
  if (value <= limit) { state.since = undefined; state.done = false; await set('The PLC reports a value at or below the limit', 0); return; }
  state.since ??= Date.now();
  const left = wait - (Date.now() - state.since);
  if (left > 0) { await set('Above the limit, waiting', Math.ceil(left / 1000)); return; }
  if (state.done) { await set('Done: waiting for the value to drop', 0); return; }
  const current = readTag(INPUT);
  const next = (typeof current === 'number' ? current : 0) + (readTag('mem:Step') ?? 100);
  const r = await writeTag(INPUT, next);
  if (r.status !== 'confirmed') { log('increment not confirmed:', r.status, r.reason ?? ''); await set('Write failed: ' + (r.reason ?? r.status), 0); return; }
  state.done = true;
  state.fired = (state.fired ?? 0) + 1;
  await writeTag('mem:Fired', state.fired);
  await writeTag('mem:LastFired', new Date().toLocaleTimeString() + ': ' + INPUT.split('/').pop() + ' = ' + next);
  emit('plc.increment', { value, limit, wrote: next, n: state.fired });
  log('the PLC reported', value, 'above', limit, 'for', wait / 1000, 's: wrote', next, 'to its input');
  await set('Done: waiting for the value to drop', 0);
} finally {
  state.busy = false;
}
`;
// When switched on, each new value the PLC reports on OPC UA is written to the REST input: an OPC UA output carried
// into a REST input, which the PLC copies to iREST_Write.
const carrySource = `
const ECHO = ${JSON.stringify(ECHO)}, TARGET = ${JSON.stringify(REST_INPUT)};
if (!readTag('mem:CarryEnable') || event.quality !== 'Good' || typeof event.value !== 'number') return;
if (event.value === state.last) return;
state.last = event.value;
const r = await writeTag(TARGET, Math.round(event.value));
if (r.status !== 'confirmed') { log('carry not confirmed:', r.status, r.reason ?? ''); return; }
state.count = (state.count ?? 0) + 1; // counted before the await, so runs that overlap cannot repeat a number
await writeTag('mem:Carried', state.count);
`;
const scripts = [
  { id: "increment-rule", name: "Add to the PLC's input while its reply stays high", trigger: { every: 250 }, writes: [INPUT, "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired"], source: ruleSource.trim() },
  { id: "carry", name: "Carry the OPC UA reply into the REST input", trigger: { onChange: [ECHO] }, writes: [REST_INPUT, "mem:Carried"], source: carrySource.trim() },
];
if (rehearse) {
  // Plays the PLC's program, so the demo runs with no PLC: each Read copied to its Write twin, and a sine while xActivate is set.
  const pairs = [["opcua", O, "iOPC"], ["opcua", O, "rOPC"], ["opcua", O, "sOPC"], ["rest", R, "iREST"], ["rest", R, "rREST"], ["rest", R, "sREST"]]
    .map(([ds, p, n]) => [`${ds}:${p}${n}_Read`, `${ds}:${p}${n}_Write`]);
  scripts.push({
    id: "plc-program", name: "Rehearsal: plays the PLC's program", trigger: { every: 100 },
    writes: [...pairs.map((p) => p[1]), rs("rSine_Out")],
    source: `
if (state.busy) return;
state.busy = true;
try {
  for (const [from, to] of ${JSON.stringify(pairs)}) {
    const v = readTag(from);
    if (v !== null && v !== readTag(to)) await writeTag(to, v);
  }
  if (readTag(${JSON.stringify(rs("xActivate"))})) {
    state.t = (state.t ?? 0) + 0.1;
    await writeTag(${JSON.stringify(rs("rSine_Out"))}, Math.round(Math.sin(state.t) * 100));
  }
} finally { state.busy = false; }
`.trim(),
  });
}

// ── pages ──────────────────────────────────────────────────────────────────
const pages = [];
const page = (id, name, icon, widgets) => pages.push({ id: `p-${id}`, name, icon, widgets });

// 1. PLC: what you send in, what the PLC answers, over both protocols.
{
  const sent = grid([
    num("s-oi", "OPC UA in: iOPC_Read", op("iOPC_Read")), num("s-or", "OPC UA in: rOPC_Read", op("rOPC_Read")), txt("s-os", "OPC UA in: sOPC_Read", op("sOPC_Read")),
    num("s-ri", "REST in: iREST_Read", rs("iREST_Read")), num("s-rr", "REST in: rREST_Read", rs("rREST_Read")), txt("s-rs", "REST in: sREST_Read", rs("sREST_Read")),
  ], { cols: 3, y: 84, h: 92 });
  const reply = grid([
    num("p-oi", "OPC UA out: iOPC_Write", op("iOPC_Write")), num("p-or", "OPC UA out: rOPC_Write", op("rOPC_Write")), txt("p-os", "OPC UA out: sOPC_Write", op("sOPC_Write")),
    num("p-ri", "REST out: iREST_Write", rs("iREST_Write")), num("p-rr", "REST out: rREST_Write", rs("rREST_Write")), txt("p-rs", "REST out: sREST_Write", rs("sREST_Write")),
  ], { cols: 3, y: sent.next + 40, h: 92 });
  page("plc", "PLC", "dial", [
    title("pl-t", "A round trip through the PLC", 0),
    note("pl-n", "The PLC reads each \"Read\" variable in and writes it back out to its \"Write\" twin on every scan. You send to the first; the PLC answers on the second.", 36, 40),
    ...sent.widgets,
    note("pl-n2", "The PLC's reply:", sent.next + 8, 26),
    ...reply.widgets,
    at("pl-trend", "trend", 0, reply.next, W, 260, { bindings: { value: op("iOPC_Read") }, props: { label: "Sent (iOPC_Read) and the PLC's reply (iOPC_Write)", duration: 300, tags: [
      { binding: op("iOPC_Read"), label: "iOPC_Read (sent)", color: "#2563eb" }, { binding: op("iOPC_Write"), label: "iOPC_Write (reply)", color: "#16a34a" },
    ] } }),
    at("pl-ds", "driverStatus", 0, reply.next + 276, 520, 80, { props: { bgColor: "var(--card)", borderColor: "var(--border)", label: "Connections" } }),
  ]);
}

// 2. Send: write the PLC's inputs; the reply is shown beside each.
{
  const kinds = {
    i: { type: "numericInput", echo: "numericDisplay", props: { min: 0, max: 100000 } },
    r: { type: "setpoint", echo: "numericDisplay", props: { min: 0, max: 1000, step: 0.5 } },
    s: { type: "textInput", echo: "textDisplay", props: {} },
  };
  const row = (n, input, reply, sentTag, replyTag, i, kind) => {
    const y = 84 + i * 134, cw = col(3, 0).w;
    return [
      at(`w-${n}`, kind.type, 0, y, cw, 124, { bindings: { value: sentTag }, props: { label: `You send: ${input}`, ...kind.props } }),
      at(`e-${n}`, kind.echo, col(3, 1).x, y, cw, 124, { bindings: { value: replyTag }, props: { label: `The PLC answers: ${reply}`, ...(kind.echo === "numericDisplay" ? { showQuality: true } : {}) } }),
      at(`m-${n}`, "textDisplay", col(3, 2).x, y, cw, 124, matches("Round trip", sentTag, replyTag)),
    ];
  };
  const rows = [
    row("oi", "iOPC_Read", "iOPC_Write", op("iOPC_Read"), op("iOPC_Write"), 0, kinds.i),
    row("or", "rOPC_Read", "rOPC_Write", op("rOPC_Read"), op("rOPC_Write"), 1, kinds.r),
    row("os", "sOPC_Read", "sOPC_Write", op("sOPC_Read"), op("sOPC_Write"), 2, kinds.s),
    row("ri", "iREST_Read", "iREST_Write", rs("iREST_Read"), rs("iREST_Write"), 3, kinds.i),
    row("rr", "rREST_Read", "rREST_Write", rs("rREST_Read"), rs("rREST_Write"), 4, kinds.r),
    row("rs", "sREST_Read", "sREST_Write", rs("sREST_Read"), rs("sREST_Write"), 5, kinds.s),
  ].flat();
  const by = 84 + 6 * 134;
  const btns = grid([
    ["wb-add", "button", { bindings: { value: op("iOPC_Read") }, props: { label: "Add 100 to iOPC_Read", btnColor: "green" }, events: { onClick: [{ type: "increment", step: 100 }] } }],
    ["wb-sub", "button", { bindings: { value: op("iOPC_Read") }, props: { label: "Subtract 100", btnColor: "amber" }, events: { onClick: [{ type: "increment", step: -100 }] } }],
    ["wb-reset", "button", { bindings: { value: op("iOPC_Read") }, props: { label: "Back to 123", btnColor: "zinc", btnVariant: "outlined" }, events: { onClick: [{ type: "write", value: 123 }] } }],
  ], { cols: 3, y: by, h: 60 });
  page("send", "Send", "tools", [
    title("sn-t", "Send to the PLC, read its answer", 0),
    note("sn-n", "Each left box writes one of the PLC's inputs. The PLC copies it to its output within a scan, and the middle box shows what the PLC now holds. A write the PLC does not confirm is reported.", 36, 44),
    ...rows, ...btns.widgets,
    at("sn-log", "historyLog", 0, btns.next, W, 200, { bindings: { value: op("iOPC_Read") }, props: { label: "Write history for iOPC_Read", pageSize: 5 } }),
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
    ["s-limit", "numericInput", { bindings: { value: "mem:Threshold" }, props: { label: "Limit (the PLC's reply must be above this)", min: 0, max: 100000 } }],
    ["s-wait", "numericInput", { bindings: { value: "mem:WaitSeconds" }, props: { label: "Wait (seconds)", min: 1, max: 600 } }],
    ["s-step", "numericInput", { bindings: { value: "mem:Step" }, props: { label: "Add to the input", min: 1, max: 10000 } }],
  ], { cols: 3, y: s.next, h: 100 });
  const live = grid([
    num("s-echo", "The PLC's reply: iOPC_Write", op("iOPC_Write")), num("s-cd", "Seconds until it acts", "mem:Countdown", "s"),
    num("s-in", "The PLC's input: iOPC_Read", op("iOPC_Read")), num("s-fired", "Times it has acted", "mem:Fired"),
  ], { cols: 4, y: set.next, h: 150 });
  const carry = grid([
    ["s-cenable", "button", { bindings: { value: "mem:CarryEnable" }, props: { label: "Carry to REST on / off", btnColor: "purple" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }],
    num("s-carried", "Values carried to iREST_Read", "mem:Carried"),
    num("s-rest", "REST's reply: iREST_Write", rs("iREST_Write")),
  ], { cols: 3, y: live.next + 112, h: 90 });
  page("script", "Script", "bolt", [
    title("sc-t", "Scripts acting on what the PLC reports", 0),
    note("sc-n", "When the PLC's reply iOPC_Write stays above the limit for the wait time, the script adds the step to the PLC's input iOPC_Read, once; the PLC echoes it. It acts again only after the reply has dropped to the limit or below. It starts OFF.", 36, 56),
    ...s.widgets, ...set.widgets, ...live.widgets,
    at("sc-last", "textDisplay", 0, live.next, W, 56, { bindings: { value: "mem:LastFired" }, props: { label: "Last time it acted" } }),
    note("sc-mn", "A second script: when switched on, each new iOPC_Write over OPC UA is written to iREST_Read over REST, and the PLC copies it to iREST_Write.", live.next + 72, 32),
    ...carry.widgets,
  ]);
}

// 4. Logic: xActivate, xAnomaly and the sine the PLC makes, over REST.
{
  const X = rs("xActivate"), A = rs("xAnomaly"), S = rs("rSine_Out");
  page("logic", "Logic", "motor", [
    title("lg-t", "The PLC's logic: xActivate, xAnomaly, rSine_Out", 0),
    note("lg-n", "The PLC exposes these over REST (its HMI attribute), so they are read and written through the REST datasource; OPC UA lists a different set. What xActivate and xAnomaly do depends on the PLC's program.", 36, 56),
    at("lg-act", "button", 0, 106, col(3, 0).w, 72, { bindings: { value: X }, props: { label: "xActivate on / off", btnColor: "green" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }),
    at("lg-actled", "led", col(3, 1).x, 106, col(3, 1).w, 72, { bindings: { value: X }, props: { label: "xActivate", trueLabel: "TRUE", falseLabel: "FALSE" } }),
    at("lg-sine", "numericDisplay", col(3, 2).x, 106, col(3, 2).w, 90, { bindings: { value: S }, props: { label: "rSine_Out", showQuality: true } }),
    at("lg-ano", "button", 0, 194, col(3, 0).w, 72, { bindings: { value: A }, props: { label: "xAnomaly on / off", btnColor: "red" }, events: { onClick: [{ type: "toggle", on: true, off: false }] } }),
    at("lg-anoled", "led", col(3, 1).x, 194, col(3, 1).w, 72, { bindings: { value: A }, props: { label: "xAnomaly", trueLabel: "TRUE", falseLabel: "FALSE", trueColor: "#dc2626" } }),
    at("lg-gauge", "gauge", col(3, 2).x, 212, col(3, 2).w, 180, { bindings: { value: S }, props: { label: "rSine_Out", min: 0, max: 100 } }),
    at("lg-st", "numericDisplay", 0, 282, col(3, 0).w, 100, { bindings: { value: rs("SIM_Temp") }, props: { label: "SIM_Temp", showQuality: true } }),
    at("lg-sv", "numericDisplay", col(3, 1).x, 282, col(3, 1).w, 100, { bindings: { value: rs("SIM_Volt") }, props: { label: "SIM_Volt", showQuality: true } }),
    at("lg-trend", "trend", 0, 408, W, 280, { bindings: { value: S }, props: { label: "rSine_Out, SIM_Temp and SIM_Volt", duration: 60, tags: [
      { binding: S, label: "rSine_Out", color: "#2563eb" }, { binding: rs("SIM_Temp"), label: "SIM_Temp", color: "#dc2626" }, { binding: rs("SIM_Volt"), label: "SIM_Volt", color: "#16a34a" },
    ] } }),
  ]);
}

// 5. Alarms: rules on the PLC's values.
page("alarms", "Alarms", "alarm", [
  title("al-t", "Alarms from the PLC's values", 0),
  note("al-n", "Raised from the live values (and cleared when they drop); a PLC that goes offline keeps the alarm's state and says why.", 36, 36),
  at("al-b", "alarmBanner", 0, 84, W, 380, { props: { label: "Active alarms", maxRows: 12, showAcked: true } }),
  at("al-h", "historyLog", 0, 480, W, 220, { bindings: { value: "mem:Fired" }, props: { label: "Each time the script acted", pageSize: 6 } }),
]);

const project = {
  schemaVersion: 6,
  version: "1.1.0",
  name: rehearse ? "PLC Demo (rehearsal)" : "PLC Demo",
  theme: { preset: "clean" },
  shell: { nav: "sidebar" },
  canvasSnap: "pixel",
  canvasResolution: { type: "dynamic" },
  datasources,
  alarmRules: [
    { id: "a-input", name: "The PLC's reply is above the limit", expr: `{${ECHO}} > {mem:Threshold}`, severity: "warning", message: "iOPC_Write is above the limit" },
    { id: "a-temp", name: "High temperature", expr: `{${op("HMI_SIM_Temp")}} > 100`, severity: "warning", message: "HMI_SIM_Temp above 100" },
    { id: "a-acted", name: "The script acted", expr: "{mem:Fired} > 0", severity: "info", message: "The increment script has written to the PLC's input" },
  ],
  scripts,
  pages,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");
console.log(`wrote ${out}: ${pages.length} pages, ${pages.reduce((n, p) => n + p.widgets.length, 0)} widgets, ${scripts.length} scripts${rehearse ? " (rehearsal: no PLC)" : `, PLC ${plc}`}`);
