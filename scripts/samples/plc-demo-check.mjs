// Checks the PLC demo against the rehearsal project, with no PLC: a script in the rehearsal plays the PLC's program
// (each *_Read copied to its *_Write twin), and this plays the HMI over the runtime's WebSocket and watches what the
// demo's scripts do, with timings.
//
//   node scripts/samples/plc-demo.mjs --rehearse
//   go run ./cmd/speths-screens --mode=runtime --addr=127.0.0.1:8132 --project=samples/plc-demo.rehearsal.screens.json --history=:memory:
//   node scripts/samples/plc-demo-check.mjs 127.0.0.1:8132
//
// It runs about 25 seconds and exits 0 when every check passes. It needs a fresh runtime (the counter starts at 0 and the
// variables hold their starting values). Not part of CI: it takes a minute and needs a built runtime.
const base = process.argv[2] ?? "127.0.0.1:8132";
const O = "ns=6;s=Arp.Plc.Eclr/", R = "Arp.Plc.Eclr/";
const INPUT = `opcua:${O}iOPC_Read`, ECHO = `opcua:${O}iOPC_Write`, REST_IN = `rest:${R}iREST_Read`, REST_ECHO = `rest:${R}iREST_Write`;
const X = `rest:${R}xActivate`, SINE = `rest:${R}rSine_Out`;
const watch = [INPUT, ECHO, REST_IN, REST_ECHO, X, SINE, "mem:Counter", "mem:RuleState", "mem:Fired", "mem:LastFired", "mem:Carried", "mem:CarryEnable"];
const widgetFor = { [INPUT]: "w-oi", [REST_IN]: "w-ri", [X]: "lg-act", "mem:Counter": "s-click", "mem:CarryEnable": "s-cenable", "mem:Target": "s-target", "mem:Step": "s-step" };

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
ws.send(JSON.stringify({ subscribe: [...watch, "mem:Target", "mem:Step"] }));
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
console.log("--- the PLC copies what the HMI sends in; the counter starts at 0");
check("the counter starts at 0 and the script has said nothing yet", v["mem:Counter"] === 0 && v["mem:Fired"] === 0, [v["mem:Counter"], v["mem:Fired"]]);
await write(INPUT, 150); await until(() => v[ECHO] === 150, 3000);
check("sending 150 to the PLC's input: the PLC answers 150", v[ECHO] === 150, v[ECHO]);

console.log("--- the button: nine clicks write nothing to the PLC");
const click = async () => { await write("mem:Counter", (v["mem:Counter"] ?? 0) + 1); await sleep(120); };
for (let k = 0; k < 9; k++) await click();
check("the counter reads 9", v["mem:Counter"] === 9, v["mem:Counter"]);
check("it says one more click to go", /^1 more click to go/.test(v["mem:RuleState"] ?? ""), v["mem:RuleState"]);
await sleep(800);
check("the PLC's input is untouched", v[INPUT] === 150 && v[ECHO] === 150 && v["mem:Fired"] === 0, [v[INPUT], v[ECHO], v["mem:Fired"]]);

console.log("--- the tenth click: the script adds 100 to the PLC's input and the PLC answers");
await click();
await until(() => v["mem:Fired"] >= 1, 4000);
await until(() => v[ECHO] === 250, 3000);
check("it added 100 to iOPC_Read and the PLC's reply followed (150 to 250)", v[INPUT] === 250 && v[ECHO] === 250 && v["mem:Fired"] === 1, [v[INPUT], v[ECHO], v["mem:Fired"]]);
await until(() => v["mem:Counter"] === 0, 3000);
check("the counter went back to 0", v["mem:Counter"] === 0, v["mem:Counter"]);
check("it recorded when", /iOPC_Read = 250/.test(v["mem:LastFired"] ?? ""), v["mem:LastFired"]);
await sleep(1500);
check("nothing more was written", v[INPUT] === 250 && v["mem:Fired"] === 1, [v[INPUT], v["mem:Fired"]]);

console.log("--- ten more clicks, fast: it acts once more, and no click is lost");
for (let k = 0; k < 10; k++) { await write("mem:Counter", (v["mem:Counter"] ?? 0) + 1); }
await until(() => v["mem:Fired"] >= 2, 4000); await until(() => v[ECHO] === 350, 3000);
check("the input is now 350 and the script acted twice", v[INPUT] === 350 && v[ECHO] === 350 && v["mem:Fired"] === 2, [v[INPUT], v[ECHO], v["mem:Fired"]]);

console.log("--- the target and the step can be changed");
await write("mem:Target", 3); await write("mem:Step", 25); await sleep(300);
for (let k = 0; k < 3; k++) await click();
await until(() => v["mem:Fired"] >= 3, 4000); await until(() => v[ECHO] === 375, 3000);
check("with a target of 3 and a step of 25 the third click adds 25 (350 to 375)", v[INPUT] === 375 && v["mem:Fired"] === 3, [v[INPUT], v["mem:Fired"]]);

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
