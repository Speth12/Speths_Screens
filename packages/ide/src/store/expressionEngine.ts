// Computes the project's calculated tags (virtual datasources) in the IDE, with
// the same expression language as the runtime's virtual driver.
import { compile, type Input } from "@speths-screens/expr";
import type { CalculatedTag } from "@speths-screens/shared-types";
import { useProject } from "./projectStore";
import { tagStoreClient } from "./tagStoreClient";
import { virtualTagStore } from "./virtualTagStore";

type Unsub = () => void;

/** How often a tag is evaluated at most, as the runtime's virtual driver does.
 *  It also keeps a tag that reads itself from evaluating in a loop. */
export const EVAL_INTERVAL_MS = 200;

const _dsUnsubs = new Map<string, Unsub[]>();

function setupDs(dsId: string, tags: CalculatedTag[]) {
  const old = _dsUnsubs.get(dsId);
  if (old) { old.forEach((u) => u()); }
  const unsubs: Unsub[] = [];

  for (const tag of tags) {
    const outputPath = `${dsId}:${tag.path}`;
    const c = compile(tag.expr);
    if (!c.ok) {
      virtualTagStore.set(outputPath, undefined, "Bad", c.error);
      continue;
    }
    const inputs = new Map<string, Input>();
    // A Bad result keeps the last good value, as the runtime does.
    let last: unknown = undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      timer = undefined;
      const r = c.expr.eval({ tag: (ref) => inputs.get(ref) });
      if (r.ok) {
        last = r.value;
        virtualTagStore.set(outputPath, r.value);
      } else {
        virtualTagStore.set(outputPath, last, "Bad", r.reason);
      }
    };
    const schedule = () => { timer ??= setTimeout(evaluate, EVAL_INTERVAL_MS); };

    for (const ref of c.expr.refs) {
      unsubs.push(tagStoreClient.subscribe(ref, (s) => {
        inputs.set(ref, { value: s.value, quality: s.quality });
        schedule();
      }));
    }
    unsubs.push(() => { if (timer !== undefined) clearTimeout(timer); });
    schedule(); // first value, also for tags with no inputs
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

    for (const ds of vds) setupDs(ds.id, ds.config.tags ?? []);
  });
}
