/**
 * Standalone HTML export.
 * Generates a single self-contained HTML file containing the project JSON
 * and a minimal vanilla-JS runtime that connects to the Speth's Screens runtime.
 */
import type { Project } from "./projectStore";

export function generateStandaloneHtml(project: Project, targetUrl: string): string {
  const projectJson = JSON.stringify(project);
  const escapedUrl  = targetUrl.replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(project.name ?? "Speth's Screens")}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#09090b;color:#e4e4e7;font-family:monospace;overflow:hidden;height:100vh;display:flex;flex-direction:column}
#canvas{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
#stage{position:relative}
.widget{position:absolute;border-radius:8px;background:#18181b;border:1px solid #3f3f46;overflow:hidden;display:flex;flex-direction:column;padding:8px;gap:4px;font-size:11px}
.wlabel{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wbody{flex:1;min-height:0;display:flex;align-items:center}
.qbadge{font-size:8px;color:#52525b}
.qGood{color:#22c55e}.qBad{color:#ef4444}.qUncertain{color:#f59e0b}
button.hmi-btn{width:100%;height:100%;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
input[type=range]{width:100%;accent-color:#3b82f6}
#navbar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);border-top:1px solid #27272a;flex-shrink:0}
.pagebtn{font-size:11px;padding:3px 12px;border-radius:999px;border:none;cursor:pointer;background:#27272a;color:#a1a1aa;transition:.15s}
.pagebtn.active{background:#2563eb;color:#fff}
#target-bar{font-size:10px;color:#52525b;display:flex;gap:6px;align-items:center}
#target-bar input{background:#18181b;border:1px solid #3f3f46;color:#e4e4e7;border-radius:4px;padding:2px 6px;font-size:10px;font-family:monospace;width:220px}
#ws-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0}
#ws-dot.ok{background:#22c55e}
</style>
</head>
<body>
<div id="canvas"><div id="stage"></div></div>
<div id="navbar">
  <div id="page-tabs"></div>
  <div id="target-bar">
    <div id="ws-dot"></div>
    <input id="target-input" value="${escapedUrl}" placeholder="http://host:8080"/>
    <button onclick="reconnect()" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #3f3f46;background:#27272a;color:#a1a1aa;cursor:pointer">Connect</button>
  </div>
</div>
<script>
const PROJECT = ${projectJson};

// ── State ─────────────────────────────────────────────────────────────────
let activePage = PROJECT.pages[0]?.id ?? "";
const tags = {};      // path → {value, quality, ts}
let ws = null;

// ── Tag store ─────────────────────────────────────────────────────────────
function getTag(binding) {
  if (!binding) return { value: null, quality: "Unknown" };
  const sep = binding.indexOf(":");
  const path = sep >= 0 ? binding.slice(sep + 1) : binding;
  return tags[path] ?? { value: null, quality: "Unknown" };
}

function setTag(path, state) {
  tags[path] = state;
}

// ── WebSocket ─────────────────────────────────────────────────────────────
function reconnect() {
  if (ws) { ws.close(); ws = null; }
  const url = document.getElementById("target-input").value.trim();
  const wsUrl = url ? url.replace(/^http/, "ws") + "/ws/tags"
    : (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/tags";
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      document.getElementById("ws-dot").className = "ok";
      const paths = allBindings();
      if (paths.length) ws.send(JSON.stringify({ subscribe: paths }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        setTag(msg.path, { value: msg.value, quality: msg.quality ?? "Unknown", ts: msg.ts });
        render();
      } catch {}
    };
    ws.onclose = ws.onerror = () => { document.getElementById("ws-dot").className = ""; };
  } catch {}
}

function allBindings() {
  const paths = new Set();
  PROJECT.pages.forEach(p => p.widgets.forEach(w => {
    if (w.binding) { const sep = w.binding.indexOf(":"); paths.add(sep >= 0 ? w.binding.slice(sep+1) : w.binding); }
  }));
  return Array.from(paths);
}

// ── Write ─────────────────────────────────────────────────────────────────
function writeTag(binding, value) {
  const sep = binding.indexOf(":");
  if (sep < 0) return;
  const ds   = binding.slice(0, sep);
  const path = binding.slice(sep + 1);
  const base = document.getElementById("target-input").value.trim() || "";
  fetch(base + "/api/v1/tag/" + encodeURIComponent(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasource: ds, value }),
  }).catch(() => {});
}

// ── Navigation ────────────────────────────────────────────────────────────
function navigate(pageId) {
  activePage = pageId;
  render();
}

// ── Rendering ─────────────────────────────────────────────────────────────
const COL_W = 80, ROW_H = 64, GAP = 8;

function gx(col, span) { return { left: col*(COL_W+GAP), width: span*(COL_W+GAP)-GAP }; }
function gy(row, span) { return { top:  row*(ROW_H+GAP), height: span*(ROW_H+GAP)-GAP }; }

function fmt(v) {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  return String(v);
}

function qualityClass(q) { return "q" + (q || "Unknown"); }

// Widget renderers (return innerHTML string)
const RENDERERS = {
  numericDisplay(w, t) {
    const unit = w.config?.unit ?? "";
    return \`<div class="wbody" style="flex-direction:column;align-items:flex-start">
      <div style="font-size:2em;font-weight:600">\${fmt(t.value)}\${unit ? '<span style="font-size:.5em;color:#71717a;margin-left:4px">'+escH(unit)+'</span>' : ""}</div>
      <div class="qbadge \${qualityClass(t.quality)}">\${t.quality}</div></div>\`;
  },
  textDisplay(w, t) { return \`<div class="wbody">\${fmt(t.value)}</div>\`; },
  led(w, t) {
    const on = !!t.value;
    const c = on ? (w.config?.trueColor ?? "#22c55e") : (w.config?.falseColor ?? "#3f3f46");
    const lbl = on ? (w.config?.trueLabel ?? "ON") : (w.config?.falseLabel ?? "OFF");
    return \`<div class="wbody" style="gap:8px"><div style="width:22px;height:22px;border-radius:50%;background:\${escH(c)};box-shadow:\${on?'0 0 10px '+c+'88':'none'}"></div><div>\${escH(lbl)}</div></div>\`;
  },
  button(w, t) {
    const lbl   = escH(w.config?.label ?? "Press");
    const action = w.config?.action ?? "write";
    if (action === "navigate") {
      const target = w.config?.navigateTo ?? "";
      return \`<button class="hmi-btn" style="background:#4338ca;color:#fff" onclick="navigate('\${escH(target)}')">\${lbl}</button>\`;
    }
    const momentary = w.config?.momentary !== false;
    const on = !!t.value;
    const onV  = w.config?.onValue  ?? 1;
    const offV = w.config?.offValue ?? 0;
    if (momentary) {
      return \`<button class="hmi-btn" style="background:#2563eb;color:#fff"
        onpointerdown="writeTag('\${escH(w.binding??"")}',\${JSON.stringify(onV)})"
        onpointerup="writeTag('\${escH(w.binding??"")}',\${JSON.stringify(offV)})"
        onpointerleave="writeTag('\${escH(w.binding??"")}',\${JSON.stringify(offV)})">\${lbl}</button>\`;
    }
    const bg = on ? "#059669" : "#3f3f46";
    return \`<button class="hmi-btn" style="background:\${bg};color:#fff"
      onclick="writeTag('\${escH(w.binding??"")}',\${on ? JSON.stringify(offV) : JSON.stringify(onV)})">\${lbl}</button>\`;
  },
  numericInput(w, t) {
    const unit = escH(w.config?.unit ?? "");
    return \`<div class="wbody" style="flex-direction:column;align-items:flex-start">
      <div style="font-size:1.8em;font-weight:600;cursor:text" ondblclick="promptWrite('\${escH(w.binding??"")}',this)">\${fmt(t.value)}\${unit ? '<span style="font-size:.5em;color:#71717a;margin-left:4px">'+unit+'</span>' : ""}</div>
      <div class="qbadge">dbl-click to edit</div></div>\`;
  },
  tank(w, t) {
    const min = w.config?.min ?? 0, max = w.config?.max ?? 100;
    const v = typeof t.value === "number" ? t.value : 0;
    const pct = Math.max(0, Math.min(100, ((v-min)/(max-min))*100));
    let fill = "#3b82f6";
    (w.config?.thresholds ?? []).forEach(th => { if (v >= th.value) fill = th.color; });
    return \`<div class="wbody" style="gap:8px;align-items:flex-end">
      <div style="width:32px;height:100%;background:#27272a;border-radius:4px;overflow:hidden;position:relative;border:1px solid #3f3f46">
        <div style="position:absolute;bottom:0;left:0;right:0;height:\${pct}%;background:\${fill};opacity:.85;border-radius:0 0 4px 4px;transition:.5s"></div>
      </div>
      <div><div style="font-size:1.4em;font-weight:600">\${fmt(t.value)}</div>\${w.config?.unit ? '<div style="font-size:.7em;color:#71717a">'+escH(w.config.unit)+'</div>' : ""}</div>
    </div>\`;
  },
  setpoint(w, t) {
    const min = w.config?.min ?? 0, max = w.config?.max ?? 100, step = w.config?.step ?? 1;
    const v = typeof t.value === "number" ? t.value : min;
    return \`<div class="wbody" style="flex-direction:column;align-items:flex-start;width:100%">
      <div style="font-size:1.5em;font-weight:600">\${v.toFixed(step<1?1:0)} \${escH(w.config?.unit??'')}</div>
      <input type="range" min="\${min}" max="\${max}" step="\${step}" value="\${v}"
        onchange="writeTag('\${escH(w.binding??"")}',+this.value)"/>
      <div style="display:flex;justify-content:space-between;width:100%;font-size:8px;color:#52525b"><span>\${min}</span><span>\${max}</span></div>
    </div>\`;
  },
  multiState(w, t) {
    const states = w.config?.states ?? [{value:0,label:"OFF",color:"#27272a",textColor:"#71717a"},{value:1,label:"ON",color:"#14532d",textColor:"#4ade80"}];
    const raw = t.value;
    const match = states.find(s => String(s.value) === String(raw));
    const bg = match?.color ?? "#1c1c1e", clr = match?.textColor ?? "#71717a";
    const lbl = match?.label ?? (raw == null ? "—" : String(raw));
    return \`<div class="wbody" style="width:100%;height:100%;justify-content:center;background:\${bg};border-radius:6px">
      <span style="font-size:1.1em;font-weight:700;letter-spacing:.1em;color:\${clr}">\${escH(lbl)}</span></div>\`;
  },
  gauge(w, t) {
    const min = w.config?.min ?? 0, max = w.config?.max ?? 100;
    const v = typeof t.value === "number" ? t.value : min;
    const pct = Math.max(0,Math.min(1,(v-min)/(max-min)));
    const START = 225, SWEEP = 270;
    let arcColor = "#22c55e";
    (w.config?.thresholds ?? []).forEach(th => { if (v >= th.value) arcColor = th.color; });
    const CX=50,CY=60,R=36;
    function polar(deg,r=R){const rad=(deg-90)*Math.PI/180;return{x:CX+r*Math.cos(rad),y:CY+r*Math.sin(rad)};}
    function arc(startDeg,sweepDeg){const s=Math.max(.01,Math.min(sweepDeg,SWEEP-.01));const p0=polar(startDeg),p1=polar(startDeg+s);return \`M\${p0.x.toFixed(2)} \${p0.y.toFixed(2)} A\${R} \${R} 0 \${s>180?1:0} 1 \${p1.x.toFixed(2)} \${p1.y.toFixed(2)}\`;}
    const fillSweep=pct*SWEEP, needleAngle=START+fillSweep;
    return \`<div class="wbody" style="flex-direction:column;align-items:center">
      <svg viewBox="0 0 100 75" style="width:100%;max-height:100px">
        <path d="\${arc(START,SWEEP)}" fill="none" stroke="#27272a" stroke-width="7" stroke-linecap="round"/>
        \${fillSweep>.5?'<path d="'+arc(START,fillSweep)+'" fill="none" stroke="'+arcColor+'" stroke-width="7" stroke-linecap="round"/>':""}
        <g style="transform:rotate(\${needleAngle}deg);transform-origin:\${CX}px \${CY}px;transition:.3s">
          <line x1="\${CX}" y1="\${CY+6}" x2="\${CX}" y2="\${CY-32}" stroke="#e4e4e7" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <circle cx="\${CX}" cy="\${CY}" r="3" fill="#52525b"/>
        <text x="\${CX}" y="\${CY+14}" text-anchor="middle" font-size="8" fill="#e4e4e7" font-weight="600">\${typeof t.value==="number"?v.toFixed(1):"—"}\${w.config?.unit?" "+escH(w.config.unit):""}</text>
      </svg>
      <div class="qbadge \${qualityClass(t.quality)}" style="font-size:8px">\${t.quality}</div>
    </div>\`;
  },
  alarmBanner(w, t) {
    const alarms = window._clientAlarms ?? [];
    const max = w.config?.maxRows ?? 5;
    if (!alarms.length) return \`<div class="wbody" style="color:#22c55e;gap:6px;font-size:11px">● No active alarms</div>\`;
    const sevColor = {critical:"#ef4444",warning:"#f59e0b",info:"#3b82f6"};
    return alarms.slice(0,max).map(a =>
      \`<div style="display:flex;gap:6px;font-size:10px;border-bottom:1px solid #27272a;padding:2px 0;color:\${sevColor[a.severity]??"#a1a1aa"}">
        <span style="font-weight:700;min-width:56px">\${escH(a.severity.toUpperCase())}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escH(a.message)}</span>
      </div>\`
    ).join("");
  },
  image(w, t) {
    // lib: references can't be resolved without the IDE's image store; show placeholder
    const src = w.config?.src ?? "";
    const fit = w.config?.fit ?? w.config?.objectFit ?? "contain";
    if (!src || src.startsWith("lib:")) return \`<div class="wbody" style="color:#52525b;justify-content:center">🖼</div>\`;
    return \`<img src="\${escH(src)}" style="width:100%;height:100%;object-fit:\${escH(fit)}" draggable="false"/>\`;
  },
  symbol(w, t) {
    const stroke = w.config?.stroke ?? "#d4d4d8";
    // Symbols are embedded in the IDE bundle — for standalone export we render a placeholder
    return \`<div class="wbody" style="flex-direction:column;align-items:center;justify-content:center;gap:4px">
      <svg viewBox="0 0 64 64" width="60%" height="60%" fill="none" stroke="\${escH(stroke)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="12" y="12" width="40" height="40" rx="4"/>
        <line x1="12" y1="32" x2="52" y2="32"/><line x1="32" y1="12" x2="32" y2="52"/>
      </svg>
      \${w.config?.label ? '<div style="font-size:9px;color:#71717a">'+escH(w.config.label)+'</div>' : ""}
    </div>\`;
  },
};

function renderWidget(w) {
  const t  = getTag(w.binding);
  const lx = gx(w.x, w.w), ly = gy(w.y, w.h);
  const lbl = w.config?.label ?? w.type;
  const renderer = RENDERERS[w.type];
  const inner = renderer ? renderer(w, t) : \`<div class="wbody" style="color:#52525b">\${escH(w.type)}</div>\`;
  const bg = w.type === "button" ? "transparent" : "";
  return \`<div class="widget" id="w-\${w.id}" style="left:\${lx.left}px;top:\${ly.top}px;width:\${lx.width}px;height:\${ly.height}px;background:\${bg}">
    \${["button","led","multiState"].includes(w.type) ? "" : \`<div class="wlabel">\${escH(lbl)}</div>\`}
    \${inner}
  </div>\`;
}

function render() {
  // Build page tabs
  const tabsEl = document.getElementById("page-tabs");
  tabsEl.innerHTML = PROJECT.pages.map(p =>
    \`<button class="pagebtn\${p.id===activePage?" active":""}" onclick="navigate('\${p.id}')">\${escH(p.name)}</button>\`
  ).join(" ");

  // Build stage
  const page = PROJECT.pages.find(p => p.id === activePage);
  if (!page) return;

  const stage = document.getElementById("stage");
  const cv = document.getElementById("canvas");
  const vw = cv.clientWidth, vh = cv.clientHeight;

  // Calculate natural canvas size
  const maxCol = Math.max(12, ...page.widgets.map(w => w.x + w.w));
  const maxRow = Math.max(6,  ...page.widgets.map(w => w.y + w.h));
  const res = PROJECT.canvasResolution ?? { type: "dynamic" };
  let natW, natH;
  if (res.type === "fixed") { natW = res.width; natH = res.height; }
  else { natW = maxCol*(COL_W+GAP)-GAP; natH = maxRow*(ROW_H+GAP)-GAP; }
  const scale = Math.min(vw/natW, vh/natH, 1);

  stage.style.width  = natW + "px";
  stage.style.height = natH + "px";
  stage.style.transform = \`scale(\${scale})\`;
  stage.style.transformOrigin = "center center";
  stage.style.background = page.backgroundColor ?? "#09090b";
  stage.style.borderRadius = "4px";

  stage.innerHTML = page.widgets.map(renderWidget).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────
function escH(s) { return String(s??'').replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function promptWrite(binding, el) {
  const val = prompt("New value:", el.textContent.trim());
  if (val === null) return;
  const n = parseFloat(val);
  writeTag(binding, isNaN(n) ? val : n);
}

// Poll alarms from runtime every 5s
async function pollAlarms() {
  const base = document.getElementById("target-input").value.trim();
  if (!base) return;
  try {
    const r = await fetch(base + "/api/v1/alarms");
    if (!r.ok) return;
    const data = await r.json();
    window._clientAlarms = (data?.alarms ?? []).filter(a => a.active);
    render();
  } catch {}
}

// ── Boot ──────────────────────────────────────────────────────────────────
window.writeTag   = writeTag;
window.navigate   = navigate;
window.promptWrite = promptWrite;
window._clientAlarms = [];
render();
reconnect();
setInterval(pollAlarms, 5000);
window.addEventListener("resize", render);
</script>
</body>
</html>`;
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
