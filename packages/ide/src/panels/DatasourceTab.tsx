// One datasource in full: whether it is connected and why not, its connection settings (editable), the certificate it
// is pinned to, what in the project uses it, and what its connection has done since the IDE was opened.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalculatedTag, CERTCheck, Datasource } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { apiFetch } from "../store/runtimeAuth";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";
import { datasourceUsage } from "../store/usage";
import { CertCheckField, needsCertPin, testDatasource, type TestStatus } from "./CertCheck";
import { CalculatedRowsEditor, MemoryRowsEditor, memoryRow, memoryTag, type MemoryRow } from "./DatasourceForms";
import { TagScannerModal } from "./TagScannerModal";

type Status = { connected: boolean; lastError: string; tagCount: number };
type LogLine = { at: number; text: string };

const TYPE_NAME: Record<string, string> = {
  opcua: "OPC UA", mbtcp: "Modbus TCP", mqtt: "MQTT", rest: "PLCnext REST", virtual: "Computed tags", memory: "Memory tags",
};
const POLL_MS = 3000;
const MAX_LOG = 40;

/** The runtime's view of a datasource, polled, and a log of what changed while this was open. */
export function useConnection(dsId: string) {
  const [status, setStatus] = useState<Status | null | undefined>(undefined); // undefined: not asked yet; null: no answer
  const [checkedAt, setCheckedAt] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const last = useRef<string>("");

  useEffect(() => {
    let live = true;
    last.current = "";
    setLog([]);
    setStatus(undefined);
    const poll = async () => {
      let next: Status | null = null;
      try {
        const r = await apiFetch(`/api/v1/datasources/${encodeURIComponent(dsId)}/status`);
        next = r.ok ? ((await r.json()) as Status) : null;
      } catch { next = null; }
      if (!live) return;
      setStatus(next);
      setCheckedAt(Date.now());
      const text = next === null ? "The runtime does not know this datasource (not deployed yet, or the runtime is not running)"
        : next.connected ? "Connected" : `Not connected${next.lastError ? `: ${next.lastError}` : ""}`;
      if (text !== last.current) {
        last.current = text;
        setLog((l) => [{ at: Date.now(), text }, ...l].slice(0, MAX_LOG));
      }
    };
    void poll();
    const iv = setInterval(() => void poll(), POLL_MS);
    return () => { live = false; clearInterval(iv); };
  }, [dsId]);

  return { status, checkedAt, log };
}

type Draft = {
  host: string; port: string; basePath: string; slaveId: string; bearerToken: string;
  securityMode: string; securityPolicy: string; username: string; password: string;
  certCheck: CERTCheck; certFp: string; memory: MemoryRow[]; calc: CalculatedTag[];
};

function draftOf(ds: Datasource): Draft {
  const c = ds.config as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  let host = str("host"), port = c.port !== undefined ? String(c.port) : "";
  const endpoint = str("endpoint");
  if (ds.type === "opcua") {
    const m = /^opc\.tcp:\/\/([^:/]+)(?::(\d+))?/.exec(endpoint);
    host = m?.[1] ?? ""; port = m?.[2] ?? "4840";
  } else if (ds.type === "rest") {
    host = endpoint.replace(/^https?:\/\//, "");
  }
  return {
    host, port, basePath: str("basePath") || "/_pxc_api/v1.14", slaveId: c.slaveId !== undefined ? String(c.slaveId) : "1", bearerToken: str("bearerToken"),
    securityMode: str("securityMode") || "None", securityPolicy: str("securityPolicy") || "None", username: str("username"), password: "",
    certCheck: (str("certCheck") || "pinned") as CERTCheck, certFp: str("certFingerprint"),
    memory: ((c.memoryTags as Parameters<typeof memoryRow>[0][] | undefined) ?? []).map(memoryRow),
    calc: ((c.tags as CalculatedTag[] | undefined) ?? []).map((t) => ({ ...t })),
  };
}

const hasLogin = (t: string) => t === "rest" || t === "opcua" || t === "mqtt";
const hasCertFor = (t: string, d: Draft) => t === "rest" || (t === "opcua" && d.securityMode !== "None");

/** The datasource's config with the draft's values in it; keys the form does not know are kept. */
export function configFrom(ds: Datasource, d: Draft): Record<string, unknown> {
  const c: Record<string, unknown> = { ...(ds.config as Record<string, unknown>) };
  const num = (s: string, dflt: number) => Number(s) || dflt;
  switch (ds.type) {
    case "opcua":
      c.endpoint = `opc.tcp://${d.host.trim()}:${num(d.port, 4840)}`;
      c.securityMode = d.securityMode;
      // The runtime refuses policy None with a secure mode.
      c.securityPolicy = d.securityMode === "None" ? "None" : d.securityPolicy === "None" ? "Basic256Sha256" : d.securityPolicy;
      break;
    case "rest":
      c.endpoint = `https://${d.host.trim()}`;
      c.basePath = d.basePath;
      if (d.bearerToken) c.bearerToken = d.bearerToken; else delete c.bearerToken;
      break;
    case "mbtcp":
      c.host = d.host.trim(); c.port = num(d.port, 502); c.slaveId = num(d.slaveId, 1);
      break;
    case "mqtt":
      c.host = d.host.trim(); c.port = num(d.port, 1883);
      break;
    case "virtual":
      c.tags = d.calc.filter((r) => r.path.trim());
      break;
    case "memory":
      c.memoryTags = d.memory.filter((r) => r.path.trim()).map(memoryTag);
      break;
  }
  if (hasLogin(ds.type)) {
    if (d.username.trim()) { c.username = d.username.trim(); if (d.password) c.password = d.password; }
    else { delete c.username; delete c.password; }
  }
  if (hasCertFor(ds.type, d)) {
    c.certCheck = d.certCheck;
    if (d.certCheck === "pinned" && d.certFp.trim()) c.certFingerprint = d.certFp.trim(); else delete c.certFingerprint;
  } else {
    delete c.certCheck; delete c.certFingerprint;
  }
  return c;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <h3 className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium flex-1">{title}</h3>
        {action}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

const inp = "w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-zinc-600";
const lbl = "block text-[11px] text-zinc-400";
const btn = "text-[11px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40";

export function DatasourceTab({ dsId }: { dsId: string }) {
  const project = useProject((s) => s.project);
  const ds = project.datasources.find((d) => d.id === dsId);
  const { updateDatasource, removeDatasource, setActivePage } = useProject.getState();
  const openVariables = useWorkspace((s) => s.openVariables);
  const activate = useWorkspace((s) => s.activate);
  const close = useWorkspace((s) => s.close);
  const { status, checkedAt, log } = useConnection(dsId);

  const [draft, setDraft] = useState<Draft | null>(ds ? draftOf(ds) : null);
  const [test, setTest] = useState<TestStatus | "running" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saved, setSaved] = useState(false);

  // Another project, or a change made elsewhere (a pin from the datasource list): start the form again from it.
  const configKey = ds ? JSON.stringify([ds.type, ds.config]) : "";
  useEffect(() => { if (ds) setDraft(draftOf(ds)); }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const usage = useMemo(() => datasourceUsage(project, dsId), [project, dsId]);
  // Dirty means the form says something other than what it said when it was filled in from the datasource (compared
  // after both go through the same rules, so a config the form would write differently is not "changed").
  const dirty = !!(ds && draft && JSON.stringify(configFrom(ds, draft)) !== JSON.stringify(configFrom(ds, draftOf(ds))));

  if (!ds || !draft) {
    return <div className="flex-1 p-8 text-sm text-zinc-500">This datasource was removed from the project. <button className="underline" onClick={() => close(`ds:${dsId}`)}>Close this tab</button></div>;
  }
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const hasCert = hasCertFor(ds.type, draft);
  const network = ds.type !== "virtual" && ds.type !== "memory";
  const pill = status === undefined ? ["Checking…", "bg-zinc-700 text-zinc-200"]
    : status === null ? ["No answer", "bg-zinc-700 text-zinc-200"]
    : status.connected ? ["Connected", "bg-emerald-600 text-white"] : ["Not connected", "bg-red-600 text-white"];
  const total = usage.pages.reduce((n, p) => n + p.widgets, 0) + usage.alarms.length + usage.scripts.length + usage.named + usage.calculated;
  const hadPassword = !!(ds.config as { password?: string }).password;

  const runTest = async () => {
    setTest("running");
    setTest(await testDatasource({ type: ds.type, config: configFrom(ds, draft) }));
  };
  const samePrint = (a: string, b: string) => a.replace(/[^0-9a-f]/gi, "").toUpperCase() === b.replace(/[^0-9a-f]/gi, "").toUpperCase();
  const seen = test && test !== "running" ? test.certFingerprint ?? "" : "";
  const offerPin = hasCert && draft.certCheck === "pinned" && seen !== "" && !samePrint(seen, draft.certFp);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold truncate">{ds.label}</h2>
        <span className="text-[11px] font-mono text-zinc-500">[{ds.id}] {TYPE_NAME[ds.type] ?? ds.type}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${pill[1]}`}>{pill[0]}</span>
        <div className="flex-1" />
        {network && <button className={btn} onClick={() => openVariables(ds.id)}>Browse variables</button>}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Section title="Connection" action={<button className={btn} onClick={() => void runTest()} disabled={test === "running"}>{test === "running" ? "Testing…" : "Test connection"}</button>}>
            {network || ds.type === "virtual" || ds.type === "memory" ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-xs">
                <dt className="text-zinc-500">Status</dt>
                <dd>{status === undefined ? "Checking…" : status === null ? "The runtime does not know this datasource: it has not been deployed, or the runtime is not running." : status.connected ? "Connected" : "Not connected"}</dd>
                {status && !status.connected && (<><dt className="text-zinc-500">Reason</dt><dd className="text-red-600 break-words">{status.lastError || "no reason given"}</dd></>)}
                {status && (<><dt className="text-zinc-500">Variables</dt><dd>{status.tagCount} the runtime is {ds.type === "memory" || ds.type === "virtual" ? "holding" : "polling or can browse"}</dd></>)}
                <dt className="text-zinc-500">Checked</dt><dd className="text-zinc-500">{checkedAt ? new Date(checkedAt).toLocaleTimeString() : "—"} (every {POLL_MS / 1000} s)</dd>
              </dl>
            ) : null}
            {test && test !== "running" && (
              <div className={`text-xs ${test.connected ? "text-emerald-600" : "text-red-600"}`}>
                {test.connected ? `✓ Connected${test.tagCount ? ` · ${test.tagCount} variables` : ""}` : `✗ ${test.lastError ?? "Connection failed"}`}
              </div>
            )}
            {offerPin && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-zinc-400 shrink-0">The device's certificate</span>
                <span className="font-mono truncate" title={seen}>{seen}</span>
                <button className="shrink-0 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white" onClick={() => { set({ certFp: seen }); setTest(null); }}>Pin it</button>
              </div>
            )}
            {needsCertPin(ds) && <div className="text-[11px] text-amber-600">The device's certificate is not being checked. Choose "pinned" below and pin it.</div>}
            {ds.type === "mbtcp" && <button className={btn} onClick={() => setScanning(true)}>Add registers…</button>}
          </Section>

          <Section
            title="Settings"
            action={(
              <div className="flex items-center gap-2">
                {saved && !dirty && <span className="text-[11px] text-emerald-600">Saved</span>}
                <button className={btn} disabled={!dirty} onClick={() => setDraft(draftOf(ds))}>Revert</button>
                <button className="text-[11px] px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40" disabled={!dirty}
                  onClick={() => { updateDatasource(ds.id, { config: configFrom(ds, draft) as Datasource["config"] }); set({ password: "" }); setSaved(true); }}>Save changes</button>
              </div>
            )}
          >
            <label className={lbl}>Name
              <input aria-label="Name" key={ds.label} defaultValue={ds.label} className={`${inp} font-sans`}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== ds.label) updateDatasource(ds.id, { label: v }); }} />
            </label>
            {network && (
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <label className={lbl}>{ds.type === "rest" ? "Address" : "Host"}<input aria-label="Host" value={draft.host} onChange={(e) => set({ host: e.target.value })} placeholder="10.0.0.210" className={inp} /></label>
                {ds.type !== "rest" && <label className={lbl}>Port<input aria-label="Port" type="number" value={draft.port} onChange={(e) => set({ port: e.target.value })} className={inp} /></label>}
              </div>
            )}
            {ds.type === "rest" && (
              <label className={lbl}>Base path<input aria-label="Base path" value={draft.basePath} onChange={(e) => set({ basePath: e.target.value })} className={inp} /></label>
            )}
            {ds.type === "mbtcp" && <label className={lbl}>Slave ID<input aria-label="Slave ID" type="number" value={draft.slaveId} onChange={(e) => set({ slaveId: e.target.value })} className={`${inp} w-28`} /></label>}
            {ds.type === "opcua" && (
              <div className="grid grid-cols-2 gap-2">
                <label className={lbl}>Security mode
                  <select aria-label="Security mode" value={draft.securityMode} onChange={(e) => set({ securityMode: e.target.value })} className={inp}>
                    <option value="None">None</option><option value="Sign">Sign</option><option value="SignAndEncrypt">Sign &amp; Encrypt</option>
                  </select>
                </label>
                <label className={lbl}>Security policy
                  <select aria-label="Security policy" value={draft.securityPolicy} onChange={(e) => set({ securityPolicy: e.target.value })} className={inp} disabled={draft.securityMode === "None"}>
                    <option value="None">None</option><option value="Basic128Rsa15">Basic128Rsa15</option><option value="Basic256">Basic256</option><option value="Basic256Sha256">Basic256Sha256</option>
                  </select>
                </label>
              </div>
            )}
            {hasLogin(ds.type) && (
              <div className="grid grid-cols-2 gap-2">
                <label className={lbl}>Username <span className="text-zinc-600">(if the device needs a login)</span>
                  <input aria-label="Username" value={draft.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" className={inp} />
                </label>
                <label className={lbl}>Password
                  <input aria-label="Password" type="password" value={draft.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" disabled={!draft.username.trim()}
                    placeholder={hadPassword ? "unchanged" : "blank: the runtime keeps the one it has"} className={inp} />
                </label>
              </div>
            )}
            {ds.type === "rest" && (
              <label className={lbl}>Bearer token <span className="text-zinc-600">(optional)</span>
                <input aria-label="Bearer token" type="password" value={draft.bearerToken} onChange={(e) => set({ bearerToken: e.target.value })} autoComplete="off" className={inp} />
              </label>
            )}
            {hasCert && <CertCheckField mode={draft.certCheck} fingerprint={draft.certFp} onMode={(m) => set({ certCheck: m })} onFingerprint={(f) => set({ certFp: f })} />}
            {ds.type === "memory" && <MemoryRowsEditor rows={draft.memory} onChange={(memory) => set({ memory })} maxHeight="24rem" wide />}
            {ds.type === "virtual" && <CalculatedRowsEditor rows={draft.calc} onChange={(calc) => set({ calc })} maxHeight="24rem" wide />}
            <div className="text-[10px] text-zinc-600">Changes reach the runtime when the project is deployed.</div>
          </Section>

          <Section title="Used by">
            {total === 0 ? <div className="text-xs text-zinc-500">Nothing in the project uses this datasource yet.</div> : (
              <ul className="text-xs space-y-1.5">
                {usage.pages.map((p) => (
                  <li key={p.id}>
                    <button className="text-blue-600 hover:underline" onClick={() => { setActivePage(p.id); activate(SCREEN_TAB.id); }}>{p.name}</button>
                    <span className="text-zinc-500"> · {p.widgets} widget{p.widgets === 1 ? "" : "s"}</span>
                  </li>
                ))}
                {usage.alarms.length > 0 && <li><span className="text-zinc-400">Alarm rules:</span> {usage.alarms.join(", ")}</li>}
                {usage.scripts.length > 0 && <li><span className="text-zinc-400">Scripts:</span> {usage.scripts.join(", ")}</li>}
                {usage.named > 0 && <li><button className="text-blue-600 hover:underline" onClick={() => openVariables(ds.id)}>{usage.named} named variable{usage.named === 1 ? "" : "s"}</button> <span className="text-zinc-500">in the namespace</span></li>}
                {usage.calculated > 0 && <li><span className="text-zinc-400">Computed tags</span> in other datasources: {usage.calculated}</li>}
              </ul>
            )}
          </Section>

          <Section title="Connection log (since this tab was opened)">
            {log.length === 0 ? <div className="text-xs text-zinc-500">Nothing yet.</div> : (
              <ul className="text-xs font-mono space-y-1 max-h-48 overflow-auto">
                {log.map((l, i) => <li key={`${l.at}-${i}`}><span className="text-zinc-500">{new Date(l.at).toLocaleTimeString()}</span> {l.text}</li>)}
              </ul>
            )}
          </Section>

          <Section title="Remove">
            {confirmRemove ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-600">Remove {ds.label}{total ? ` (${total} use${total === 1 ? "" : "s"} will stop working)` : ""}?</span>
                <button className="text-[11px] px-2.5 py-1 rounded bg-red-700 hover:bg-red-600 text-white" onClick={() => { close(`ds:${ds.id}`); removeDatasource(ds.id); }}>Remove</button>
                <button className={btn} onClick={() => setConfirmRemove(false)}>Keep</button>
              </div>
            ) : <button className={btn} onClick={() => setConfirmRemove(true)}>Remove this datasource…</button>}
          </Section>
        </div>
      </div>
      {scanning && <TagScannerModal dsId={ds.id} dsLabel={ds.label} dsType={ds.type} onClose={() => setScanning(false)} />}
    </div>
  );
}
