// The page's side of a page script (Phase 4, decision 5): the script runs in
// a Web Worker built from a Blob (no eval or new Function on the page), sees
// tag values mirrored into it so readTag stays synchronous, and writes
// through the page's write function, which answers with the write
// pipeline's result. A worker that misses three 1 s heartbeats is stopped.

import { workerMain } from "./worker";
import type { HostMessage, TagState, WorkerLike, WorkerMessage, WriteResult } from "./protocol";

/** The names a page script sees, in the order they are unpacked. */
export const PAGE_NAMES = [
  "readTag", "quality", "writeTag", "log", "emit",
  "navigate", "every", "after", "onTagChange", "on", "onTimer", "afterDelay",
] as const;

/** Heartbeat timing; tests may lower them. */
export const HEARTBEAT = { everyMs: 1000, missed: 3 };

/** What the page gives a page script. */
export interface PageHost {
  /** The tag's state now, if the page has it. */
  get(path: string): TagState | undefined;
  /** Call fn on each change of these tags; returns the way to stop. */
  watch(paths: string[], fn: (path: string, state: TagState) => void): () => void;
  write(path: string, value: unknown): Promise<WriteResult>;
  navigate(page: string): void;
  log(line: string): void;
  emit(type: string, payload: unknown): void;
  /** Call fn on each page event of this type; returns the way to stop. */
  on(type: string, fn: (payload: unknown) => void): () => void;
  /** The script stopped, or a run threw; the message says why. */
  error(message: string): void;
  /** Makes the worker; the default is a Blob worker. Tests pass a fake. */
  createWorker?(source: string): WorkerLike;
}

/** The worker's source: the worker side, then the script as the body of an
 *  async function that gets the API. */
export function workerSource(script: string): { source: string; lineOffset: number } {
  const head = `"use strict";\n(${workerMain.toString()})(self, async function (api) {\n"use strict";\nconst { ${PAGE_NAMES.join(", ")} } = api;\n`;
  return { source: head + script + "\n});\n", lineOffset: head.split("\n").length - 1 };
}

function blobWorker(source: string): WorkerLike {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  return w as unknown as WorkerLike;
}

/** Starts a page script; the returned function stops it (page closed). */
export function startPageScript(script: string, host: PageHost): () => void {
  const { source, lineOffset } = workerSource(script);
  const worker = (host.createWorker ?? blobWorker)(source);
  const stops: (() => void)[] = [];
  let stopped = false;
  let missed = 0;
  const send = (m: HostMessage) => { if (!stopped) worker.postMessage(m); };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(beat);
    for (const s of stops) s();
    worker.terminate();
  };

  const beat = setInterval(() => {
    if (missed >= HEARTBEAT.missed) {
      host.error(`page script stopped: it did not answer for ${HEARTBEAT.missed} s (an endless loop?)`);
      stop();
      return;
    }
    missed++;
    send({ t: "ping" });
  }, HEARTBEAT.everyMs);

  worker.onerror = (e) => {
    const line = e.lineno ? `line ${e.lineno - lineOffset}: ` : "";
    host.error(`page script: ${line}${e.message}`);
  };
  worker.onmessage = (e: { data: WorkerMessage }) => {
    const m = e.data;
    switch (m.t) {
      case "pong":
        missed = 0;
        break;
      case "watch": {
        const now: Record<string, TagState> = {};
        for (const p of m.paths) {
          const s = host.get(p);
          if (s) now[p] = s;
        }
        if (Object.keys(now).length) send({ t: "tags", tags: now });
        stops.push(host.watch(m.paths, (path, state) => send({ t: "tags", tags: { [path]: state } })));
        break;
      }
      case "write":
        host.write(m.path, m.value).then(
          (result) => send({ t: "writeResult", id: m.id, result }),
          (err: unknown) => send({ t: "writeResult", id: m.id, result: { status: "failed", reason: String(err) } }),
        );
        break;
      case "log":
        host.log(m.line);
        break;
      case "emit":
        host.emit(m.type, m.payload);
        break;
      case "on":
        stops.push(host.on(m.type, (payload) => send({ t: "event", type: m.type, payload })));
        break;
      case "navigate":
        host.navigate(m.page);
        break;
      case "error":
        host.error(`page script: ${m.message}`);
        break;
    }
  };
  return stop;
}
