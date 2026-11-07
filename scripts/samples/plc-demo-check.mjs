// Checks the PLC demo's increment rule against the rehearsal project, with no PLC: it plays the PLC's inputs over
// the runtime's WebSocket and watches what the script does, with timings.
//
//   node scripts/samples/plc-demo.mjs --rehearse
//   go run ./cmd/speths-screens --mode=runtime --addr=127.0.0.1:8132 --project=samples/plc-demo.rehearsal.screens.json --history=:memory:
//   node scripts/samples/plc-demo-check.mjs 127.0.0.1:8132
//
// It runs about 70 seconds and exits 0 when every check passes. It needs a fresh runtime (the rule starts off and
// the output at 0). Not part of CI: it takes a minute and needs a built runtime.
const base = process.argv[2] ?? "127.0.0.1:8132";
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const IN = `opcua:${O}iOPC_Read`, OUT = `opcua:${O}iOPC_Write`, RESTW = `rest:${R}iREST_Write`;
const watch = [IN, OUT, RESTW, "mem:RuleEnable", "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired", "mem:Mirrored"];
const widgetFor = { [IN]: "sm-i", "mem:RuleEnable": "s-enable", "mem:MirrorEnable": "s-menable", "mem:Threshold": "s-limit", "mem:WaitSeconds": "s-wait" };

const ws = new WebSocket(`ws://${base}/ws/tags`);
const v = {};
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
const events = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.path && watch.includes(d.path)) {
    if (v[d.path] !== d.value) events.push(`${secs()}s  ${d.path.replace(O, "").replace(R, "")} = ${JSON.stringify(d.value)}`);
    v[d.path] = d.value;
  }
  if (d.writeResult) results.push(d.writeResult);
};
const results = [];
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ subscribe: [...watch, "mem:MirrorEnable"] }));
let n = 0;
const write = async (path, value) => {
  const id = String(++n);
  ws.send(JSON.stringify({ write: { id, path, value, widgetId: widgetFor[path] } }));
  for (let i = 0; i < 50; i++) { await sleep(60); const r = results.find((x) => x.id === id); if (r) return r; }
  return { status: "no answer" };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, got) => { checks.push([name, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   got " + JSON.stringify(got)}`); };
const checks = [];

await sleep(1500);
console.log("--- the rule is switched off at the start");
check("starts off and says so", v["mem:RuleState"] === "Switched off", v["mem:RuleState"]);
await write(IN, 150); await sleep(2500);
check("an input above the limit does nothing while it is off", v[OUT] === 0 && v["mem:Fired"] === 0, [v[OUT], v["mem:Fired"]]);

console.log("--- switch it on with the input still at 150: it waits 5 seconds, then acts once");
const tOn = Date.now();
console.log("   write RuleEnable:", (await write("mem:RuleEnable", true)).status);
await sleep(2200);
check("it counts down while waiting", /waiting/.test(v["mem:RuleState"] ?? "") && v["mem:Countdown"] > 0 && v[OUT] === 0, [v["mem:RuleState"], v["mem:Countdown"], v[OUT]]);
while (v["mem:Fired"] < 1 && Date.now() - tOn < 12000) await sleep(100);
const took = (Date.now() - tOn) / 1000;
check("it acted after 5 seconds (within a quarter second of the wait)", v["mem:Fired"] === 1 && took >= 4.9 && took <= 6.2, [v["mem:Fired"], took]);
check("it added 100 to the output (0 to 100)", v[OUT] === 100, v[OUT]);
check("it recorded when", /iOPC_Write = 100/.test(v["mem:LastFired"] ?? ""), v["mem:LastFired"]);
await sleep(4000);
check("it does not act again while the input stays high", v[OUT] === 100 && v["mem:Fired"] === 1, [v[OUT], v["mem:Fired"]]);
check("it says it is waiting for the input to drop", /drop/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);

console.log("--- the input drops, then rises again: it acts a second time");
await write(IN, 80); await sleep(1800);
check("it re-arms when the input is at or below the limit", /at or below/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);
await write(IN, 150);
const t2 = Date.now();
while (v["mem:Fired"] < 2 && Date.now() - t2 < 12000) await sleep(100);
check("it acts again and adds another 100 (100 to 200)", v["mem:Fired"] === 2 && v[OUT] === 200, [v["mem:Fired"], v[OUT]]);

console.log("--- the input falls back before the wait ends: it must not act");
await write(IN, 80); await sleep(1800);
await write(IN, 150); await sleep(2200);
await write(IN, 60); await sleep(6500);
check("a short excursion does nothing", v["mem:Fired"] === 2 && v[OUT] === 200, [v["mem:Fired"], v[OUT]]);

console.log("--- the limit and the wait can be changed while it runs");
await write("mem:Threshold", 40); await write("mem:WaitSeconds", 2);
const t3 = Date.now();
while (v["mem:Fired"] < 3 && Date.now() - t3 < 10000) await sleep(100);
const took3 = (Date.now() - t3) / 1000;
check("with the limit at 40 and the wait 2 s it acts after about 2 s (input 60)", v["mem:Fired"] === 3 && v[OUT] === 300 && took3 >= 1.5 && took3 <= 5, [v["mem:Fired"], v[OUT], took3]);

console.log("--- switching it off stops it");
await write("mem:RuleEnable", false); await write(IN, 30); await sleep(1500); await write(IN, 200); await sleep(4000);
check("off means no more writes", v["mem:Fired"] === 3 && v[OUT] === 300 && v["mem:RuleState"] === "Switched off", [v["mem:Fired"], v[OUT], v["mem:RuleState"]]);

console.log("--- the second script mirrors the OPC read-in over REST when switched on");
await write(IN, 111); await sleep(800);
check("mirroring is off: REST is untouched", v[RESTW] === 0, v[RESTW]);
await write("mem:MirrorEnable", true); await write(IN, 123); await sleep(1500);
check("mirroring on: iREST_Write follows iOPC_Read", v[RESTW] === 123 && v["mem:Mirrored"] >= 1, [v[RESTW], v["mem:Mirrored"]]);

console.log("\n--- what happened, in order");
console.log(events.join("\n"));
const failed = checks.filter((c) => !c[1]).length;
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
ws.close();
process.exit(failed ? 1 : 0);
