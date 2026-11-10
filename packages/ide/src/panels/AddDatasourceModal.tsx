import { useState } from "react";
import type { DatasourceType } from "../store/projectStore";
import type { CalculatedTag, CERTCheck } from "@speths-screens/shared-types";
import { CertCheckField, testDatasource, type TestStatus } from "./CertCheck";
import { CalculatedRowsEditor, MemoryRowsEditor, memoryTag, type MemoryRow } from "./DatasourceForms";
import { CheckIcon, FailIcon } from "../ui/icons";

// memoryTag is re-exported for the tests that import it from here.
export { memoryTag };

const TYPE_DEFAULTS: Record<DatasourceType, { id: string; label: string }> = {
  opcua:   { id: "opcua",  label: "OPC UA" },
  mbtcp:   { id: "mb",     label: "Modbus TCP" },
  mqtt:    { id: "mqtt",   label: "MQTT" },
  rest:    { id: "rest",   label: "PLCnext REST" },
  virtual: { id: "calc",   label: "Computed Tags" },
  memory:  { id: "mem",    label: "Memory tags" },
};

export function AddDatasourceModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (ds: { id: string; type: DatasourceType; label: string; config: Record<string, unknown> }) => void;
}) {
  const [type, setType] = useState<DatasourceType>("rest");
  const [id, setId] = useState(TYPE_DEFAULTS.rest.id);
  const [label, setLabel] = useState(TYPE_DEFAULTS.rest.label);
  const [ip, setIp] = useState("10.0.0.210");
  const [opcuaPort, setOpcuaPort]           = useState(4840);
  const [securityMode, setSecurityMode]     = useState("None");
  const [securityPolicy, setSecurityPolicy] = useState("None");
  const [mbPort, setMbPort]                 = useState(502);
  const [slaveId, setSlaveId]               = useState(1);
  const [mqttPort, setMqttPort]             = useState(1883);
  const [basePath, setBasePath]             = useState("/_pxc_api/v1.14");
  const [bearerToken, setBearerToken]       = useState("");
  const [memoryRows, setMemoryRows]         = useState<MemoryRow[]>([
    { path: "Count", type: "int", initial: "0", retain: true },
  ]);
  const [virtualRows, setVirtualRows]       = useState<CalculatedTag[]>([
    { path: "tagA", expr: "{rest:tagPath} * 1.0" },
  ]);
  const [username, setUsername]             = useState("");
  const [password, setPassword]             = useState("");
  const [certCheck, setCertCheck]           = useState<CERTCheck>("pinned");
  const [certFp, setCertFp]                 = useState("");
  const [testing, setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [seenFp, setSeenFp] = useState("");
  // REST always uses https; OPC UA has a certificate only with security on.
  const hasCert = type === "rest" || (type === "opcua" && securityMode !== "None");
  const hasLogin = type === "rest" || type === "opcua" || type === "mqtt";

  const changeType = (t: DatasourceType) => { setType(t); setId(TYPE_DEFAULTS[t].id); setLabel(TYPE_DEFAULTS[t].label); setTestResult(null); };

  const buildPayload = () => {
    const config: Record<string, unknown> = {};
    if (type === "opcua") {
      config.endpoint = `opc.tcp://${ip}:${opcuaPort}`;
      config.securityMode = securityMode;
      // The runtime refuses policy None with a secure mode; use the usual one.
      config.securityPolicy = securityMode === "None" ? "None" : securityPolicy === "None" ? "Basic256Sha256" : securityPolicy;
    } else if (type === "mbtcp") {
      config.host = ip; config.port = mbPort || 502; config.slaveId = slaveId || 1;
    } else if (type === "mqtt") {
      config.host = ip; config.port = mqttPort || 1883;
    } else if (type === "virtual") {
      config.tags = virtualRows.filter((r) => r.path.trim());
    } else if (type === "memory") {
      config.memoryTags = memoryRows.filter((r) => r.path.trim()).map(memoryTag);
    } else {
      config.endpoint = `https://${ip}`;
      config.basePath = basePath;
      if (bearerToken) config.bearerToken = bearerToken;
    }
    if (hasLogin && username.trim()) {
      config.username = username.trim();
      config.password = password;
    }
    if (hasCert) {
      config.certCheck = certCheck;
      if (certCheck === "pinned" && certFp.trim()) config.certFingerprint = certFp.trim();
    }
    return { id, type, label, config };
  };

  const testConn = async () => {
    setTesting(true); setTestResult(null);
    const { type: dsType, config } = buildPayload();
    const data: TestStatus = await testDatasource({ type: dsType, config });
    setTestResult(data.connected ? { ok: true, msg: `Connected${data.tagCount ? ` · ${data.tagCount} tags` : ""}` } : { ok: false, msg: data.lastError ?? "Connection failed" });
    setSeenFp(data.certFingerprint ?? "");
    setTesting(false);
  };
  const samePrint = (a: string, b: string) => a.replace(/[^0-9a-f]/gi, "").toUpperCase() === b.replace(/[^0-9a-f]/gi, "").toUpperCase();
  const offerPin = hasCert && certCheck === "pinned" && seenFp !== "" && !samePrint(seenFp, certFp);

  const inpCls = "mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono";
  const lblCls = "block text-[11px] text-zinc-400";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 w-[420px] space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="text-sm font-semibold">Add Datasource</div>

        <label className={lblCls}>Type
          <select value={type} onChange={(e) => changeType(e.target.value as DatasourceType)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
            <option value="opcua">OPC UA</option>
            <option value="mbtcp">Modbus TCP</option>
            <option value="mqtt">MQTT</option>
            <option value="rest">REST (PLCnext pxc_api)</option>
            <option value="virtual">Virtual (computed expressions)</option>
            <option value="memory">Memory tags (values the runtime keeps)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">ID<input value={id} onChange={(e) => setId(e.target.value)} className={inpCls} /></label>
          <label className="text-[11px] text-zinc-400">Label<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
        </div>

        {type !== "virtual" && type !== "memory" && (
          <label className={lblCls}>IP Address<input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.210" className={inpCls} /></label>
        )}

        {type === "opcua" && (<>
          <label className={lblCls}>Port<input type="number" value={opcuaPort} onChange={(e) => setOpcuaPort(Number(e.target.value))} className="mt-1 w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs block" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Security mode
              <select value={securityMode} onChange={(e) => setSecurityMode(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
                <option value="None">None</option><option value="Sign">Sign</option><option value="SignAndEncrypt">Sign &amp; Encrypt</option>
              </select>
            </label>
            <label className="text-[11px] text-zinc-400">Security policy
              <select value={securityPolicy} onChange={(e) => setSecurityPolicy(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
                <option value="None">None</option><option value="Basic128Rsa15">Basic128Rsa15</option><option value="Basic256">Basic256</option><option value="Basic256Sha256">Basic256Sha256</option>
              </select>
            </label>
          </div>
        </>)}

        {type === "mbtcp" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Port<input type="number" value={mbPort} onChange={(e) => setMbPort(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
            <label className="text-[11px] text-zinc-400">Slave ID<input type="number" value={slaveId} onChange={(e) => setSlaveId(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
          </div>
        )}

        {type === "mqtt" && <label className={lblCls}>Port<input type="number" value={mqttPort} onChange={(e) => setMqttPort(Number(e.target.value))} className="mt-1 w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs block" /></label>}

        {type === "rest" && (<>
          <label className={lblCls}>Base path<input value={basePath} onChange={(e) => setBasePath(e.target.value)} className={inpCls} /></label>
          <label className={lblCls}>Bearer token <span className="text-zinc-600">(optional)</span><input value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="leave blank if not required" className={inpCls} /></label>
        </>)}

        {hasLogin && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Username <span className="text-zinc-600">(if the device needs a login)</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" />
            </label>
            <label className="text-[11px] text-zinc-400">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={!username.trim()} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs disabled:opacity-50" />
            </label>
          </div>
        )}

        {hasCert && <CertCheckField mode={certCheck} fingerprint={certFp} onMode={setCertCheck} onFingerprint={setCertFp} />}

        {type === "memory" && <MemoryRowsEditor rows={memoryRows} onChange={setMemoryRows} />}
        {type === "virtual" && <CalculatedRowsEditor rows={virtualRows} onChange={setVirtualRows} />}

        <div className="text-[10px] text-zinc-600 font-mono truncate">
          {type === "opcua"   && `opc.tcp://${ip}:${opcuaPort}`}
          {type === "mbtcp"   && `${ip}:${mbPort}  slave=${slaveId}`}
          {type === "mqtt"    && `${ip}:${mqttPort}`}
          {type === "rest"    && `https://${ip}${basePath}`}
          {type === "virtual" && `${virtualRows.filter((r) => r.path.trim()).length} computed tag(s)`}
          {type === "memory"  && `${memoryRows.filter((r) => r.path.trim()).length} memory tag(s)`}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={testConn} disabled={testing} className="text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50">{testing ? "Testing…" : "Test"}</button>
          {testResult && <span className={`text-[11px] flex-1 truncate ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>{testResult.ok ? <CheckIcon size={12} /> : <FailIcon size={12} />} {testResult.msg}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button onClick={() => { const { id: dsId, type: dsType, label: dsLabel, config } = buildPayload(); onAdd({ id: dsId, type: dsType, label: dsLabel, config }); }} className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 font-medium">Add</button>
        </div>
        {offerPin && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-zinc-400 shrink-0">Device certificate</span>
            <span className="font-mono text-zinc-200 truncate" title={seenFp}>{seenFp}</span>
            <button onClick={() => { setCertFp(seenFp); setSeenFp(""); setTestResult(null); }} className="shrink-0 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white">Pin</button>
          </div>
        )}
      </div>
    </div>
  );
}
