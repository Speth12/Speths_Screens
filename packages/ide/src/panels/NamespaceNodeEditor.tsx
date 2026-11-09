import { useState } from "react";
import type { NamespaceNode, NamespaceNodeType } from "@speths-screens/shared-types";

/** The form for one namespace node: its path (new nodes only), type, source variable, unit, data type and description. */
export function NamespaceNodeEditor({
  node,
  datasources,
  onSave,
  onCancel,
}: {
  node: Partial<NamespaceNode> & { path: string };
  datasources: { id: string; label: string }[];
  onSave: (n: NamespaceNode) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(node.path);
  const [type, setType] = useState<NamespaceNodeType>(node.type ?? "tag");
  const [driverId, setDriverId] = useState(node.driverId ?? "");
  const [driverAddr, setDriverAddr] = useState(node.driverAddr ?? "");
  const [description, setDescription] = useState(node.description ?? "");
  const [unit, setUnit] = useState(node.unit ?? "");
  const [dataType, setDataType] = useState(node.dataType ?? "");

  const inp = "w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-600";
  const lbl = "block text-[10px] text-zinc-500 mb-0.5";

  const isNew = !node.driverId && !node.driverAddr;

  return (
    <div className="p-3 space-y-2.5 border-t border-zinc-800 bg-zinc-900/60">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
        {isNew ? "New Node" : "Edit Node"}
      </div>

      <label>
        <span className={lbl}>Path (dot-separated)</span>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Building1.System1.Tank5.Level"
          className={`${inp} font-mono`}
          disabled={!isNew}
        />
      </label>

      <label>
        <span className={lbl}>Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NamespaceNodeType)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none"
        >
          <option value="folder">Folder</option>
          <option value="asset">Asset</option>
          <option value="tag">Tag</option>
          <option value="virtual">Virtual</option>
        </select>
      </label>

      {(type === "tag" || type === "virtual") && (
        <>
          <label>
            <span className={lbl}>Driver</span>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">— none —</option>
              {datasources.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.label} [{ds.id}]</option>
              ))}
            </select>
          </label>

          {driverId && (
            <label>
              <span className={lbl}>Driver Address (tag path in datasource)</span>
              <input
                value={driverAddr}
                onChange={(e) => setDriverAddr(e.target.value)}
                placeholder="Arp.Plc.Eclr/MainInstance.iInteger"
                className={`${inp} font-mono`}
              />
              <div className="text-[9px] text-zinc-600 mt-0.5 font-mono">
                binding: ns:{path || "…"}
              </div>
            </label>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={lbl}>Unit</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. °C" className={inp} />
        </label>
        <label>
          <span className={lbl}>Data Type</span>
          <select
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none"
          >
            <option value="">auto</option>
            <option value="float">float</option>
            <option value="int">int</option>
            <option value="bool">bool</option>
            <option value="string">string</option>
          </select>
        </label>
      </div>

      <label>
        <span className={lbl}>Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className={inp} />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
        >Cancel</button>
        <button
          onClick={() => {
            if (!path.trim()) return;
            onSave({
              path: path.trim(),
              type,
              driverId:    driverId || undefined,
              driverAddr:  driverAddr || undefined,
              description: description || undefined,
              unit:        unit || undefined,
              dataType:    dataType || undefined,
            });
          }}
          className="flex-1 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 font-medium"
        >Save</button>
      </div>
    </div>
  );
}
