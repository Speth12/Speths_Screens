// Checks the PLC demo against the REAL lab PLC (an AXC F 3152 whose program copies each *_Read variable to its *_Write
// twin on every scan). It WRITES the six *_Read variables (the PLC's inputs), records their values first and puts them
// back in a finally step even if a check fails. It switches the demo's two scripts on and off. If xActivate and
// xAnomaly are exposed (over REST, by the PLC's HMI attribute) it toggles them and restores FALSE; otherwise it skips them.
//
//   node scripts/samples/plc-demo.mjs --opcua-fingerprint=<hex> --rest-fingerprint=<hex> --out=plc-demo.local.screens.json
//   go run ./cmd/speths-screens --mode=runtime --addr=127.0.0.1:8133 --project=plc-demo.local.screens.json --history=:memory:
//   node scripts/samples/plc-demo-live-check.mjs 127.0.0.1:8133
//
// Needs a fresh runtime (the rules start off) and a PLC whose iOPC_Write is above the rule's limit of 100 when
// iOPC_Read is (123 on the lab PLC). About 60 seconds. Not part of CI.
const base = process.argv[2] ?? "127.0.0.1:8133";
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const o = (n) => `opcua:${O}${n}`, r = (n) => `rest:${R}${n}`;
const PAIRS = [
  // [name, input, echo, widget that writes the input, a value to send]
  ["iOPC", o("iOPC_Read"), o("iOPC_Write"), "w-oi", 456], ["rOPC", o("rOPC_Read"), o("rOPC_Write"), "w-or", 4.5], ["sOPC", o("sOPC_Read"), o("sOPC_Write"), "w-os", "demo-opc"],
  ["iREST", r("iREST_Read"), r("iREST_Write"), "w-ri", 654], ["rREST", r("rREST_Read"), r("rREST_Write"), "w-rr", 6.5], ["sREST", r("sREST_Read"), r("sREST_Write"), "w-rs", "demo-rest"],
];
const INPUT = o("iOPC_Read"), ECHO = o("iOPC_Write"), REST_IN = r("iREST_Read"), REST_ECHO = r("iREST_Write");
const X = r("xActivate"), A = r("xAnomaly"), SINE = r("rSine_Out");
const mem = ["mem:RuleEnable", "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired", "mem:Threshold", "mem:CarryEnable", "mem:Carried"];
const watched = [...PAIRS.flatMap((p) => [p[1], p[2]]), X, A, SINE, ...mem];
const widgetFor = { "mem:RuleEnable": "s-enable", "mem:CarryEnable": "s-cenable", "mem:Threshold": "s-limit", [X]: "lg-act", [A]: "lg-ano" };
for (const p of PAIRS) widgetFor[p[1]] = p[3];

const ws = new WebSocket(`ws://${base}/ws/tags`);
const v = {}, q = {}, results = [], events = [], t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.path && watched.includes(d.path)) {
    if (JSON.stringify(v[d.path]) !== JSON.stringify(d.value) && d.quality !== "Bad") events.push(`${secs()}s  ${d.path.replace(O, "").replace(R, "")} = ${JSON.stringify(d.value)}`);
    v[d.path] = d.value; q[d.path] = d.quality;
  }
  if (d.writeResult) results.push(d.writeResult);
};
await new Promise((res) => (ws.onopen = res));
ws.send(JSON.stringify({ subscribe: watched }));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let n = 0;
const write = async (path, value) => {
  const id = String(++n), t = Date.now();
  ws.send(JSON.stringify({ write: { id, path, value, widgetId: widgetFor[path] } }));
  for (let i = 0; i < 100; i++) { await sleep(60); const x = results.find((y) => y.id === id); if (x) return { ...x, ms: Date.now() - t }; }
  return { status: "no answer", ms: Date.now() - t };
};
const same = (a, b) => (typeof b === "number" ? typeof a === "number" && Math.abs(a - b) < 0.001 : a === b);
const until = async (fn, ms) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await sleep(50); return (Date.now() - t) / 1000; };
const checks = [];
const check = (name, ok, got) => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   got " + JSON.stringify(got)}`); };

await sleep(2500);
const original = Object.fromEntries(PAIRS.map((p) => [p[1], v[p[1]]]));
console.log("the PLC's inputs to restore:", JSON.stringify(Object.fromEntries(PAIRS.map((p) => [p[0], original[p[1]]]))));
check("every input has a Good value to restore", Object.values(original).every((x) => x !== undefined && x !== null), original);
check("each reply already equals its input (the PLC's copy program is running)", PAIRS.every((p) => same(v[p[2]], original[p[1]])), PAIRS.map((p) => [v[p[1]], v[p[2]]]));
try {
  console.log("\n--- send a value to each of the PLC's six inputs; the PLC answers on its output");
  for (const [name, input, echo, , val] of PAIRS) {
    const res = await write(input, val);
    check(`write ${name}_Read = ${JSON.stringify(val)}: ${res.status} in ${res.ms} ms`, res.status === "confirmed", res);
    const took = await until(() => same(v[echo], val), 4000);
    check(`the PLC answers ${name}_Write = ${JSON.stringify(val)} (${took.toFixed(1)} s)`, same(v[echo], val), v[echo]);
  }
  await write(INPUT, original[INPUT]); await write(REST_IN, original[REST_IN]);
  await until(() => same(v[ECHO], original[INPUT]) && same(v[REST_ECHO], original[REST_IN]), 4000);

  console.log("\n--- the increment rule: the PLC reports 123 (above the limit of 100), so it adds 100 to the input after 5 s");
  const start = original[INPUT];
  check("the rule starts off", v["mem:RuleEnable"] === false && v["mem:RuleState"] === "Switched off", [v["mem:RuleEnable"], v["mem:RuleState"]]);
  const tOn = Date.now();
  await write("mem:RuleEnable", true);
  await until(() => v["mem:Fired"] >= 1, 12000);
  const took = (Date.now() - tOn) / 1000;
  check(`it acted after ${took.toFixed(1)} s (a wait of 5 s)`, v["mem:Fired"] === 1 && took >= 4.9 && took <= 6.2, [v["mem:Fired"], took]);
  await until(() => v[ECHO] === start + 100, 4000);
  check(`the input rose by 100 and the PLC's reply followed (${start} to ${start + 100})`, v[INPUT] === start + 100 && v[ECHO] === start + 100, [v[INPUT], v[ECHO]]);
  check("it recorded when", /iOPC_Read = /.test(v["mem:LastFired"] ?? ""), v["mem:LastFired"]);
  await sleep(6500);
  check("it does not act again while the reply stays above the limit", v["mem:Fired"] === 1 && v[INPUT] === start + 100, [v["mem:Fired"], v[INPUT]]);
  await write(INPUT, 80); await until(() => v[ECHO] === 80, 4000); await sleep(1000);
  check("with the PLC reporting 80 the rule re-arms", /at or below/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);
  await write(INPUT, 150);
  await until(() => v["mem:Fired"] >= 2, 12000); await until(() => v[ECHO] === 250, 4000);
  check("it acts a second time (150 to 250)", v["mem:Fired"] === 2 && v[INPUT] === 250 && v[ECHO] === 250, [v["mem:Fired"], v[INPUT], v[ECHO]]);
  await write("mem:RuleEnable", false); await sleep(1500);
  check("switched off", v["mem:RuleState"] === "Switched off", v["mem:RuleState"]);

  console.log("\n--- the second script carries the OPC UA reply into the REST input; the PLC answers on REST");
  await write("mem:CarryEnable", true); await write(INPUT, 321);
  await until(() => v[REST_ECHO] === 321, 6000);
  check("OPC UA in, the PLC, OPC UA out, the script, REST in, the PLC, REST out (321)", v[ECHO] === 321 && v[REST_IN] === 321 && v[REST_ECHO] === 321 && v["mem:Carried"] >= 1, [v[ECHO], v[REST_IN], v[REST_ECHO], v["mem:Carried"]]);
  await write("mem:CarryEnable", false);

  console.log("\n--- xActivate, xAnomaly and rSine_Out");
  if (q[X] === "Good" && q[A] === "Good") {
    const x0 = v[X], a0 = v[A];
    let res = await write(X, true); await sleep(1500);
    check(`write xActivate = true: ${res.status}`, res.status === "confirmed" && v[X] === true, [res, v[X]]);
    const s1 = v[SINE]; await sleep(1500);
    console.log(`   rSine_Out ${q[SINE] === "Good" ? "reads " + JSON.stringify(s1) + " then " + JSON.stringify(v[SINE]) : "is " + q[SINE]}`);
    res = await write(A, true); await sleep(1500);
    check(`write xAnomaly = true: ${res.status}`, res.status === "confirmed" && v[A] === true, [res, v[A]]);
    await write(A, a0); await write(X, x0); await sleep(1500);
    check("xActivate and xAnomaly restored", v[X] === x0 && v[A] === a0, [v[X], v[A]]);
  } else {
    console.log(`   SKIPPED: xActivate is ${q[X] ?? "not answering"}, xAnomaly is ${q[A] ?? "not answering"}: the PLC does not expose them (set the HMI attribute in PLC Engineer and write the project)`);
  }
} finally {
  console.log("\n--- restoring the PLC's inputs to what they were");
  await write("mem:RuleEnable", false); await write("mem:CarryEnable", false);
  for (const [name, input] of PAIRS) { const res = await write(input, original[input]); console.log(`   ${name}_Read <- ${JSON.stringify(original[input])}: ${res.status}`); }
  await sleep(2500);
  for (const [name, input, echo] of PAIRS) check(`restored ${name}: input and reply`, same(v[input], original[input]) && same(v[echo], original[input]), [v[input], v[echo], original[input]]);
}
console.log("\n--- what happened, in order");
console.log(events.join("\n"));
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
ws.close();
process.exit(failed ? 1 : 0);
