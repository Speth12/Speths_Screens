import { useState } from "react";
import { useProject, type NamespaceNode, type NamespaceNodeType } from "../store/projectStore";

type TreeNode = {
  node: NamespaceNode;
  children: TreeNode[];
};

function buildTree(nodes: NamespaceNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const n of nodes) {
    map.set(n.path, { node: n, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const tn of map.values()) {
    const pathParts = tn.node.path.split(".");
    if (pathParts.length === 1) {
      roots.push(tn);
    } else {
      const parentPath = pathParts.slice(0, -1).join(".");
      const parent = map.get(parentPath);
      if (parent) {
        parent.children.push(tn);
      } else {
        roots.push(tn);
      }
    }
  }
  // Sort: folders first, then by name
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.node.type === "folder" && b.node.type !== "folder") return -1;
      if (a.node.type !== "folder" && b.node.type === "folder") return 1;
      return a.node.path.localeCompare(b.node.path);
    });
    for (const n of nodes) sortTree(n.children);
  };
  sortTree(roots);
  return roots;
}

const TYPE_ICON: Record<NamespaceNodeType, string> = {
  folder: "▾",
  asset:  "◈",
  tag:    "◆",
  virtual: "◇",
};

const TYPE_COLOR: Record<NamespaceNodeType, string> = {
  folder:  "text-zinc-400",
  asset:   "text-blue-400",
  tag:     "text-emerald-400",
  virtual: "text-purple-400",
};

function NSTreeRow({
  tn,
  depth,
  selected,
  onSelect,
  onDelete,
}: {
  tn: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const { node } = tn;
  const isFolder = node.type === "folder";

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 py-1 cursor-pointer hover:bg-zinc-800/40 transition-colors ${
          selected === node.path ? "bg-blue-600/15" : ""
        }`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        draggable={!isFolder}
        onDragStart={(e) => {
          if (isFolder) return;
          e.dataTransfer.setData("text/x-tag-binding", `ns:${node.path}`);
          e.dataTransfer.effectAllowed = "link";
        }}
        onClick={() => { onSelect(node.path); if (isFolder) setOpen((v) => !v); }}
      >
        {isFolder ? (
          <span className="text-zinc-500 text-[9px] w-3 shrink-0">{open ? "▾" : "▸"}</span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className={`text-[10px] shrink-0 ${TYPE_COLOR[node.type]}`}>
          {TYPE_ICON[node.type]}
        </span>
        <span className="flex-1 text-[11px] text-zinc-200 truncate">
          {node.path.split(".").at(-1)}
        </span>
        {node.driverId && (
          <span className="text-[9px] text-zinc-600 font-mono truncate max-w-[80px]" title={`${node.driverId}:${node.driverAddr}`}>
            {node.driverId}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-[11px] shrink-0 transition-opacity px-1"
          title="Delete node (and children)"
        >×</button>
      </div>
      {open && tn.children.map((child) => (
        <NSTreeRow
          key={child.node.path}
          tn={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

function NodeEditor({
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

export function Namespace() {
  const { project, upsertNamespaceNode, removeNamespaceNode } = useProject();
  const nodes: NamespaceNode[] = project.namespace ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<NamespaceNode> & { path: string } | null>(null);

  const tree = buildTree(nodes);

  const selectedNode = selected ? nodes.find((n) => n.path === selected) ?? null : null;

  const handleSave = (node: NamespaceNode) => {
    upsertNamespaceNode(node);
    setEditing(null);
    setSelected(node.path);
  };

  const handleDelete = (path: string) => {
    removeNamespaceNode(path);
    if (selected === path || selected?.startsWith(path + ".")) setSelected(null);
  };

  return (
    <div className="min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/40">
        <button
          onClick={() => setEditing({ path: selected ? selected + "." : "" })}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          title="New node"
        >+ Node</button>
        {selectedNode && (
          <button
            onClick={() => setEditing({ ...selectedNode })}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
          >Edit</button>
        )}
        <div className="flex-1" />
        <span className="text-[9px] text-zinc-600">{nodes.length} node{nodes.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Tree */}
      {nodes.length === 0 ? (
        <div className="px-4 py-3 text-[11px] text-zinc-600 italic">
          No namespace nodes — click + Node to create a hierarchy
        </div>
      ) : (
        <div className="pb-1">
          {tree.map((tn) => (
            <NSTreeRow
              key={tn.node.path}
              tn={tn}
              depth={0}
              selected={selected}
              onSelect={setSelected}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Node details (read-only when not editing) */}
      {selectedNode && !editing && (
        <div className="px-3 py-2 border-t border-zinc-800/40 space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 mb-1.5">Selected</div>
          <div className="font-mono text-[10px] text-zinc-300 break-all">{selectedNode.path}</div>
          {selectedNode.driverId && (
            <div className="text-[10px] text-zinc-500">
              <span className="text-zinc-600">source: </span>
              <span className="font-mono text-emerald-400">{selectedNode.driverId}:{selectedNode.driverAddr}</span>
            </div>
          )}
          {selectedNode.description && (
            <div className="text-[10px] text-zinc-500">{selectedNode.description}</div>
          )}
          {(selectedNode.unit || selectedNode.dataType) && (
            <div className="text-[10px] text-zinc-600 font-mono">
              {selectedNode.dataType && <span>{selectedNode.dataType}</span>}
              {selectedNode.unit && <span className="ml-1">[{selectedNode.unit}]</span>}
            </div>
          )}
          <div className="text-[9px] text-zinc-700 pt-0.5 font-mono">
            binding: <span className="text-blue-400">ns:{selectedNode.path}</span>
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <NodeEditor
          node={editing}
          datasources={project.datasources.map((d) => ({ id: d.id, label: d.label }))}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
