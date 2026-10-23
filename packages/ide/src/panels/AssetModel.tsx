import { useState } from "react";
import { useProject, type AssetNode } from "../store/projectStore";

const uid = () => `asset-${Math.random().toString(36).slice(2, 8)}`;

const ICON_LABELS: Record<NonNullable<AssetNode["iconType"]>, string> = {
  plant: "P", area: "A", unit: "U", device: "D", sensor: "S",
};

const ICON_COLORS: Record<NonNullable<AssetNode["iconType"]>, string> = {
  plant:  "bg-emerald-900/60 text-emerald-400",
  area:   "bg-blue-900/60 text-blue-400",
  unit:   "bg-violet-900/60 text-violet-400",
  device: "bg-amber-900/60 text-amber-400",
  sensor: "bg-red-900/60 text-red-400",
};

const ICON_TYPES: AssetNode["iconType"][] = ["plant", "area", "unit", "device", "sensor"];

const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

function NodeIcon({ iconType }: { iconType?: AssetNode["iconType"] }) {
  const t = iconType ?? "device";
  const cls = ICON_COLORS[t];
  return (
    <span className={`shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${cls}`}>
      {ICON_LABELS[t]}
    </span>
  );
}

function EditForm({ node, onClose }: { node: AssetNode; onClose: () => void }) {
  const { updateAsset, addAsset, project } = useProject();
  const [name, setName] = useState(node.name);
  const [prefix, setPrefix] = useState(node.tagPrefix ?? "");
  const [desc, setDesc] = useState(node.description ?? "");
  const [iconType, setIconType] = useState<AssetNode["iconType"]>(node.iconType ?? "device");
  const [udtId, setUdtId] = useState(node.udtId ?? "");
  const udts = project.udts ?? [];

  const save = () => {
    updateAsset(node.id, {
      name: name.trim() || node.name,
      tagPrefix: prefix || undefined,
      description: desc || undefined,
      iconType,
      udtId: udtId || undefined,
    });
    onClose();
  };

  const addChild = () => {
    addAsset({ id: uid(), name: "New Node", parentId: node.id, iconType: "device" });
    onClose();
  };

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-2 space-y-1.5 mt-1">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inp} />
      <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Tag prefix (e.g. rest:Pump1/)" className={`${inp} font-mono text-[10px]`} />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className={inp} />
      <div className="flex gap-1 flex-wrap">
        {ICON_TYPES.map((t) => (
          <button
            key={t ?? ""}
            onClick={() => setIconType(t)}
            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
              iconType === t ? "border-blue-500 bg-blue-900/30 text-blue-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {udts.length > 0 && (
        <select value={udtId} onChange={(e) => setUdtId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
          <option value="">No UDT</option>
          {udts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
      <div className="flex gap-1.5 pt-0.5">
        <button onClick={save} className="flex-1 text-[10px] py-1 rounded bg-blue-600 hover:bg-blue-500 text-white">Save</button>
        <button onClick={addChild} className="text-[10px] px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600">+ Child</button>
        <button onClick={onClose} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
      </div>
    </div>
  );
}

function AssetNodeRow({ node, depth, allNodes }: {
  node: AssetNode;
  depth: number;
  allNodes: AssetNode[];
}) {
  const { removeAsset } = useProject();
  const [editing, setEditing] = useState(false);
  const children = allNodes.filter((n) => n.parentId === node.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-zinc-800/40 group"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <NodeIcon iconType={node.iconType} />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setEditing((v) => !v)}
        >
          <div className="text-xs text-zinc-200 truncate">{node.name}</div>
          {node.tagPrefix && (
            <div className="text-[9px] font-mono text-zinc-600 truncate">{node.tagPrefix}</div>
          )}
        </div>
        <button
          onClick={() => removeAsset(node.id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs shrink-0"
        >
          ×
        </button>
      </div>
      {editing && <div style={{ paddingLeft: `${8 + depth * 14}px` }}>
        <EditForm node={node} onClose={() => setEditing(false)} />
      </div>}
      {children.map((c) => (
        <AssetNodeRow key={c.id} node={c} depth={depth + 1} allNodes={allNodes} />
      ))}
    </div>
  );
}

export function AssetModel() {
  const { project, addAsset } = useProject();
  const assets = project.assets ?? [];
  const roots = assets.filter((n) => !n.parentId);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Asset Model</div>
        <button
          onClick={() => addAsset({ id: `asset-${Math.random().toString(36).slice(2, 8)}`, name: "New Plant", iconType: "plant" })}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          + Add Root
        </button>
      </div>

      {roots.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic">No assets yet. Add a root node to begin.</div>
      )}

      <div className="space-y-0.5">
        {roots.map((node) => (
          <AssetNodeRow key={node.id} node={node} depth={0} allNodes={assets} />
        ))}
      </div>
    </div>
  );
}
