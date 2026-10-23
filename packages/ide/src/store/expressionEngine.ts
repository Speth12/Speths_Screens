import { useProject } from "./projectStore";
import { tagStoreClient } from "./tagStoreClient";
import { virtualTagStore } from "./virtualTagStore";

type TagFormula = { path: string; formula: string };
type Unsub = () => void;

const BINDING_RE = /\{([^}]+)\}/g;

function evalFormula(formula: string, values: Map<string, number>): number | null {
  let expr = formula;
  for (const [ref, val] of values) {
    const safe = ref.replace(/[^a-zA-Z0-9_]/g, "_");
    expr = expr.replaceAll(`{${ref}}`, String(val));
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr});`)() as unknown;
    const n = typeof result === "number" ? result : parseFloat(String(result));
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

const _dsUnsubs = new Map<string, Unsub[]>();

function setupDs(dsId: string, tags: TagFormula[]) {
  const old = _dsUnsubs.get(dsId);
  if (old) { old.forEach((u) => u()); }
  const unsubs: Unsub[] = [];

  for (const tag of tags) {
    const refs: string[] = [];
    let m: RegExpExecArray | null;
    BINDING_RE.lastIndex = 0;
    while ((m = BINDING_RE.exec(tag.formula)) !== null) {
      refs.push(m[1]!);
    }

    const values = new Map<string, number>();
    const outputPath = `${dsId}:${tag.path}`;

    const recompute = () => {
      const result = evalFormula(tag.formula, values);
      if (result !== null) virtualTagStore.set(outputPath, result);
    };

    for (const ref of refs) {
      const u = tagStoreClient.subscribe(ref, (s) => {
        const n = typeof s.value === "number" ? s.value : parseFloat(String(s.value));
        if (!isNaN(n)) values.set(ref, n);
        recompute();
      });
      unsubs.push(u);
    }
  }

  _dsUnsubs.set(dsId, unsubs);
}

function teardownDs(dsId: string) {
  const old = _dsUnsubs.get(dsId);
  if (old) { old.forEach((u) => u()); _dsUnsubs.delete(dsId); }
}

let _lastState: string = "";

export function bootExpressionEngine(): void {
  useProject.subscribe((state) => {
    const vds = state.project.datasources.filter((d) => d.type === "virtual");
    const key = JSON.stringify(vds.map((d) => ({ id: d.id, tags: d.config.tags })));
    if (key === _lastState) return;
    _lastState = key;

    const activeIds = new Set(vds.map((d) => d.id));
    for (const id of _dsUnsubs.keys()) {
      if (!activeIds.has(id)) teardownDs(id);
    }

    for (const ds of vds) {
      if (!ds.config.tags) continue;
      try {
        const tags = JSON.parse(ds.config.tags as string) as TagFormula[];
        if (Array.isArray(tags)) setupDs(ds.id, tags);
      } catch { /* ignore bad JSON */ }
    }
  });
}
