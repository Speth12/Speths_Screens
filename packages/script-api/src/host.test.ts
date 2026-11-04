import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT, PAGE_NAMES, startPageScript, workerSource } from "./host";
import type { PageHost } from "./host";
import type { HostMessage, TagState, WorkerLike, WorkerMessage, WriteResult } from "./protocol";

/** A worker that runs the real worker source in a vm context whose global
 *  object is the worker scope, as in a browser worker. */
function vmWorker(source: string): WorkerLike {
  const w: WorkerLike = { postMessage: () => {}, onmessage: null, onerror: null, terminate: () => { dead = true; } };
  let dead = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const scope: Record<string, unknown> = {
    fetch: () => "network",
    XMLHttpRequest: class {},
    WebSocket: class {},
    importScripts: () => {},
    setInterval: (fn: () => void, ms: number) => { const t = setInterval(() => !dead && fn(), ms); timers.push(t); return t; },
    setTimeout: (fn: () => void, ms: number) => { const t = setTimeout(() => !dead && fn(), ms); timers.push(t); return t; },
    postMessage: (m: WorkerMessage) => setTimeout(() => !dead && w.onmessage?.({ data: m }), 0),
    onmessage: null,
  };
  scope.self = scope;
  w.postMessage = (m: HostMessage) => setTimeout(() => !dead && (scope.onmessage as ((e: { data: HostMessage }) => void) | null)?.({ data: m }), 0);
  const terminate = w.terminate;
  w.terminate = () => { terminate(); timers.forEach((t) => clearInterval(t)); };
  vm.createContext(scope);
  setTimeout(() => {
    try {
      vm.runInContext(source, scope, { filename: "page-script" });
    } catch (err) {
      w.onerror?.({ message: (err as Error).message, lineno: lineOf(err as Error) });
    }
  }, 0);
  return w;
}

function lineOf(err: Error): number | undefined {
  const m = /page-script:(\d+)/.exec(err.stack ?? "");
  return m ? Number(m[1]) : undefined;
}

function makeHost(over: Partial<PageHost> = {}) {
  const tags = new Map<string, TagState>();
  const watchers: ((path: string, s: TagState) => void)[] = [];
  const out = { logs: [] as string[], errors: [] as string[], writes: [] as string[], emits: [] as string[], pages: [] as string[] };
  const host: PageHost = {
    get: (p) => tags.get(p),
    watch: (paths, fn) => {
      const f = (p: string, s: TagState) => paths.includes(p) && fn(p, s);
      watchers.push(f);
      return () => watchers.splice(watchers.indexOf(f), 1);
    },
    write: async (p, v): Promise<WriteResult> => {
      out.writes.push(`${p}=${JSON.stringify(v)}`);
      return p.startsWith("plc:RO") ? { status: "failed", reason: "not writable" } : { status: "confirmed" };
    },
    navigate: (p) => out.pages.push(p),
    log: (l) => out.logs.push(l),
    emit: (t, p) => out.emits.push(`${t} ${JSON.stringify(p)}`),
    on: () => () => {},
    error: (m) => out.errors.push(m),
    createWorker: vmWorker,
    ...over,
  };
  const set = (p: string, value: unknown, quality = "Good") => {
    tags.set(p, { value, quality });
    for (const w of [...watchers]) w(p, { value, quality });
  };
  return { host, out, set };
}

const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  vi.useRealTimers();
});
function start(script: string, host: PageHost) {
  const stop = startPageScript(script, host);
  stops.push(stop);
  return stop;
}

describe("page scripts in a worker", () => {
  it("reads mirrored tags, writes and awaits the result, logs and navigates", async () => {
    const { host, out, set } = makeHost();
    set("plc:T", 21.5);
    start(`
      const t = readTag('plc:T');
      log('first', t, quality('plc:T'));
      onTagChange('plc:T', (v) => log('changed', v));
      const r = await writeTag('plc:SP', 40);
      const ro = await writeTag('plc:RO', 1);
      log('writes', r.status, ro.status, ro.reason);
      navigate('Alarms');
    `, host);
    await vi.waitFor(() => expect(out.pages).toEqual(["Alarms"]));
    // The first read had no mirrored value yet: it asks for the tag and gets null.
    expect(out.logs[0]).toBe("first null Bad");
    expect(out.logs).toContain("writes confirmed failed not writable");
    expect(out.writes).toEqual(["plc:SP=40", "plc:RO=1"]);
    set("plc:T", 22);
    await vi.waitFor(() => expect(out.logs).toContain("changed 22"));
  });

  it("has no network: fetch, XMLHttpRequest, WebSocket and importScripts are gone", async () => {
    const { host, out } = makeHost();
    start(`log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, typeof self.fetch);`, host);
    await vi.waitFor(() => expect(out.logs).toEqual(["undefined undefined undefined undefined undefined"]));
  });

  it("every, after and the deprecated aliases run", async () => {
    const { host, out } = makeHost();
    start(`
      let n = 0;
      every(20, () => { n++; if (n === 3) log('every 3'); });
      after(30, () => log('after'));
      onTimer(1000, () => {});
      afterDelay(10, () => log('afterDelay'));
    `, host);
    await vi.waitFor(() => expect(out.logs).toEqual(expect.arrayContaining(["every 3", "after", "afterDelay"])));
  });

  it("reports errors with the script's own line numbers", async () => {
    const { host, out } = makeHost();
    start(`log('ok');\nif (x {`, host);
    await vi.waitFor(() => expect(out.errors.length).toBe(1));
    expect(out.errors[0]).toMatch(/^page script: line 2: /);
  });

  it("a thrown error in a callback is reported and the script goes on", async () => {
    const { host, out } = makeHost();
    start(`after(5, () => { throw new Error('boom'); }); after(20, () => log('still here'));`, host);
    await vi.waitFor(() => expect(out.logs).toEqual(["still here"]));
    expect(out.errors).toEqual(["page script: boom"]);
  });

  it("stopping ends the timers", async () => {
    const { host, out } = makeHost();
    const stop = start(`every(10, () => log('tick'));`, host);
    await vi.waitFor(() => expect(out.logs.length).toBeGreaterThan(0));
    stop();
    const n = out.logs.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(out.logs.length).toBe(n);
  });
});

describe("heartbeat", () => {
  it("a worker that stops answering is terminated after three missed beats", () => {
    vi.useFakeTimers();
    let terminated = false;
    const silent: WorkerLike = { postMessage: () => {}, onmessage: null, onerror: null, terminate: () => { terminated = true; } };
    const { host, out } = makeHost({ createWorker: () => silent });
    start("while (true) {}", host);
    vi.advanceTimersByTime(HEARTBEAT.everyMs * HEARTBEAT.missed);
    expect(terminated).toBe(false);
    vi.advanceTimersByTime(HEARTBEAT.everyMs);
    expect(terminated).toBe(true);
    expect(out.errors).toEqual(["page script stopped: it did not answer for 3 s (an endless loop?)"]);
  });

  it("a worker that answers keeps running", () => {
    vi.useFakeTimers();
    let terminated = false;
    const w: WorkerLike = {
      postMessage: (m) => { if (m.t === "ping") w.onmessage?.({ data: { t: "pong" } }); },
      onmessage: null, onerror: null, terminate: () => { terminated = true; },
    };
    const { host } = makeHost({ createWorker: () => w });
    start("", host);
    vi.advanceTimersByTime(HEARTBEAT.everyMs * 10);
    expect(terminated).toBe(false);
  });
});

it("the page names are the shared definition's", () => {
  const dts = readFileSync(fileURLToPath(new URL("../api.d.ts", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  const members = (iface: string) => {
    const body = dts.slice(dts.indexOf(`export interface ${iface} {`)).split("\n}")[0]!;
    return [...body.matchAll(/^ {2}([A-Za-z_]\w*)\s*[(:]/gm)].map((m) => m[1]!);
  };
  expect([...PAGE_NAMES].sort()).toEqual([...members("CommonApi"), ...members("PageScriptApi")].sort());
});

it("the worker source parses, with the script on its own lines", () => {
  const { source, lineOffset } = workerSource("log(1)");
  expect(() => new vm.Script(source)).not.toThrow();
  expect(source.split("\n")[lineOffset]).toBe("log(1)");
});
