// Whether a runtime answers at the target, and whether live values are streaming from it. The header and
// the status bar both show this, so it is asked once: the check runs while at least one of them is mounted.
import { useEffect } from "react";
import { create } from "zustand";
import { tagStoreClient } from "./tagStoreClient";
import { apiBase } from "./runtimeTarget";
import { authHeader } from "./runtimeAuth";

export type Reach = {
  /** null until the first answer. A 401 counts as reachable: something is there, and it wants a login. */
  reachable: boolean | null;
  /** The live-data connection is open (it only opens when a screen reads a tag from a datasource). */
  streaming: boolean;
  /** The newest project format the runtime reads, when it says (null: not known, or an older runtime). */
  targetFormat: number | null;
};

export const useReach = create<Reach>(() => ({ reachable: null, streaming: false, targetFormat: null }));

const PROBE_MS = 4000;
const STREAM_MS = 1500;

let users = 0;
let timers: ReturnType<typeof setInterval>[] = [];

async function probe(): Promise<void> {
  try {
    // One request: a runtime answers "alive" without a login, and says which project format it reads.
    const r = await fetch(`${apiBase}/api/v1/alive`, { headers: authHeader(apiBase) });
    const body = r.ok ? ((await r.json().catch(() => ({}))) as { schemaVersion?: unknown } | null) : null;
    useReach.setState({ reachable: r.ok || r.status === 401, targetFormat: typeof body?.schemaVersion === "number" ? body.schemaVersion : null });
  } catch {
    useReach.setState({ reachable: false, targetFormat: null });
  }
}

function start(): void {
  void probe();
  useReach.setState({ streaming: tagStoreClient.isConnected() });
  timers = [
    setInterval(() => void probe(), PROBE_MS),
    setInterval(() => useReach.setState({ streaming: tagStoreClient.isConnected() }), STREAM_MS),
  ];
}

/** The runtime's reachability, kept current while the calling component is mounted. */
export function useRuntimeReach(): Reach {
  useEffect(() => {
    if (users++ === 0) start();
    return () => {
      if (--users === 0) { timers.forEach(clearInterval); timers = []; }
    };
  }, []);
  return useReach();
}

/** What to say about the runtime in a few words. */
export function reachLabel(r: Pick<Reach, "reachable" | "streaming">): string {
  return r.reachable === false ? "No runtime" : r.reachable ? (r.streaming ? "Runtime connected" : "Runtime ready") : "Checking…";
}
