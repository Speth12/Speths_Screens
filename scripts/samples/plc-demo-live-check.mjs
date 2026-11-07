// Checks the PLC demo against the REAL lab PLC (an AXC F 3152 with the test variables). It WRITES: only the six
// *_Write test variables (iOPC_/rOPC_/sOPC_Write, iREST_/rREST_/sREST_Write), after recording their values, and it
// puts them back in a finally step even if a check fails. It also switches the demo's increment rule on and off.
//
//   node scripts/samples/plc-demo.mjs --opcua-fingerprint=<hex> --rest-fingerprint=<hex> --out=plc-demo.local.screens.json
//   go run ./cmd/speths-screens --mode=runtime --addr=127.0.0.1:8133 --project=plc-demo.local.screens.json --history=:memory:
//   node scripts/samples/plc-demo-live-check.mjs 127.0.0.1:8133
//
// Needs a fresh runtime (the rule starts off) and a PLC where iOPC_Read is above the limit of 100 (it is 123 on the lab
// PLC). It writes each variable, checks the write was confirmed and reads back, lets the rule act twice (the second time
// after the limit is raised above the input and lowered again), and restores everything. About 35 seconds. Not part of CI.
const base = process.argv[2] ?? "127.0.0.1:8133";
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const IN = `opcua:${O}iOPC_Read`, OUT = `opcua:${O}iOPC_Write`;
const W = {
  "opcua iOPC_Write": [OUT, "w-oi", 223], "opcua rOPC_Write": [`opcua:${O}rOPC_Write`, "w-or", 2.5], "opcua sOPC_Write": [`opcua:${O}sOPC_Write`, "w-os", "demo"],
  "rest iREST_Write": [`rest:${R}iREST_Write`, "w-ri", 124], "rest rREST_Write": [`rest:${R}rREST_Write`, "w-rr", 2.5], "rest sREST_Write": [`rest:${R}sREST_Write`, "w-rs", "demo"],
};
const mem = ["mem:RuleEnable", "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired", "mem:Threshold"];
const widgetFor = { "mem:RuleEnable": "s-enable", "mem:Threshold": "s-limit" };
for (const [, [p, w]] of Object.entries(W)) widgetFor[p] = w;

const ws = new WebSocket(`ws://${base}/ws/tags`);
const v = {}, results = [], events = [], t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
const watched = [IN, ...Object.values(W).map((x) => x[0]), ...mem];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.path && watched.includes(d.path)) {
    if (JSON.stringify(v[d.path]) !== JSON.stringify(d.value) && d.quality !== "Bad") events.push(`${secs()}s  ${d.path.replace(O, "").replace(R, "")} = ${JSON.stringify(d.value)}`);
    v[d.path] = d.value;
  }
  if (d.writeResult) results.push(d.writeResult);
};
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ subscribe: watched }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const write = async (path, value) => {
  const id = String(++n);
  const t = Date.now();
  ws.send(JSON.stringify({ write: { id, path, value, widgetId: widgetFor[path] } }));
  for (let i = 0; i < 100; i++) { await sleep(60); const r = results.find((x) => x.id === id); if (r) return { ...r, ms: Date.now() - t }; }
  return { status: "no answer", ms: Date.now() - t };
};
const checks = [];
const check = (name, ok, got) => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   got " + JSON.stringify(got)}`); };
const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 0.001;

await sleep(2500);
const original = Object.fromEntries(Object.entries(W).map(([k, [p]]) => [k, v[p]]));
console.log("original values:", JSON.stringify(original));
check("every test variable has a Good value to restore", Object.values(original).every((x) => x !== undefined && x !== null), original);
try {
  console.log("\n--- direct writes from the Write page's widgets (each confirmed by reading it back from the PLC)");
  for (const [k, [p, , val]] of Object.entries(W)) {
    if (k === "opcua iOPC_Write") continue; // the script test below does this one
    const r = await write(p, val);
    check(`write ${k} = ${JSON.stringify(val)}: ${r.status} in ${r.ms} ms`, r.status === "confirmed", r);
    await sleep(700);
    check(`${k} reads back ${JSON.stringify(val)}`, typeof val === "number" ? near(v[p], val) : v[p] === val, v[p]);
  }

  console.log("\n--- the increment rule on the real input (iOPC_Read is a constant 123, already above the limit of 100)");
  const base0 = v[OUT];
  check("the rule starts off", v["mem:RuleEnable"] === false && v["mem:RuleState"] === "Switched off", [v["mem:RuleEnable"], v["mem:RuleState"]]);
  const tOn = Date.now();
  await write("mem:RuleEnable", true);
  while (v["mem:Fired"] < 1 && Date.now() - tOn < 12000) await sleep(100);
  const took = (Date.now() - tOn) / 1000;
  check(`it acted after ${took.toFixed(1)} s (the wait is 5 s)`, v["mem:Fired"] === 1 && took >= 4.9 && took <= 6.2, [v["mem:Fired"], took]);
  await sleep(1200);
  check(`it added 100 to iOPC_Write on the PLC (${base0} to ${base0 + 100})`, v[OUT] === base0 + 100, v[OUT]);
  check("it recorded when", /iOPC_Write = /.test(v["mem:LastFired"] ?? ""), v["mem:LastFired"]);
  await sleep(6500);
  check("it does not act again while the input stays above the limit", v["mem:Fired"] === 1 && v[OUT] === base0 + 100, [v["mem:Fired"], v[OUT]]);

  console.log("\n--- raise the limit above the input (re-arms), then lower it again: it acts a second time");
  await write("mem:Threshold", 200); await sleep(1500);
  check("with the limit at 200 the input (123) is below it", /at or below/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);
  const t2 = Date.now();
  await write("mem:Threshold", 100);
  while (v["mem:Fired"] < 2 && Date.now() - t2 < 12000) await sleep(100);
  await sleep(1200);
  check("it acts again and adds another 100", v["mem:Fired"] === 2 && v[OUT] === base0 + 200, [v["mem:Fired"], v[OUT]]);
  await write("mem:RuleEnable", false); await sleep(1500);
  check("switched off", v["mem:RuleState"] === "Switched off", v["mem:RuleState"]);
} finally {
  console.log("\n--- restoring the PLC's test variables to what they were");
  await write("mem:RuleEnable", false);
  for (const [k, [p]] of Object.entries(W)) {
    const r = await write(p, original[k]);
    console.log(`   ${k} <- ${JSON.stringify(original[k])}: ${r.status}`);
  }
  await sleep(1500);
  for (const [k, [p]] of Object.entries(W)) {
    const same = typeof original[k] === "number" ? near(v[p], original[k]) : v[p] === original[k];
    check(`restored ${k}`, same, [v[p], original[k]]);
  }
}
console.log("\n--- what happened, in order");
console.log(events.join("\n"));
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
ws.close();
process.exit(failed ? 1 : 0);
