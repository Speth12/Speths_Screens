// Server certificate checks for datasources (certCheck / certFingerprint).
// PLCs use self-signed certificates, so the usual check is "pinned": the
// runtime accepts only the certificate whose fingerprint the project holds.
// The runtime's datasource test reports the fingerprint the device presents;
// a refused certificate fails before any login is sent.
import { useEffect, useState } from "react";
import type { CERTCheck, Datasource } from "@speths-screens/shared-types";
import { apiFetch } from "../store/runtimeAuth";

export type TestStatus = { connected: boolean; lastError?: string; tagCount?: number; certFingerprint?: string };

/** Runs the runtime's datasource test. Never throws. */
export async function testDatasource(ds: Pick<Datasource, "type" | "config">): Promise<TestStatus> {
  try {
    const r = await apiFetch("/api/v1/datasources/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "test", label: "test", type: ds.type, config: ds.config }),
    });
    if (!r.ok) return { connected: false, lastError: `HTTP ${r.status}` };
    return (await r.json()) as TestStatus;
  } catch (e) {
    return { connected: false, lastError: (e as Error).message };
  }
}

/** True when the datasource talks over an encrypted connection without
 *  checking the certificate. Mirrors the runtime's startup warning. */
export function needsCertPin(ds: Pick<Datasource, "type" | "config">): boolean {
  const c = ds.config;
  const off = !c.certCheck || c.certCheck === "off";
  const endpoint = (c.endpoint ?? "").toLowerCase();
  switch (ds.type) {
    case "rest": return off && endpoint.startsWith("https://");
    case "mqtt": return c.certCheck === "off" && /^(ssl|tls|mqtts):\/\//.test(endpoint);
    case "opcua": return off && (c.securityMode ?? "SignAndEncrypt") !== "None";
    default: return false;
  }
}

const selCls = "mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs";

/** The certificate setting in the datasource form. */
export function CertCheckField({ mode, fingerprint, onMode, onFingerprint }: {
  mode: CERTCheck;
  fingerprint: string;
  onMode: (m: CERTCheck) => void;
  onFingerprint: (fp: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] text-zinc-400">Server certificate
        <select aria-label="Server certificate" value={mode} onChange={(e) => onMode(e.target.value as CERTCheck)} className={selCls}>
          <option value="pinned">Pinned: only this device's certificate (recommended)</option>
          <option value="trusted">Trusted: certificates the system trusts</option>
          <option value="off">Off: accept any certificate</option>
        </select>
      </label>
      {mode === "pinned" && (
        <input aria-label="Certificate fingerprint" value={fingerprint} onChange={(e) => onFingerprint(e.target.value)}
          placeholder="Test to read it from the device" className={`${selCls} font-mono text-[10px]`} />
      )}
      {mode === "off" && <div className="text-[10px] text-amber-400">Anyone between the runtime and the device could pose as it and collect its login.</div>}
    </div>
  );
}

/** Reads the certificate an existing datasource's device presents and pins it. */
export function CertPinModal({ ds, onPin, onClose }: {
  ds: Datasource;
  onPin: (fingerprint: string) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ fp?: string; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    // Pinned with nothing pinned: the runtime reads the certificate and stops
    // before sending any credentials.
    void testDatasource({ type: ds.type, config: { ...ds.config, certCheck: "pinned", certFingerprint: undefined } }).then((st) => {
      if (live) setState(st.certFingerprint ? { fp: st.certFingerprint } : { error: st.lastError ?? "the device presented no certificate" });
    });
    return () => { live = false; };
  }, [ds]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 w-[420px] space-y-3">
        <div className="text-sm font-semibold">Pin the certificate of {ds.label}</div>
        <div className="text-[11px] text-zinc-400">
          The runtime will accept only this certificate. If the device's certificate changes, the datasource goes offline until you pin the new one.
        </div>
        {!state && <div className="text-[11px] text-zinc-500">Reading the certificate…</div>}
        {state?.error && <div className="text-[11px] text-red-400 break-all">Could not read it: {state.error}</div>}
        {state?.fp && (
          <div className="text-[10px] font-mono text-zinc-200 break-all bg-zinc-950 border border-zinc-800 rounded p-2" aria-label="Device fingerprint">{state.fp}</div>
        )}
        <div className="text-[10px] text-zinc-500">If the device can show its certificate's SHA-256 fingerprint, compare the two before pinning.</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button disabled={!state?.fp} onClick={() => state?.fp && onPin(state.fp)} className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium">Pin this certificate</button>
        </div>
      </div>
    </div>
  );
}
