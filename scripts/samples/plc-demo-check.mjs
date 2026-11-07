// Checks the PLC demo against the rehearsal project, with no PLC: a script in the rehearsal plays the PLC's program
// (each *_Read copied to its *_Write twin), and this plays the HMI over the runtime's WebSocket and watches what the
// demo's scripts do, with timings.
//
//   node scripts/samples/plc-demo.mjs --rehearse
//   go run ./cmd/speths-screens --mode=runtime --addr=127.0.0.1:8132 --project=samples/plc-demo.rehearsal.screens.json --history=:memory:
//   node scripts/samples/plc-demo-check.mjs 127.0.0.1:8132
//
// It runs about 60 seconds and exits 0 when every check passes. It needs a fresh runtime (the rule starts off and the
// variables hold their starting values). Not part of CI: it takes a minute and needs a built runtime.
const base = process.argv[2] ?? "127.0.0.1:8132";
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const INPUT = `opcua:${O}iOPC_Read`, ECHO = `opcua:${O}iOPC_Write`, REST_IN = `rest:${R}iREST_Read`, REST_ECHO = `rest:${R}iREST_Write`;
const X = `rest:${R}xActivate`, SINE = `rest:${R}rSine_Out`;
const watch = [INPUT, ECHO, REST_IN, REST_ECHO, X, SINE, "mem:RuleEnable", "mem:RuleState", "mem:Countdown", "mem:Fired", "mem:LastFired", "mem:Carried", "mem:CarryEnable"];
const widgetFor = { [INPUT]: "w-oi", [REST_IN]: "w-ri", [X]: "lg-act", "mem:RuleEnable": "s-enable", "mem:CarryEnable": "s-cenable", "mem:Threshold": "s-limit", "mem:WaitSeconds": "s-wait" };

const ws = new WebSocket(`ws://${base}/ws/tags`);
const v = {}, results = [], events = [];
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.path && watch.includes(d.path)) {
    if (v[d.path] !== d.value) events.push(`${secs()}s  ${d.path.replace(O, "").replace(R, "")} = ${JSON.stringify(d.value)}`);
    v[d.path] = d.value;
  }
  if (d.writeResult) results.push(d.writeResult);
};
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ subscribe: [...watch, "mem:Threshold", "mem:WaitSeconds"] }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const write = async (path, value) => {
  const id = String(++n);
  ws.send(JSON.stringify({ write: { id, path, value, widgetId: widgetFor[path] } }));
  for (let i = 0; i < 50; i++) { await sleep(60); const r = results.find((x) => x.id === id); if (r) return r; }
  return { status: "no answer" };
};
const until = async (fn, ms) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await sleep(50); return (Date.now() - t) / 1000; };
const checks = [];
const check = (name, ok, got) => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   got " + JSON.stringify(got)}`); };

await sleep(1500);
console.log("--- the PLC copies what the HMI sends in; the rule starts off");
check("the rule starts off and says so", v["mem:RuleState"] === "Switched off", v["mem:RuleState"]);
await write(INPUT, 150); await until(() => v[ECHO] === 150, 3000);
check("sending 150 to the PLC's input: the PLC answers 150", v[ECHO] === 150, v[ECHO]);
await sleep(2500);
check("a reply above the limit does nothing while the rule is off", v[INPUT] === 150 && v["mem:Fired"] === 0, [v[INPUT], v["mem:Fired"]]);

console.log("--- switch it on with the reply at 150: it waits 5 seconds, then adds 100 to the PLC's input, once");
const tOn = Date.now();
await write("mem:RuleEnable", true);
await sleep(2200);
check("it counts down while waiting", /waiting/.test(v["mem:RuleState"] ?? "") && v["mem:Countdown"] > 0 && v[INPUT] === 150, [v["mem:RuleState"], v["mem:Countdown"], v[INPUT]]);
await until(() => v["mem:Fired"] >= 1, 12000);
const took = (Date.now() - tOn) / 1000;
check(`it acted after ${took.toFixed(1)} s (a wait of 5 s)`, v["mem:Fired"] === 1 && took >= 4.9 && took <= 6.2, [v["mem:Fired"], took]);
await until(() => v[ECHO] === 250, 3000);
check("it added 100 to the input, and the PLC's reply followed (150 to 250)", v[INPUT] === 250 && v[ECHO] === 250, [v[INPUT], v[ECHO]]);
check("it recorded when", /iOPC_Read = 250/.test(v["mem:LastFired"] ?? ""), v["mem:LastFired"]);
await sleep(4000);
check("it does not act again while the reply stays high", v["mem:Fired"] === 1 && v[INPUT] === 250, [v["mem:Fired"], v[INPUT]]);
check("it says it is waiting for the value to drop", /drop/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);

console.log("--- the reply drops, then rises again: it acts a second time");
await write(INPUT, 80); await until(() => v[ECHO] === 80, 3000); await sleep(1000);
check("it re-arms when the PLC reports a value at or below the limit", /at or below/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);
await write(INPUT, 150);
await until(() => v["mem:Fired"] >= 2, 12000); await until(() => v[ECHO] === 250, 3000);
check("it acts again: the input becomes 150 + 100 and the reply follows", v["mem:Fired"] === 2 && v[INPUT] === 250 && v[ECHO] === 250, [v["mem:Fired"], v[INPUT], v[ECHO]]);

console.log("--- the reply falls back before the wait ends: it must not act");
await write(INPUT, 80); await sleep(1800);
await write(INPUT, 150); await sleep(2200);
await write(INPUT, 60); await sleep(6500);
check("a short excursion does nothing", v["mem:Fired"] === 2 && v[INPUT] === 60, [v["mem:Fired"], v[INPUT]]);

console.log("--- the limit and the wait can be changed while it runs");
await write("mem:Threshold", 40); await write("mem:WaitSeconds", 2);
const t3 = Date.now();
await until(() => v["mem:Fired"] >= 3, 10000);
const took3 = (Date.now() - t3) / 1000;
await until(() => v[ECHO] === 160, 3000);
check("with the limit at 40 and the wait 2 s it acts after about 2 s (input 60 to 160)", v["mem:Fired"] === 3 && v[INPUT] === 160 && took3 >= 1.5 && took3 <= 5, [v["mem:Fired"], v[INPUT], took3]);

console.log("--- switching it off stops it");
await write("mem:RuleEnable", false); await write(INPUT, 30); await sleep(1500); await write(INPUT, 200); await sleep(4000);
check("off means no more writes to the input", v["mem:Fired"] === 3 && v[INPUT] === 200 && v["mem:RuleState"] === "Switched off", [v["mem:Fired"], v[INPUT], v["mem:RuleState"]]);

console.log("--- the second script carries the OPC UA reply into the REST input, and the PLC answers on REST");
const restBefore = v[REST_ECHO];
await write(INPUT, 111); await sleep(1000);
check("carrying is off: REST is untouched", v[REST_ECHO] === restBefore, [v[REST_ECHO], restBefore]);
await write("mem:CarryEnable", true); await write(INPUT, 321);
await until(() => v[REST_ECHO] === 321, 4000);
check("carrying on: the REST input and the PLC's REST reply follow (OPC UA in, REST out)", v[REST_IN] === 321 && v[REST_ECHO] === 321 && v["mem:Carried"] >= 1, [v[REST_IN], v[REST_ECHO], v["mem:Carried"]]);

console.log("--- xActivate and rSine_Out (the rehearsal plays them)");
check("rSine_Out is still while xActivate is off", v[SINE] === 0, v[SINE]);
await write(X, true); await sleep(1500);
check("with xActivate on, rSine_Out moves", v[X] === true && typeof v[SINE] === "number" && v[SINE] !== 0, [v[X], v[SINE]]);
await write(X, false);

console.log("\n--- what happened, in order");
console.log(events.join("\n"));
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
ws.close();
process.exit(failed ? 1 : 0);
