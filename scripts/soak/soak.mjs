// Phase 1 soak test: runs against a runtime that talks to a real PLC and
// checks the gate in CLAUDE.md: no frozen values, and every write either
// confirmed or failed with a reason.
//
// Usage (scripts/soak/run-soak.ps1 starts the runtime and calls this):
//   node scripts/soak/soak.mjs --runtime=http://127.0.0.1:3095 --plc=10.0.0.210
//        --hours=24 --out=<dir> [--pid=<runtime pid>] [--write-every=60]
//        --opcua-fingerprint=<hex> --rest-fingerprint=<hex>
//
// It deploys a soak project (no credentials: OPC UA anonymous, REST without
// login). OPC UA uses SignAndEncrypt / Basic256Sha256, and both datasources
// pin the controller's certificates (certCheck pinned). Without both
// fingerprints it connects once, prints the ones the controller presents
// and stops without writing. It subscribes to every tag over /ws/tags and
// to /ws/alarms, writes
// the PLC test variables (iOPC_/rOPC_/sOPC_Write, iREST_/rREST_/sREST_Write)
// on a timer and restores their starting values at the end. When a
// datasource's tags go Bad (an outage), it writes one of that datasource's
// test variables at once: the write must fail with a reason within
// OUTAGE_WRITE_MS, not hang or report success. It writes
// events.jsonl (every finding as it happens) and summary.json (every 10 min
// and at the end) to --out, and exits 0 when the gate passed.
//
// The soak project also runs four runtime scripts (Phase 4), which only touch
// memory tags and so keep running through a PLC outage:
//   ticker        every second, writes a counter to mem:ticks
//   follower      when the OPC UA temperature changes, writes mem:derived
//   alarm-counter when the soak alarm is raised or cleared, writes mem:alarms
//   canary        every minute, tries three huge allocations and must be refused
//                 with a RangeError each time (the memory guards, for the whole run)
// A script that writes a result other than "confirmed" throws, which the
// engine keeps as its lastError. Every 10 s the soak reads GET /api/v1/scripts;
// the gate scriptsHealthy needs every script running with no error, no
// interrupt and no dropped run, and the ticker's runs and mem:ticks close to
// the seconds that passed. Page scripts need a browser and are not covered.
//
// --scripts-only skips the PLC (no pins, no test writes, no restore) and only
// watches the scripts; the PLC datasources stay offline.
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.join("=")];
}));
const base = args.runtime ?? "http://127.0.0.1:3095";
const plc = args.plc ?? "10.0.0.210";
const hours = Number(args.hours ?? 24);
const out = args.out ?? `soak-${Date.now()}`;
const pid = args.pid ? Number(args.pid) : null;
const writeEvery = Number(args["write-every"] ?? 60) * 1000;
const pins = { opcua: args["opcua-fingerprint"] ?? "", rest: args["rest-fingerprint"] ?? "" };
const scriptsOnly = "scripts-only" in args;
// Scripts only: the PLC datasources get a pin that matches nothing, so they are refused and stay offline.
const NO_MATCH = Array(32).fill("00").join(":");
const pin = (id) => pins[id] || (scriptsOnly ? NO_MATCH : "");
const GAP_MS = 15_000; // a polled tag reports every 0.5–1 s; 15 s of silence while online is a freeze
const OUTAGE_WRITE_MS = 1000; // an offline driver refuses writes at once (defect 5)
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const log = (kind, data) => {
  const line = JSON.stringify({ t: now(), kind, ...data });
  appendFileSync(join(out, "events.jsonl"), line + "\n");
  if (kind !== "write_ok") console.log(line);
};

// ── soak project ────────────────────────────────────────────────────────────
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const reads = [
  `opcua:${O}iOPC_Read`, `opcua:${O}rOPC_Read`, `opcua:${O}sOPC_Read`,
  `opcua:${O}HMI_SIM_Temp`, `opcua:${O}HMI_SIM_Volt`, `opcua:${O}rRTD_Fahrenheit`, `opcua:${O}rVoltage_0_100_Scaled`,
  `rest:${R}iREST_Read`, `rest:${R}rREST_Read`, `rest:${R}sREST_Read`,
];
// The variables Dan approved for test writes, with how to make the n-th
// value. spread() jumps around 0..999, so the alarm rule below (> 500) is
// raised and cleared about every other round.
const spread = (n) => (n * 137) % 1000;
const writes = [
  { binding: `opcua:${O}iOPC_Write`, value: (n) => spread(n) },
  { binding: `opcua:${O}rOPC_Write`, value: (n) => spread(n) + 0.5 },
  { binding: `opcua:${O}sOPC_Write`, value: (n) => `soak ${n}` },
  { binding: `rest:${R}iREST_Write`, value: (n) => spread(n) },
  { binding: `rest:${R}rREST_Write`, value: (n) => spread(n) + 0.5 },
  { binding: `rest:${R}sREST_Write`, value: (n) => `soak ${n}` },
];
const allTags = [...reads, ...writes.map((w) => w.binding)];
const widget = (id, type, binding, y, props) => ({ id, type, x: 0, y, w: 2, h: 1, bindings: { value: binding }, ...(props ? { props } : {}) });

// What the scripts write: memory tags, each with a widget that may write it
// (a tag is writable only when a writable widget is bound to it).
const memWrites = [
  { binding: "mem:ticks", props: { min: 0, max: 1e12 } },
  { binding: "mem:derived", props: { min: -1e9, max: 1e9 } },
  { binding: "mem:alarms", props: { min: 0, max: 1e12 } },
];
const TEMP = `opcua:${O}HMI_SIM_Temp`;
const scripts = [
  { id: "ticker", name: "Ticker", trigger: { onStart: true, every: 1000 }, source: `
    state.n = (state.n ?? 0) + 1;
    const r = await writeTag('mem:ticks', state.n);
    if (r.status !== 'confirmed') throw new Error('mem:ticks write ' + r.status + ' ' + (r.reason ?? ''));` },
  { id: "follower", name: "Follower", trigger: { onChange: [TEMP] }, source: `
    state.runs = (state.runs ?? 0) + 1;
    if (event.quality === 'Good' && typeof event.value === 'number' && event.value !== state.last) {
      state.last = event.value;
      const r = await writeTag('mem:derived', Math.round(event.value * 200) / 100);
      if (r.status !== 'confirmed') throw new Error('mem:derived write ' + r.status + ' ' + (r.reason ?? ''));
    }` },
  { id: "alarm-counter", name: "Alarm counter", trigger: { onAlarm: ["soak-high"] }, source: `
    state.n = (state.n ?? 0) + 1;
    const r = await writeTag('mem:alarms', state.n);
    if (r.status !== 'confirmed') throw new Error('mem:alarms write ' + r.status + ' ' + (r.reason ?? ''));
    emit('soak.alarm', { active: event.active, n: state.n });` },
  { id: "canary", name: "Memory guard canary", trigger: { every: 60000 }, source: `
    const huge = [() => 'x'.repeat(2 ** 28), () => new Array(5e7).fill(0), () => new Uint8Array(2 ** 30)];
    for (const f of huge) {
      try { f(); } catch (e) { if (e instanceof RangeError) continue; throw e; }
      throw new Error('a huge allocation was not refused');
    }
    state.runs = (state.runs ?? 0) + 1;` },
];
const project = {
  schemaVersion: 4,
  version: "0.1.0",
  name: "Soak",
  datasources: [
    { id: "opcua", label: "PLC OPC UA", type: "opcua", config: {
      endpoint: `opc.tcp://${plc}:4840`, securityMode: "SignAndEncrypt", securityPolicy: "Basic256Sha256",
      certCheck: "pinned", certFingerprint: pin("opcua"),
    } },
    { id: "rest", label: "PLC REST", type: "rest", config: {
      endpoint: `https://${plc}`, basePath: "/_pxc_api/v1.14", certCheck: "pinned", certFingerprint: pin("rest"),
    } },
    { id: "mem", label: "Script results", type: "memory", config: {
      memoryTags: [{ path: "ticks", type: "int", initial: 0 }, { path: "derived", type: "real", initial: 0 }, { path: "alarms", type: "int", initial: 0 }],
    } },
  ],
  pages: [{
    id: "soak", name: "Soak", widgets: [
      ...reads.map((b, i) => widget(`r${i}`, "numericDisplay", b, i)),
      ...writes.map((w, i) => widget(`w${i}`, w.binding.includes("/s") ? "textInput" : "numericInput", w.binding, 20 + i,
        w.binding.includes("/s") ? undefined : { min: 0, max: 1000 })),
      ...memWrites.map((m, i) => widget(`m${i}`, "numericInput", m.binding, 30 + i, m.props)),
    ],
  }],
  // Exercises alarms and alarm history: raised while the int write is above 500.
  alarmRules: [{ id: "soak-high", name: "Soak counter high", expr: `{opcua:${O}iOPC_Write} > 500`, severity: "info", message: "soak counter above 500" }],
  scripts,
};

// ── state ───────────────────────────────────────────────────────────────────
const tags = Object.fromEntries(allTags.map((p) => [p, { updates: 0, last: 0, quality: "", reason: "", gaps: 0, qualityChanges: 0 }]));
const ds = {};
const stats = {
  started: now(), plc, hours,
  security: { opcua: "SignAndEncrypt / Basic256Sha256, pinned", rest: "pinned", pins },
  writes: { sent: 0, confirmed: 0, failedWithReason: 0, notConfirmed: 0, other: 0, maxMs: 0, totalMs: 0 },
  // One write per datasource outage. failedAtOnce is the expected result;
  // confirmed means the datasource was back before the write arrived.
  outageWrites: { sent: 0, failedAtOnce: 0, failedSlow: 0, confirmed: 0, other: 0, maxMs: 0 },
  gaps: 0, datasourceDrops: 0, wsReconnects: { tags: 0, alarms: 0 }, alarmMessages: 0, alarmResyncs: 0,
  memoryKB: { first: null, min: null, max: null, last: null },
  historyBytes: { first: null, last: null },
  historyRows: { first: null, last: null }, // the store keeps changes only (defect 7)
  // The runtime scripts: problems counts the times one went into trouble (stopped,
  // an error, an interrupt or a dropped run); ticks is mem:ticks as the ticker wrote it.
  scripts: { problems: 0, ticks: { first: null, last: null }, status: {} },
};

// historyRows counts stored samples; null if node:sqlite is unavailable.
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch {}
function historyRows() {
  if (!sqlite) return null;
  try {
    const db = new sqlite.DatabaseSync(join(out, "history.db"), { readOnly: true });
    try { return db.prepare("SELECT COUNT(*) AS n FROM history").get().n; } finally { db.close(); }
  } catch { return null; }
}

// trend logs memory, history and update counts, to tell a leak from warm-up.
function trend() {
  const rows = historyRows();
  if (rows !== null) { stats.historyRows.first ??= rows; stats.historyRows.last = rows; }
  log("trend", {
    memoryKB: stats.memoryKB.last, historyRows: rows, historyBytes: stats.historyBytes.last,
    tagUpdates: Object.values(tags).reduce((a, t) => a + t.updates, 0), writes: stats.writes.sent,
    scriptRuns: Object.fromEntries(Object.entries(stats.scripts.status).map(([id, st]) => [id, st.runs])),
  });
}

async function api(method, path, body) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch {}
  return { code: r.status, json };
}

function online(binding) {
  return ds[binding.split(":")[0]]?.connected === true;
}

// postWrite writes one tag through the runtime's write pipeline.
async function postWrite(binding, value) {
  const sep = binding.indexOf(":");
  const t0 = Date.now();
  let r;
  try {
    r = await api("POST", `/api/v1/tag/${encodeURIComponent(binding.slice(sep + 1))}`, { datasource: binding.slice(0, sep), value });
  } catch (err) {
    r = { code: 0, json: { status: "failed", reason: `runtime unreachable: ${err}` } };
  }
  return { r, ms: Date.now() - t0 };
}

// ── writes during an outage ─────────────────────────────────────────────────
// inOutage holds the datasources whose tags went Bad and have not come back.
const inOutage = new Set();
async function outageWrite(dsId, cause) {
  const w = writes.find((x) => x.binding.startsWith(dsId + ":"));
  if (!w || stopping) return;
  const value = w.value(n);
  const { r, ms } = await postWrite(w.binding, value);
  const s = stats.outageWrites;
  s.sent++; s.maxMs = Math.max(s.maxMs, ms);
  const status = r.json?.status, reason = r.json?.reason;
  let result;
  if (status === "failed" && reason) result = ms <= OUTAGE_WRITE_MS ? "failedAtOnce" : "failedSlow";
  else if (status === "confirmed") result = "confirmed";
  else result = "other";
  s[result]++;
  log("outage_write", { datasource: dsId, cause, tag: w.binding, value, result, code: r.code, status, reason, ms });
}

// ── WebSockets (reconnect forever) ──────────────────────────────────────────
function watchTags() {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws/tags");
  ws.onopen = () => ws.send(JSON.stringify({ subscribe: allTags }));
  ws.onmessage = (e) => {
    const u = JSON.parse(e.data);
    const t = tags[u.path];
    if (!t) return;
    t.updates++;
    t.last = Date.now();
    if (u.quality !== t.quality || (u.reason ?? "") !== t.reason) {
      if (t.quality) t.qualityChanges++;
      log("quality", { tag: u.path, from: t.quality || "(none)", to: u.quality, reason: u.reason ?? "", value: u.value });
      // The first tag of a datasource to go Bad starts an outage; the first
      // to come back Good ends it (a driver marks all its tags together).
      const dsId = u.path.split(":")[0];
      if (u.quality === "Bad" && t.quality && !inOutage.has(dsId)) {
        inOutage.add(dsId);
        outageWrite(dsId, u.reason ?? "");
      } else if (u.quality === "Good") {
        inOutage.delete(dsId);
      }
      t.quality = u.quality;
      t.reason = u.reason ?? "";
    }
  };
  ws.onclose = () => { stats.wsReconnects.tags++; log("ws_closed", { ws: "tags" }); setTimeout(watchTags, 2000); };
  ws.onerror = () => {};
}

function watchAlarms() {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws/alarms");
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    stats.alarmMessages++;
    if (m.resync) { stats.alarmResyncs++; log("alarm_resync", {}); }
  };
  ws.onclose = () => { stats.wsReconnects.alarms++; log("ws_closed", { ws: "alarms" }); setTimeout(watchAlarms, 2000); };
  ws.onerror = () => {};
}

// ── periodic checks ─────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const { json } = await api("GET", "/api/v1/datasources");
    for (const d of json ?? []) {
      const prev = ds[d.id];
      if (!prev || prev.connected !== d.connected || (prev.lastError ?? "") !== (d.lastError ?? "")) {
        if (prev?.connected && !d.connected) stats.datasourceDrops++;
        log("datasource", { id: d.id, connected: d.connected, lastError: d.lastError ?? "" });
      }
      ds[d.id] = d;
    }
  } catch (err) {
    log("runtime_unreachable", { error: String(err) });
  }
  // A tag that stays silent while its datasource is online is frozen.
  for (const [path, t] of Object.entries(tags)) {
    const silent = Date.now() - t.last;
    if (t.last && online(path) && silent > GAP_MS && !t.inGap) {
      t.inGap = true;
      t.gaps++;
      stats.gaps++;
      log("gap", { tag: path, silentMs: silent });
    } else if (t.inGap && silent < GAP_MS) {
      t.inGap = false;
      log("gap_end", { tag: path });
    }
  }
  await checkScripts();
  if (pid) {
    try {
      const csv = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
      const kb = Number((csv.split('","')[4] ?? "").replace(/[^0-9]/g, ""));
      if (kb) {
        const m = stats.memoryKB;
        m.first ??= kb; m.last = kb;
        m.min = Math.min(m.min ?? kb, kb); m.max = Math.max(m.max ?? kb, kb);
      }
    } catch {}
  }
  try {
    const size = statSync(join(out, "history.db")).size + (() => { try { return statSync(join(out, "history.db-wal")).size; } catch { return 0; } })();
    stats.historyBytes.first ??= size;
    stats.historyBytes.last = size;
  } catch {}
}

// checkScripts reads every script's state and mem:ticks. A script that is not
// running, or has an error, an interrupt or a dropped run, is a problem; it is
// logged and counted once when it first goes wrong.
async function checkScripts() {
  let list;
  try { list = (await api("GET", "/api/v1/scripts")).json; } catch { return; }
  const sc = stats.scripts;
  for (const x of Array.isArray(list) ? list : []) {
    const prev = sc.status[x.id];
    const bad = x.state !== "running" || !!x.lastError || x.interrupts > 0 || x.dropped > 0;
    const changed = !prev || prev.state !== x.state || (prev.lastError ?? "") !== (x.lastError ?? "") || prev.interrupts !== x.interrupts || prev.dropped !== x.dropped;
    if (changed) log("script", { id: x.id, state: x.state, reason: x.reason ?? "", lastError: x.lastError ?? "", interrupts: x.interrupts, dropped: x.dropped, runs: x.runs });
    if (bad && !prev?.bad) sc.problems++;
    sc.status[x.id] = { state: x.state, reason: x.reason ?? "", lastError: x.lastError ?? "", runs: x.runs, interrupts: x.interrupts, dropped: x.dropped, queued: x.queued, bad };
  }
  const t = await api("GET", `/api/v1/tag/${encodeURIComponent("mem:ticks")}`).catch(() => null);
  if (t?.json?.Quality === "Good" && typeof t.json.Value === "number") {
    sc.ticks.first ??= t.json.Value;
    sc.ticks.last = t.json.Value;
  }
}

// scriptsHealthy: every script reported, none in trouble, and the ticker kept
// pace with the clock. null while too little time has passed to judge.
function scriptsHealthy() {
  const elapsed = (Date.now() - scriptsStartedAt) / 1000;
  if (elapsed < 30) return null;
  const sc = stats.scripts;
  const everyoneThere = scripts.every((x) => sc.status[x.id]);
  const ticker = sc.status.ticker;
  const keptPace = !!ticker && ticker.runs >= 0.9 * elapsed - 5 && (sc.ticks.last ?? 0) >= 0.9 * elapsed - 5;
  return everyoneThere && sc.problems === 0 && keptPace;
}

let n = 0;
let stopping = false;
async function writeRound() {
  n++;
  for (const w of writes) {
    const value = w.value(n);
    const { r, ms } = await postWrite(w.binding, value);
    const s = stats.writes;
    s.sent++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms);
    const status = r.json?.status, reason = r.json?.reason;
    if (status === "confirmed") { s.confirmed++; log("write_ok", { tag: w.binding, value, ms }); }
    else if (status === "failed" && reason) { s.failedWithReason++; log("write_failed", { tag: w.binding, value, code: r.code, reason, ms }); }
    else if (status === "not_confirmed") { s.notConfirmed++; log("write_not_confirmed", { tag: w.binding, value, reason, ms }); }
    else { s.other++; log("write_unexpected", { tag: w.binding, value, code: r.code, body: r.json, ms }); }
  }
}

function summary(final) {
  const s = stats.writes, o = stats.outageWrites;
  const gate = {
    noFrozenValues: stats.gaps === 0,
    everyWriteConfirmedOrFailedWithReason: s.other === 0 && s.notConfirmed === 0,
    // null when no outage happened, so this was not tested.
    writesDuringOutageFailAtOnce: o.sent === 0 ? null : o.failedSlow === 0 && o.other === 0,
    scriptsHealthy: scriptsHealthy(),
  };
  if (scriptsOnly) {
    // No PLC: nothing was written and no PLC tag was watched, so these were not tested.
    gate.everyWriteConfirmedOrFailedWithReason = null;
    gate.noFrozenValues = null;
  }
  const doc = {
    ...stats, final, now: now(),
    writes: { ...s, avgMs: s.sent ? Math.round(s.totalMs / s.sent) : 0 },
    tags: Object.fromEntries(Object.entries(tags).map(([p, t]) => [p, { updates: t.updates, quality: t.quality, reason: t.reason, gaps: t.gaps, qualityChanges: t.qualityChanges }])),
    datasources: ds,
    gate, passed: Object.values(gate).every((g) => g !== false),
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(doc, null, 2));
  return doc;
}

// ── run ─────────────────────────────────────────────────────────────────────
for (let i = 0; ; i++) {
  try { if ((await fetch(base + "/api/v1/alive")).ok) break; } catch {}
  if (i > 100) { console.error("runtime not answering"); process.exit(2); }
  await sleep(200);
}
const dep = await api("POST", "/api/v1/project", project);
if (dep.code !== 200) { console.error("deploy failed", dep); process.exit(2); }
const scriptsStartedAt = Date.now();

// Without both pins, show the certificates the controller presents (the
// drivers record them before refusing them) and stop; nothing is written.
if (!scriptsOnly && (!pins.opcua || !pins.rest)) {
  const seen = {};
  for (const deadline = Date.now() + 30_000; Date.now() < deadline && !(seen.opcua && seen.rest); await sleep(1000)) {
    for (const id of ["opcua", "rest"]) {
      const r = await api("GET", `/api/v1/datasources/${id}/status`).catch(() => null);
      if (r?.json?.certFingerprint) seen[id] = r.json.certFingerprint;
    }
  }
  log("fingerprints", { seen });
  console.log(`\nNo writes were made. Check these against the controller, then run again with:\n` +
    `  -OpcuaFingerprint ${seen.opcua ?? "(none seen: is OPC UA reachable?)"}\n` +
    `  -RestFingerprint ${seen.rest ?? "(none seen: is HTTPS reachable?)"}`);
  process.exit(2);
}
log("start", { plc, hours, writeEverySec: writeEvery / 1000, out, security: stats.security });

// Wait until both datasources are online and every test variable reads
// Good: its starting value must be known before anything is written, or it
// could not be restored.
const originals = [];
if (!scriptsOnly) {
for (const deadline = Date.now() + 120_000; ; await sleep(1000)) {
  await checkHealth();
  originals.length = 0;
  for (const w of writes) {
    const r = await api("GET", `/api/v1/tag/${encodeURIComponent(w.binding)}`);
    if (r.json?.Quality === "Good" && r.json.Value !== null && r.json.Value !== undefined) originals.push([w.binding, r.json.Value]);
  }
  if (online("opcua:") && online("rest:") && originals.length === writes.length) break;
  if (Date.now() > deadline) {
    log("abort", { reason: "the PLC test variables did not all read Good within 2 minutes; nothing was written", known: Object.fromEntries(originals), datasources: ds });
    process.exit(2);
  }
}
}
log("originals", { values: Object.fromEntries(originals) });

if (!scriptsOnly) {
  watchTags();
  watchAlarms();
}
const health = setInterval(checkHealth, 10_000);
const summaries = setInterval(() => { trend(); summary(false); }, 10 * 60_000);
const writer = (async () => {
  while (!stopping && !scriptsOnly) {
    await writeRound();
    for (let waited = 0; waited < writeEvery && !stopping; waited += 1000) await sleep(1000);
  }
})();

async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(health);
  clearInterval(summaries);
  await writer;
  // Restore every test variable; retry for a minute if the PLC is away.
  trend();
  for (const [binding, value] of originals) {
    const sep = binding.indexOf(":");
    let status = "";
    for (let attempt = 1; attempt <= 12 && status !== "confirmed"; attempt++) {
      if (attempt > 1) await sleep(5000);
      const r = await api("POST", `/api/v1/tag/${encodeURIComponent(binding.slice(sep + 1))}`, { datasource: binding.slice(0, sep), value }).catch(() => null);
      status = r?.json?.status ?? "runtime unreachable";
    }
    log(status === "confirmed" ? "restore" : "restore_failed", { tag: binding, value, status });
    if (status !== "confirmed") stats.restoreFailed = (stats.restoreFailed ?? 0) + 1;
  }
  const doc = summary(true);
  console.log(`\nSoak ${doc.passed ? "PASSED" : "FAILED"}: ${doc.writes.sent} writes (${doc.writes.confirmed} confirmed, ` +
    `${doc.writes.failedWithReason} failed with a reason, ${doc.writes.notConfirmed} not confirmed, ${doc.writes.other} other), ` +
    `${doc.gaps} frozen-tag gaps, ${doc.datasourceDrops} datasource drops. Details: ${join(out, "summary.json")}`);
  const sc = doc.scripts;
  console.log(`Scripts: ${doc.gate.scriptsHealthy === null ? "too short to judge" : doc.gate.scriptsHealthy ? "healthy" : "NOT HEALTHY"}: ` +
    `${Object.entries(sc.status).map(([id, x]) => `${id} ${x.state} ${x.runs} runs${x.lastError ? ` (error: ${x.lastError})` : ""}`).join("; ")}; mem:ticks ${sc.ticks.last}.`);
  const o = doc.outageWrites;
  console.log(o.sent === 0
    ? "Writes during an outage: not tested (no outage happened; unplug the PLC briefly during a run to test them)."
    : `Writes during an outage: ${o.sent} (${o.failedAtOnce} failed at once, ${o.failedSlow} failed slowly, ` +
      `${o.confirmed} confirmed after recovery, ${o.other} other).`);
  if (doc.restoreFailed) console.log(`WARNING: ${doc.restoreFailed} test variables were NOT restored; see "restore_failed" in events.jsonl.`);
  process.exit(doc.passed ? 0 : 1);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setTimeout(stop, hours * 3600_000);
