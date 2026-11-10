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
};

export const useReach = create<Reach>(() => ({ reachable: null, streaming: false }));

const PROBE_MS = 4000;
const STREAM_MS = 1500;

let users = 0;
let timers: ReturnType<typeof setInterval>[] = [];

async function probe(): Promise<void> {
  try {
    const r = await fetch(`${apiBase}/api/v1/datasources`, { headers: authHeader(apiBase) });
    useReach.setState({ reachable: r.ok || r.status === 401 });
  } catch {
    useReach.setState({ reachable: false });
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
export function reachLabel(r: Reach): string {
  return r.reachable === false ? "No runtime" : r.reachable ? (r.streaming ? "Runtime connected" : "Runtime ready") : "Checking…";
}
