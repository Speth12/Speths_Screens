// Writes packages/widgets/src/iconData.ts: the drawings of the icons a screen can use beyond the first
// sixteen (which are drawn by hand in icons.tsx), taken from the Lucide icon set (ISC license, the
// same set the editor uses through lucide-react).
//
//   node scripts/icons/build.mjs
//
// To add an icon: add its name here (and to PageIcon in schema.json, then npm run gen:types). A name
// is ours; the second entry is Lucide's name for it, with others to try for older or newer versions.
// The result is committed, so the widget library needs no icon package.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lucide = resolve(root, "node_modules/lucide-react/dist/esm/icons");

const ICONS = [
  // controls
  ["play", "play"], ["pause", "pause"], ["stopSquare", "square"], ["power", "power"], ["refresh", "refresh-cw"], ["undoTurn", "rotate-ccw"],
  ["checkMark", "check"], ["cross", "x"], ["plus", "plus"], ["minus", "minus"],
  ["arrowUp", "arrow-up"], ["arrowDown", "arrow-down"], ["arrowLeft", "arrow-left"], ["arrowRight", "arrow-right"],
  ["chevronUp", "chevron-up"], ["chevronDown", "chevron-down"], ["chevronLeft", "chevron-left"], ["chevronRight", "chevron-right"],
  ["menuBars", "menu"], ["expand", "maximize"], ["sliders", "sliders-horizontal"], ["funnel", "funnel", "filter"], ["search", "search"],
  // state
  ["bell", "bell"], ["bellOff", "bell-off"], ["caution", "triangle-alert", "alert-triangle"], ["infoCircle", "info"],
  ["helpCircle", "circle-question-mark", "circle-help", "help-circle"], ["okCircle", "circle-check", "check-circle"], ["failCircle", "circle-x", "x-circle"],
  ["padlock", "lock"], ["padlockOpen", "lock-open", "unlock"], ["keyIcon", "key"], ["eye", "eye"], ["eyeOff", "eye-off"], ["shield", "shield"],
  // process
  ["thermometer", "thermometer"], ["droplet", "droplet"], ["wind", "wind"], ["flame", "flame"], ["snowflake", "snowflake"], ["fanBlades", "fan"],
  ["speedometer", "gauge"], ["weighScale", "scale"], ["ruler", "ruler"], ["beaker", "beaker"], ["factory", "factory"], ["conveyor", "truck"],
  ["crate", "package"], ["wrench", "wrench"], ["hammer", "hammer"], ["cog", "cog"], ["recycle", "recycle"], ["leaf", "leaf"], ["lightbulb", "lightbulb"],
  // power and data
  ["battery", "battery-medium", "battery"], ["plugIcon", "plug"], ["wifi", "wifi"], ["signalBars", "signal"], ["chip", "cpu"], ["serverRack", "server"],
  ["databaseIcon", "database"], ["networkIcon", "network"], ["layers", "layers"], ["activity", "activity"],
  ["barChart", "chart-column", "bar-chart-3"], ["lineChart", "chart-line", "line-chart"], ["pieChart", "chart-pie", "pie-chart"],
  // time, files, people
  ["calendar", "calendar"], ["timer", "timer"], ["clockFace", "clock"], ["pastTime", "history"], ["saveDisk", "save"], ["download", "download"], ["upload", "upload"],
  ["document", "file-text"], ["folder", "folder"], ["printer", "printer"], ["camera", "camera"], ["phoneHandset", "phone"], ["mail", "mail"],
  ["people", "users"], ["signIn", "log-in"], ["signOut", "log-out"], ["star", "star"], ["flagIcon", "flag"], ["mapPin", "map-pin"],
  ["sun", "sun"], ["moon", "moon"], ["speaker", "volume-2"], ["speakerOff", "volume-x"], ["trashCan", "trash-2"], ["pencil", "pencil"], ["chainLink", "link"],
];

const KEEP = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points"]);
const out = {};
for (const [name, ...tries] of ICONS) {
  const file = tries.map((t) => resolve(lucide, `${t}.mjs`)).find(existsSync);
  if (!file) throw new Error(`no Lucide icon for ${name} (tried ${tries.join(", ")})`);
  let src = readFileSync(file, "utf8");
  // A renamed icon's file only points at its new name.
  for (let hops = 0; hops < 3; hops++) {
    const alias = /export \{ default \} from '\.\/([\w-]+\.mjs)'/.exec(src);
    if (!alias) break;
    src = readFileSync(resolve(lucide, alias[1]), "utf8");
  }
  // The drawing is the list after "node:"; take it by matching its brackets (no text in it holds one).
  const from = src.indexOf("[", src.indexOf("node:"));
  let depth = 0, to = from;
  for (; to < src.length; to++) { if (src[to] === "[") depth++; else if (src[to] === "]" && --depth === 0) break; }
  if (from < 0 || depth !== 0) throw new Error(`cannot read the drawing in ${file}`);
  // It is plain data (tag and attributes) written with bare keys; give the keys quotes and read it as JSON.
  const nodes = JSON.parse(src.slice(from, to + 1).replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":'));
  out[name] = nodes.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([k]) => KEEP.has(k)))]);
}

const names = Object.keys(out);
writeFileSync(resolve(root, "packages/widgets/src/iconData.ts"),
  `// Written by scripts/icons/build.mjs from the Lucide icon set (https://lucide.dev), ISC license:\n` +
  `// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other\n` +
  `// copyright (c) for Lucide are held by Lucide Contributors 2026. DO NOT EDIT.\n` +
  `// Each icon is a list of SVG elements in a 24 by 24 box, drawn as lines in the text color.\n` +
  `export type IconNode = readonly [tag: string, attrs: Readonly<Record<string, string | number>>];\n` +
  `export const ICON_NODES: Record<string, readonly IconNode[]> = {\n` +
  names.map((n) => `  ${n}: ${JSON.stringify(out[n])},\n`).join("") + `};\n`);
console.log(`${names.length} icons written`);
console.log(names.map((n) => `"${n}"`).join(", "));
