// Phase 1 soak test: runs against a runtime that talks to a real PLC and
// checks the gate in CLAUDE.md: no frozen values, and every write either
// confirmed or failed with a reason.
//
// Usage (scripts/soak/run-soak.ps1 starts the runtime and calls this):
//   node scripts/soak/soak.mjs --runtime=http://127.0.0.1:3095 --plc=10.0.0.210
//        --hours=24 --out=<dir> [--pid=<runtime pid>] [--write-every=60]
//
// It deploys a soak project (no credentials: OPC UA anonymous, REST without
// login), subscribes to every tag over /ws/tags and to /ws/alarms, writes
// the PLC test variables (iOPC_/rOPC_/sOPC_Write, iREST_/rREST_/sREST_Write)
// on a timer and restores their starting values at the end. It writes
// events.jsonl (every finding as it happens) and summary.json (every 10 min
// and at the end) to --out, and exits 0 when the gate passed.
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
const GAP_MS = 15_000; // a polled tag reports every 0.5–1 s; 15 s of silence while online is a freeze
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
const widget = (id, type, binding, y, config) => ({ id, type, x: 0, y, w: 2, h: 1, binding, ...(config ? { config } : {}) });
const project = {
  version: "0.1.0",
  name: "Phase 1 soak",
  datasources: [
    { id: "opcua", label: "PLC OPC UA", type: "opcua", config: { endpoint: `opc.tcp://${plc}:4840`, securityMode: "None" } },
    { id: "rest", label: "PLC REST", type: "rest", config: { endpoint: `https://${plc}`, basePath: "/_pxc_api/v1.14" } },
  ],
  pages: [{
    id: "soak", name: "Soak", widgets: [
      ...reads.map((b, i) => widget(`r${i}`, "numericDisplay", b, i)),
      ...writes.map((w, i) => widget(`w${i}`, w.binding.includes("/s") ? "textInput" : "numericInput", w.binding, 20 + i,
        w.binding.includes("/s") ? undefined : { min: 0, max: 1000 })),
    ],
  }],
  // Exercises alarms and alarm history: raised while the int write is above 500.
  alarmRules: [{ id: "soak-high", name: "Soak counter high", binding: `opcua:${O}iOPC_Write`, condition: "gt", threshold: 500, severity: "info", message: "soak counter above 500" }],
};

// ── state ───────────────────────────────────────────────────────────────────
const tags = Object.fromEntries(allTags.map((p) => [p, { updates: 0, last: 0, quality: "", reason: "", gaps: 0, qualityChanges: 0 }]));
const ds = {};
const stats = {
  started: now(), plc, hours,
  writes: { sent: 0, confirmed: 0, failedWithReason: 0, notConfirmed: 0, other: 0, maxMs: 0, totalMs: 0 },
  gaps: 0, datasourceDrops: 0, wsReconnects: { tags: 0, alarms: 0 }, alarmMessages: 0, alarmResyncs: 0,
  memoryKB: { first: null, min: null, max: null, last: null },
  historyBytes: { first: null, last: null },
  historyRows: { first: null, last: null }, // the store keeps changes only (defect 7)
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

let n = 0;
async function writeRound() {
  n++;
  for (const w of writes) {
    const value = w.value(n);
    const t0 = Date.now();
    let r;
    try {
      const sep = w.binding.indexOf(":");
      r = await api("POST", `/api/v1/tag/${encodeURIComponent(w.binding.slice(sep + 1))}`, { datasource: w.binding.slice(0, sep), value });
    } catch (err) {
      r = { code: 0, json: { status: "failed", reason: `runtime unreachable: ${err}` } };
    }
    const ms = Date.now() - t0;
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
  const s = stats.writes;
  const gate = {
    noFrozenValues: stats.gaps === 0,
    everyWriteConfirmedOrFailedWithReason: s.other === 0 && s.notConfirmed === 0,
  };
  const doc = {
    ...stats, final, now: now(),
    writes: { ...s, avgMs: s.sent ? Math.round(s.totalMs / s.sent) : 0 },
    tags: Object.fromEntries(Object.entries(tags).map(([p, t]) => [p, { updates: t.updates, quality: t.quality, reason: t.reason, gaps: t.gaps, qualityChanges: t.qualityChanges }])),
    datasources: ds,
    gate, passed: gate.noFrozenValues && gate.everyWriteConfirmedOrFailedWithReason,
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
log("start", { plc, hours, writeEverySec: writeEvery / 1000, out });

// Wait until both datasources are online and every test variable reads
// Good: its starting value must be known before anything is written, or it
// could not be restored.
const originals = [];
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
log("originals", { values: Object.fromEntries(originals) });

watchTags();
watchAlarms();
const health = setInterval(checkHealth, 10_000);
const summaries = setInterval(() => { trend(); summary(false); }, 10 * 60_000);
let stopping = false;
const writer = (async () => {
  while (!stopping) {
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
  if (doc.restoreFailed) console.log(`WARNING: ${doc.restoreFailed} test variables were NOT restored; see "restore_failed" in events.jsonl.`);
  process.exit(doc.passed ? 0 : 1);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setTimeout(stop, hours * 3600_000);
