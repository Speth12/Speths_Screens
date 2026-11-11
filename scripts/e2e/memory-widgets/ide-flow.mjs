// The reported scenario, through the real IDE: make a memory variable in the namespace, drag it from the left panel onto
// a button and a numeric display, make the button increment, deploy to a runtime, and use the button on the operator screen.
//   node ide-flow.mjs [--increment]     (without --increment the button keeps the behavior a new button starts with)
import { launchChrome, sleep } from "./lib.mjs";

const IDE = process.env.IDE ?? "http://localhost:5173";
const RUNTIME = process.env.RUNTIME ?? "http://127.0.0.1:8080";
const increment = process.argv.includes("--increment");
const page = await launchChrome({ width: 1700, height: 1000 });
const step = (what) => console.log("•", what);
const ev = (e) => page.eval(e);
// The IDE saves its project a second after the last change, so wait for that before reading it.
const project = async () => { await sleep(1400); return ev(`JSON.parse(localStorage.getItem('speths-screens-project-v1'))`); };
const setField = (labelStart, value, scope = "document") => ev(`(() => { const root = ${scope}; const l = [...root.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(${JSON.stringify(labelStart)})); const el = l && document.getElementById(l.htmlFor); if (!el) return 'no ' + ${JSON.stringify(labelStart)}; window.__e2e.setValue(el, ${JSON.stringify(value)}); return 'ok' })()`);
const clickButton = (text, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return !!b })()`);

// A project with a memory datasource and a page, as the IDE keeps it.
const seed = { schemaVersion: 6, version: "0.1.0", name: "IDE flow", datasources: [{ id: "mem", label: "Script state", type: "memory", config: { memoryTags: [] } }], pages: [{ id: "main", name: "Main", widgets: [] }] };
// Set before the IDE starts, so its own autosave cannot overwrite it.
await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('speths-screens-project-v1', ${JSON.stringify(JSON.stringify(seed))});` });
await page.goto(IDE, 3000);

step("name a new memory variable in the namespace (Variables tab, + Node)");
await ev(`[...document.querySelectorAll('span')].find(e => e.textContent.trim().toLowerCase() === 'variables' && e.className.includes('uppercase'))?.click()`);
await sleep(900);
await clickButton("+ Node"); await sleep(500);
await setField("Path", "Counter", "document.querySelector('[role=dialog]')");
await setField("Driver", "mem", "document.querySelector('[role=dialog]')"); await sleep(300);
await setField("Variable type", "int", "document.querySelector('[role=dialog]')");
await clickButton("Save", "document.querySelector('[role=dialog]')"); await sleep(900);
let p = await project();
console.log("   memory tags:", JSON.stringify(p.datasources[0].config.memoryTags), " namespace:", JSON.stringify(p.namespace?.map((n) => `${n.path}->${n.driverId}:${n.driverAddr}`)));

step("back to the screen, add a Button and a Numeric display from the palette");
await ev(`[...document.querySelectorAll('[role=tab]')].find(t => t.textContent.trim() === 'Screen')?.click()`); await sleep(600);
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Widgets' && b.className.includes('uppercase'))?.click()`); await sleep(400);
await clickButton("Button"); await sleep(300);
await clickButton("Numeric"); await sleep(600);
p = await project();
console.log("   widgets:", p.pages[0].widgets.map((w) => `${w.type}@${w.x},${w.y}`).join(", "));
await page.shot("ide-1-added");

step("drag Counter from the left panel onto each widget (a real drag: dragstart on the tree, drop on the canvas)");
const drag = (labelOfWidgetType) => ev(`(async () => {
  const item = document.querySelector('[role=treeitem][aria-label=Counter]');
  if (!item) return 'no tree item';
  const dt = new DataTransfer();
  item.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
  const type = dt.getData('text/x-tag-binding');
  if (type !== 'ns:Counter') return 'dragstart gave ' + JSON.stringify(type);
  const target = [...document.querySelectorAll('[data-testid=canvas-widget], .group.relative')].find(e => e.textContent.toLowerCase().includes(${JSON.stringify(labelOfWidgetType)}));
  if (!target) return 'no widget on the canvas for ' + ${JSON.stringify(labelOfWidgetType)};
  const r = target.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const at = document.elementFromPoint(x, y);
  at.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
  at.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
  return 'dropped on ' + at.tagName;
})()`);
console.log("   button:", await drag("press"));
await sleep(400);
console.log("   numeric:", await drag("unknown"));
await sleep(600);
p = await project();
console.log("   bindings:", p.pages[0].widgets.map((w) => `${w.type} -> ${w.bindings?.value ?? "(none)"}`).join(" | "));
await page.shot("ide-2-dropped");

if (increment) {
  step("make the button increment on click (select it, Events, On click + action)");
  await ev(`(() => { const t = [...document.querySelectorAll('.group.relative')].find(e => e.textContent.trim().toLowerCase().includes("press")); t?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); t?.click(); })()`);
  await sleep(600);
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Props')?.click()`); await sleep(400);
  // One click at a time, as a person does.
  for (const prefix of ["Remove On press", "Remove On release"]) {
    console.log("   " + prefix + ":", await ev(`(() => { const b = document.querySelector('button[aria-label^="${prefix}"]'); b?.click(); return !!b })()`));
    await sleep(500);
  }
  console.log("   add On click -> increment:", await ev(`(() => { const s = document.querySelector('select[aria-label="Add action On click"]'); if (!s) return 'no select'; window.__e2e.setValue(s, 'increment'); return 'ok' })()`));
  await sleep(500);
  p = await project();
  console.log("   button events:", JSON.stringify(p.pages[0].widgets.find((w) => w.type === "button")?.events));
}

step("deploy from the IDE");
await clickButton("Deploy", "document.querySelector('header')"); await sleep(1500);
console.log("   header says:", await ev(`document.querySelector('header')?.innerText.split('\\n').filter(t => /deployed|error|not deployed/.test(t)).join(' | ')`));

step("operator screen: use the button");
const op = await launchChrome({ width: 1200, height: 800 });
await op.goto(RUNTIME + "/", 2500);
const widgetText = () => op.eval(`[...document.querySelectorAll('[data-widget-type=numericDisplay]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()).join(' | ')`);
const variable = async () => { const r = await fetch(RUNTIME + "/api/v1/tag/mem:Counter"); const d = await r.json(); return r.status === 200 ? (d.value ?? d.Value) : "(" + r.status + ")"; };
const fire = (types) => op.eval(`(() => { const b = document.querySelector('[data-widget-type=button] button'); if (!b) return false; for (const t of ${JSON.stringify(types)}) b.dispatchEvent(new MouseEvent(t, { bubbles: true })); return true })()`);
console.log("   before:           display", JSON.stringify(await widgetText()), " variable", JSON.stringify(await variable()));
for (let i = 1; i <= 3; i++) {
  await fire(["pointerdown", "mousedown"]); await sleep(400);
  console.log(`   press ${i} held:    display`, JSON.stringify(await widgetText()), " variable", JSON.stringify(await variable()));
  await fire(["pointerup", "mouseup", "click"]); await sleep(500);
  console.log(`   press ${i} released: display`, JSON.stringify(await widgetText()), " variable", JSON.stringify(await variable()));
}
await op.shot("ide-3-operator");
op.close(); page.close();
console.log("page errors:", [...page.errors, ...op.errors]);
process.exit(0);
