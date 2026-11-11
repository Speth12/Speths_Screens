// A small Chrome driver over the DevTools protocol, and helpers to find widgets on the operator screen by their label.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Where screenshots go. */
const SHOTS = process.env.E2E_SHOTS ?? join(tmpdir(), "speths-e2e-shots");
/** The Chrome to drive (any Chromium that takes --remote-debugging-port). */
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ width = 1600, height = 1000 } = {}) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = mkdtempSync(join(tmpdir(), "e2e-"));
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    "--disable-features=CalculateNativeWinOcclusion", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.slice(0, 200) ?? "exception");
  };
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    errors,
    send,
    async goto(url, settle = 1800) { await send("Page.navigate", { url }); await sleep(settle); },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    },
    /** Polls an expression until it is truthy. */
    async waitFor(expression, ms = 6000) {
      const end = Date.now() + ms;
      for (;;) {
        let v; try { v = await page.eval(expression); } catch { v = undefined; }
        if (v) return v;
        if (Date.now() > end) return v;
        await sleep(150);
      }
    },
    async shot(name) {
      mkdirSync(SHOTS, { recursive: true });
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, "base64"));
    },
    close() { try { ws.close(); } catch { /* closing */ } chrome.kill(); },
  };

  // Helpers that live in the page: find a widget's card by its label, read its text, fire real input events.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__e2e = {
      // The card of the widget labelled "W <name>": the smallest element that holds the label and the rest of the widget.
      card(name) {
        const want = "W " + name;
        const hit = [...document.querySelectorAll("div, span")].filter((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === want.toLowerCase());
        if (!hit.length) return null;
        let el = hit[0];
        // Climb to the widget's own box: the first ancestor whose parent holds more than one widget-sized sibling box.
        for (let i = 0; i < 8 && el.parentElement; i++) {
          const r = el.getBoundingClientRect();
          const pr = el.parentElement.getBoundingClientRect();
          if (pr.width > r.width * 1.05 + 6 && pr.height > r.height * 1.05 + 6 && el.parentElement.children.length > 1 && i > 0) break;
          el = el.parentElement;
        }
        return el;
      },
      text(name) { const c = this.card(name); return c ? c.innerText.replace(/\\s+/g, " ").trim() : null; },
      setValue(el, value) {
        const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
    };
  ` });
  return page;
}

/** The runtime's API. */
export function api(base) {
  const j = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return {
    j,
    /** The value a memory variable holds on the runtime. */
    async read(name) { const r = await j("GET", `/api/v1/tag/mem:${name}`); return r.status === 200 ? (r.data.value ?? r.data.Value) : `(${r.status})`; },
    /** A write the way a screen makes it: through the project's namespace name. */
    async write(name, value) { return j("POST", `/api/v1/tag/Test.${name}`, { datasource: "ns", value }); },
  };
}
