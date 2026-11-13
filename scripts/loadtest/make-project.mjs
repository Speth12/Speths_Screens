// Phase 3 gate 5 on the reference PC: a screen with 500 driven properties
// (250 widgets, each driving bgColor and staticText) whose tags change once a
// second. Run from the repository root:
//
//   node scripts/loadtest/make-project.mjs [out.json]      # default soak-runs/loadtest.screens.json
//   go run ./cmd/speths-screens --mode=dev --project=soak-runs/loadtest.screens.json
//
// Open the operator screen (http://127.0.0.1:3001), then in Chrome DevTools
// open Rendering and turn on "Frame rendering stats", or record 30 s in the
// Performance tab. The gate: 60 frames a second while the values change.
//
// The tags come from a virtual datasource, so no PLC is needed: tick counts
// up by 0.2 every 200 ms (the driver's interval) and sec is floor(tick), so
// the 50 value tags change once a second.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const out = process.argv[2] ?? "soak-runs/loadtest.screens.json";
const WIDGETS = 250, TAGS = 50, COLS = 25, W = 76, H = 108;

const tags = [
  { path: "tick", expr: "(good({load:tick}) ? {load:tick} : 0) + 0.2" },
  { path: "sec", expr: "floor({load:tick})" },
  ...Array.from({ length: TAGS }, (_, t) => ({ path: `v${t}`, expr: `({load:sec} * 7 + ${t * 13}) % 100` })),
];

const widgets = Array.from({ length: WIDGETS }, (_, i) => {
  const tag = `{load:v${i % TAGS}}`;
  return {
    id: `w${i}`, type: "textDisplay",
    x: (i % COLS) * W, y: Math.floor(i / COLS) * H, w: W - 4, h: H - 4,
    props: { staticText: "", label: `W${i}` },
    dynamics: {
      bgColor: { expr: tag, transform: { kind: "thresholds", steps: [{ above: 70, value: "#7f1d1d" }, { above: 90, value: "#dc2626" }], below: "#27272a" } },
      staticText: { expr: `format(${tag}, 0) + ' %'` },
    },
  };
});

const project = {
  schemaVersion: 7,
  version: "1.0.0",
  name: "Load test: 500 driven properties",
  canvasSnap: "pixel",
  canvasResolution: { type: "fixed", width: COLS * W, height: Math.ceil(WIDGETS / COLS) * H },
  datasources: [{ id: "load", type: "virtual", label: "Load test", config: { tags } }],
  pages: [{ id: "load", name: "Load", widgets }],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + "\n");
console.log(`wrote ${out}: ${WIDGETS} widgets, ${WIDGETS * 2} driven properties, ${TAGS} tags changing once a second`);
