// End to end: one memory variable per widget type, on a real runtime, driven through a real browser.
// For every widget it changes the variable (through the runtime's API, or by operating the widget on the screen when
// it is an input) and checks the runtime's value AND what the screen shows.
//   node run.mjs [baseUrl]
import { buildProject } from "./project.mjs";
import { launchChrome, api, sleep } from "./lib.mjs";

const BASE = process.argv[2] ?? process.env.RUNTIME ?? "http://127.0.0.1:8080";
const rt = api(BASE);
const results = [];
const record = (widget, what, ok, detail = "") => { results.push({ widget, what, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${widget.padEnd(15)} ${what}${ok ? "" : "   <- " + detail}`); };

// 1. Deploy the project to a runtime that has just started.
const dep = await rt.j("POST", "/api/v1/project", buildProject());
if (dep.status !== 200) { console.log("deploy failed", dep); process.exit(2); }

const page = await launchChrome({ width: 1700, height: 1100 });
await page.goto(BASE + "/", 2500);

const sel = (id) => `[data-widget-id="w-${id}"]`;
const q = (expr) => page.eval(expr);
const textOf = (id) => q(`(document.querySelector('${sel(id)}')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
const visible = (id) => q(`(document.querySelector('${sel(id)}')?.childElementCount ?? 0) > 0`);
const running = (id) => q(`(document.querySelector('${sel(id)}')?.getAnimations({ subtree: true }) ?? []).filter(a => a.playState === 'running').length`);

/** Polls until the check holds or time runs out; returns the last value seen. */
async function until(read, ok, ms = 5000) {
  const end = Date.now() + ms; let v;
  for (;;) { try { v = await read(); } catch (e) { v = String(e); } if (ok(v)) return { ok: true, v }; if (Date.now() > end) return { ok: false, v }; await sleep(150); }
}
/** The runtime holds `want` and the widget's text matches `re`. */
async function expectBoth(widget, what, name, want, re) {
  const onRt = await until(() => rt.read(name), (v) => v === want);
  const onScreen = re ? await until(() => textOf(widget), (t) => re.test(t)) : { ok: true };
  record(widget, what, onRt.ok && onScreen.ok, `runtime ${JSON.stringify(onRt.v)}${onScreen.ok ? "" : `, screen "${onScreen.v}"`}`);
}
const writeVar = async (name, v) => { const r = await rt.write(name, v); if (r.status !== 200) console.log(`  (write ${name}=${v} -> ${r.status} ${JSON.stringify(r.data).slice(0, 120)})`); return r; };
const go = async (name) => { await q(`[...document.querySelectorAll('button, a, [role=tab]')].find(e => e.textContent.trim() === ${JSON.stringify(name)})?.click()`); await sleep(900); };
const clickIn = (id, selector = "button") => q(`(() => { const b = document.querySelector('${sel(id)} ${selector}'); if (!b) return false; b.click(); return true; })()`);

// ── Values page: widgets that show a variable ────────────────────────────────────────────────────────────────────
await go("Values");
await writeVar("numericDisplay", 12.5); await expectBoth("numericDisplay", "shows 12.5", "numericDisplay", 12.5, /12\.50/);
await writeVar("numericDisplay", 99);   await expectBoth("numericDisplay", "follows a change to 99", "numericDisplay", 99, /(^|\s)99(\D|$)/);
await writeVar("textDisplay", "Hello");  await expectBoth("textDisplay", "shows Hello", "textDisplay", "Hello", /Hello/);
await writeVar("textDisplay", "World");  await expectBoth("textDisplay", "follows a change to World", "textDisplay", "World", /World/);
await writeVar("led", true);  await expectBoth("led", "on", "led", true, /LED_ON/);
await writeVar("led", false); await expectBoth("led", "off", "led", false, /LED_OFF/);
await writeVar("gauge", 63);  await expectBoth("gauge", "shows 63", "gauge", 63, /63\.0 bar/);
await writeVar("gauge", 21);  await expectBoth("gauge", "follows a change to 21", "gauge", 21, /21\.0 bar/);
await writeVar("tank", 40);   await expectBoth("tank", "shows 40", "tank", 40, /\b40(\.0+)?\b/);
await writeVar("tank", 75);   await expectBoth("tank", "follows a change to 75", "tank", 75, /\b75(\.0+)?\b/);
await writeVar("multiState", 1); await expectBoth("multiState", "state 1 is RUN", "multiState", 1, /STATE_RUN/);
await writeVar("multiState", 2); await expectBoth("multiState", "state 2 is FAULT", "multiState", 2, /STATE_FAULT/);
await writeVar("tableA", 3.5); await writeVar("tableB", 8);
await expectBoth("table", "row A shows 3.5", "tableA", 3.5, /RowA\s*3\.5/);
await expectBoth("table", "row B shows 8", "tableB", 8, /RowB\s*8/);
for (const v of [10, 20, 30]) { await writeVar("trend", v); await sleep(450); }
await expectBoth("trend", "pen shows the latest value 30", "trend", 30, /TrendPen\s*30/);
await writeVar("historyLog", 5); await sleep(1300); await writeVar("historyLog", 6); await sleep(1800);
await page.goto(BASE + "/", 2200); await go("Values");
const hist = await until(() => textOf("historyLog"), (t) => !/No history/.test(t) && /\b6\b/.test(t), 4000);
record("historyLog", "lists the values the variable took", hist.ok, `screen "${hist.v}"`);
await page.shot("values");

// ── Inputs page: widgets that write a variable ───────────────────────────────────────────────────────────────────
await go("Inputs");
for (let i = 1; i <= 3; i++) { await clickIn("btnIncrement"); await sleep(350); }
await expectBoth("button", "increment x3 adds 3 (the reported case)", "btnCount", 3, null);
{ const s = await until(() => textOf("btnCountDisplay"), (t) => /\b3\b/.test(t)); record("button", "…and the numeric display of the same variable shows 3", s.ok, `screen "${s.v}"`); }
await clickIn("btnToggle"); await expectBoth("button", "toggle turns a flag on", "btnFlag", true, null);
{ const s = await until(() => textOf("btnFlagLed"), (t) => /FLAG_ON/.test(t)); record("button", "…and an LED of it shows ON", s.ok, `screen "${s.v}"`); }
await clickIn("btnToggle"); await expectBoth("button", "toggle again turns it off", "btnFlag", false, null);
{ const s = await until(() => textOf("btnFlagLed"), (t) => /FLAG_OFF/.test(t)); record("button", "…and the LED of it shows OFF", s.ok, `screen "${s.v}"`); }
await clickIn("btnWrite7"); await expectBoth("button", "write action sets 7", "btnWrite", 7, null);
{ const s = await until(() => textOf("btnWriteDisplay"), (t) => /\b7\b/.test(t)); record("button", "…and the display shows 7", s.ok, `screen "${s.v}"`); }

// numericInput: click the number, use the keypad, confirm.
await q(`document.querySelector('${sel("numericInput")} div.cursor-pointer')?.click()`); await sleep(400);
for (const k of ["1", "2", "3", ".", "5"]) await q(`[...document.querySelectorAll('.fixed button')].find(b => b.textContent.trim() === ${JSON.stringify(k)})?.click()`);
await q(`[...document.querySelectorAll('.fixed button')].find(b => b.textContent.trim() === '✓')?.click()`);
await expectBoth("numericInput", "typing 123.5 on the keypad writes it", "numericInput", 123.5, /123\.5/);
await writeVar("numericInput", 7); await expectBoth("numericInput", "follows a change made elsewhere", "numericInput", 7, /\b7\b/);

// textInput: click, type, Enter.
await q(`document.querySelector('${sel("textInput")} div.cursor-text')?.click()`); await sleep(300);
await q(`(() => { const i = document.querySelector('${sel("textInput")} input'); if (!i) return; window.__e2e.setValue(i, 'typed text'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
await expectBoth("textInput", "typing text and Enter writes it", "textInput", "typed text", /typed text/);
await writeVar("textInput", "from elsewhere"); await expectBoth("textInput", "follows a change made elsewhere", "textInput", "from elsewhere", /from elsewhere/);

// setpoint: move the slider and release.
await q(`(() => { const i = document.querySelector('${sel("setpoint")} input[type=range]'); if (!i) return; window.__e2e.setValue(i, '55'); i.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); })()`);
await expectBoth("setpoint", "moving the slider to 55 writes it", "setpoint", 55, /\b55\b/);
await writeVar("setpoint", 20); await expectBoth("setpoint", "follows a change made elsewhere", "setpoint", 20, /\b20\b/);

// recipes: apply a recipe that writes two variables.
await clickIn("recipes", "button");
await q(`[...document.querySelectorAll('${sel("recipes")} button')].find(b => /Apply/i.test(b.textContent))?.click()`);
await expectBoth("recipes", "Apply writes the first variable (11)", "recA", 11, null);
await expectBoth("recipes", "…and the second (RECIPE_X)", "recB", "RECIPE_X", null);
{ const a = await until(() => textOf("recADisplay"), (t) => /\b11\b/.test(t)); const b = await until(() => textOf("recBDisplay"), (t) => /RECIPE_X/.test(t));
  record("recipes", "…and displays of them show the values", a.ok && b.ok, `screen "${a.v}" / "${b.v}"`); }
await page.shot("inputs");

// ── Display-only page: widgets with no value of their own show and hide with a variable ────────────────────────────
await go("Display only");
const gate = async (widget, visVar, content, label = "appears when its variable is true and goes when false") => {
  await writeVar(visVar, false); await sleep(500);
  const hiddenFirst = await until(() => visible(widget), (v) => v === false, 3000);
  await writeVar(visVar, true);
  const shown = await until(() => visible(widget), (v) => v === true, 4000);
  let contentOk = true, detail = "";
  if (content && shown.ok) { const c = await until(() => q(content.expr), content.ok, 3000); contentOk = c.ok; detail = ` content ${JSON.stringify(c.v)}`; }
  await writeVar(visVar, false);
  const hiddenAfter = await until(() => visible(widget), (v) => v === false, 3000);
  record(widget, label, hiddenFirst.ok && shown.ok && contentOk && hiddenAfter.ok, `hidden-first ${hiddenFirst.v}, shown ${shown.v}, hidden-after ${hiddenAfter.v},${detail}`);
};
await gate("image", "visImage", { expr: `document.querySelector('${sel("image")} img')?.getAttribute('src')?.slice(0, 15) ?? null`, ok: (v) => v === "data:image/svg+" });
await gate("symbol", "visSymbol", { expr: `document.querySelectorAll('${sel("symbol")} svg').length`, ok: (v) => v > 0 });
await gate("pipe", "visPipe", { expr: `document.querySelectorAll('${sel("pipe")} svg').length`, ok: (v) => v > 0 });
await gate("alarmBanner", "visAlarmBanner", null);
await gate("pageList", "visPageList", { expr: `(document.querySelector('${sel("pageList")}')?.innerText ?? '')`, ok: (t) => /Inputs/.test(t) && /Values/.test(t) });
await gate("clock", "visClock", { expr: `(document.querySelector('${sel("clock")}')?.innerText ?? '')`, ok: (t) => /\d\d:\d\d/.test(t) });
await gate("driverStatus", "visDriverStatus", { expr: `(document.querySelector('${sel("driverStatus")}')?.innerText ?? '')`, ok: (t) => /Script state/.test(t) });
await gate("userMenu", "visUserMenu", { expr: `document.querySelectorAll('${sel("userMenu")} button').length`, ok: (v) => v > 0 });
await gate("customWidget", "visCustom", null);
await gate("recipesVisible", "visRecipes", { expr: `(document.querySelector('${sel("recipesVisible")}')?.innerText ?? '')`, ok: (t) => /Apply/i.test(t) });

// Values that drive a property: symbol animation, pipe flow.
await writeVar("visSymbol", true); await writeVar("symAnim", false); await sleep(600);
const before = await running("symbol");
await writeVar("symAnim", true); const spin = await until(() => running("symbol"), (n) => n > 0, 3000);
await writeVar("symAnim", false); const stop = await until(() => running("symbol"), (n) => n === 0, 3000);
record("symbol", "spins while its variable is true, stops when false", before === 0 && spin.ok && stop.ok, `before ${before}, spinning ${spin.v}, after ${stop.v}`);
await writeVar("visPipe", true); await writeVar("pipeFlow", false); await sleep(600);
const pBefore = await running("pipe");
await writeVar("pipeFlow", true); const flow = await until(() => running("pipe"), (n) => n > 0, 3000);
await writeVar("pipeFlow", false); const pStop = await until(() => running("pipe"), (n) => n === 0, 3000);
record("pipe", "flows while its variable is true, stops when false", pBefore === 0 && flow.ok && pStop.ok, `before ${pBefore}, flowing ${flow.v}, after ${pStop.v}`);

// A custom widget whose parameter names a variable; an alarm raised from a variable.
await writeVar("visCustom", true); await writeVar("customVal", 31.5);
await expectBoth("customWidget", "its parameter shows the variable (31.5)", "customVal", 31.5, /31\.5/);
await writeVar("customVal", 8);  await expectBoth("customWidget", "follows a change to 8", "customVal", 8, /\b8\b/);
await writeVar("visAlarmBanner", true); await writeVar("alarmLevel", 75);
{ const s = await until(() => textOf("alarmBanner"), (t) => /ALARM_RAISED/.test(t), 5000); record("alarmBanner", "raises an alarm when the variable passes 50", s.ok, `screen "${s.v}"`); }
await writeVar("alarmLevel", 10);
{ const s = await until(() => textOf("alarmBanner"), (t) => !/ALARM_RAISED/.test(t) || /normal|cleared|ack/i.test(t), 5000); record("alarmBanner", "…and clears or marks it normal when it falls back", s.ok, `screen "${s.v}"`); }
await page.shot("display");

// ── A variable added by a later deploy ───────────────────────────────────────────────────────────────────────────
const later = buildProject();
later.datasources[0].config.memoryTags.push({ path: "lateVar", type: "int" });
later.namespace.push({ path: "Test.lateVar", type: "tag", driverId: "mem", driverAddr: "lateVar", dataType: "int" });
await rt.j("POST", "/api/v1/project", later);
await sleep(800);
const lw = await rt.write("lateVar", 5);
record("redeploy", "a memory variable added by a second deploy can be written", lw.status === 200, `HTTP ${lw.status} ${JSON.stringify(lw.data).slice(0, 100)}`);

page.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.` + (page.errors.length ? `  Page errors: ${page.errors.join(" | ")}` : ""));
process.exit(failed.length ? 1 : 0);
