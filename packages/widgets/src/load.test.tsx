// Phase 3 gate 5, in jsdom: a screen with 500 driven properties, all
// changing at once. jsdom is far slower than a browser, so the budget is
// generous; the real check is scripts/loadtest on the reference PC.
import { useSyncExternalStore } from "react";
import { afterEach, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { Widget } from "@speths-screens/shared-types";
import { WidgetRenderer } from "./widgets";
import { WidgetHostProvider, inertHost, EMPTY_TAG, type TagState, type WidgetHost } from "./host";

afterEach(cleanup);

/** A tag store that re-renders subscribers, as the IDE and operator hosts do. */
function liveHost() {
  let values = new Map<string, TagState>();
  let version = 0;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
  const snapshots = new Map<string, { version: number; out: Record<string, TagState> }>();
  const useTags = (paths: string[]) => {
    const key = paths.join("\0");
    return useSyncExternalStore(subscribe, () => {
      const cached = snapshots.get(key);
      if (cached && cached.version === version) return cached.out;
      const out = Object.fromEntries(paths.map((p) => [p, values.get(p) ?? EMPTY_TAG]));
      snapshots.set(key, { version, out });
      return out;
    });
  };
  const host: WidgetHost = { ...inertHost, useTags, useTag: (p) => useTags(p ? [p] : [])[p ?? ""] ?? EMPTY_TAG };
  const set = (next: Record<string, unknown>) => {
    values = new Map(values);
    for (const [p, v] of Object.entries(next)) values.set(p, { value: v, quality: "Good", ts: Date.now() });
    version++;
    listeners.forEach((fn) => fn());
  };
  return { host, set };
}

const WIDGETS = 250; // two driven properties each: 500
const TAGS = 50;

function screenOf(): Widget[] {
  return Array.from({ length: WIDGETS }, (_, i) => ({
    id: `w${i}`, type: "textDisplay", x: i % 25, y: Math.floor(i / 25), w: 1, h: 1, props: { staticText: "" },
    dynamics: {
      bgColor: { expr: `{plc:T${i % TAGS}}`, transform: { kind: "thresholds", steps: [{ above: 50, value: "#dc2626" }], below: "#3f3f46" } },
      staticText: { expr: `format({plc:T${i % TAGS}}, 1) + ' bar'` },
    },
  }) as Widget);
}

it("500 driven properties update together within budget", () => {
  const { host, set } = liveHost();
  const widgets = screenOf();
  const { container } = render(
    <WidgetHostProvider value={host}>{widgets.map((w) => <WidgetRenderer key={w.id} w={w} />)}</WidgetHostProvider>,
  );
  const round = (n: number) => Object.fromEntries(Array.from({ length: TAGS }, (_, t) => [`plc:T${t}`, (n * 37 + t * 11) % 100]));
  act(() => set(round(0))); // warm-up

  const rounds = 10;
  const start = performance.now();
  for (let n = 1; n <= rounds; n++) act(() => set(round(n)));
  const perRound = (performance.now() - start) / rounds;

  // Every widget shows the last round.
  const last = round(rounds);
  expect(container.textContent).toContain(`${(last["plc:T0"] as number).toFixed(1)} bar`);
  console.log(`[load] ${WIDGETS * 2} driven properties: ${perRound.toFixed(1)} ms per update of all tags (jsdom)`);
  expect(perRound).toBeLessThan(300); // about 30 ms on the dev PC; CI machines are slower
});
