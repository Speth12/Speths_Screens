// The Variables tab: every variable the datasources offer, in one flat list on the left, and the project's namespace
// (the names screens bind to) as a tree on the right. Drag variables into the tree to give them names, or import a
// datasource's own structure.
import { useEffect, useMemo, useRef, useState } from "react";
import type { NamespaceNode } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { tagStoreClient, type TagState } from "../store/tagStoreClient";
import { addrSegments, countNsRefs, nsJoin, nsLeaf, nsName, nsParent, nsTree, uniquePath, type NsTreeNode } from "../store/namespaceOps";
import { publishToRuntime, useNamespaceIndex, useVariables, varKey, type Variable } from "../store/variables";
import { useWorkspace } from "../store/workspace";
import { NamespaceNodeEditor } from "./NamespaceNodeEditor";
import { ImportNamespaceDialog } from "./ImportNamespaceDialog";

export const VAR_MIME = "application/x-speths-variables";
export const NODE_MIME = "application/x-speths-nsnode";
const ROW_H = 30;

function fmtValue(s: TagState | undefined): string {
  if (!s) return "";
  const v = s.value;
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v.length > 14 ? `${v.slice(0, 14)}…` : v;
  return JSON.stringify(v).slice(0, 16);
}
const dot = (q?: string) => (q === "Good" ? "bg-emerald-400" : q === "Bad" ? "bg-red-500" : q === "Uncertain" ? "bg-amber-400" : "bg-zinc-700");

/** A tag's live state; only the rows on screen subscribe, so only they make the runtime poll. */
function useLive(key: string): TagState | undefined {
  const [state, setState] = useState<TagState | undefined>(() => (key ? tagStoreClient.get(key) : undefined));
  useEffect(() => {
    if (!key) return;
    setState(tagStoreClient.get(key));
    return tagStoreClient.subscribe(key, setState);
  }, [key]);
  return state;
}

function VariableRow({ v, node, selected, onToggle, onDragStart, onAdd, onBind, canBind }: {
  v: Variable; node: NamespaceNode | undefined; selected: boolean; onToggle: () => void;
  onDragStart: (e: React.DragEvent) => void; onAdd: () => void; onBind: () => void; canBind: boolean;
}) {
  const live = useLive(v.key);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{ height: ROW_H }}
      className={`group flex items-center gap-2 px-2 text-[11px] border-b border-zinc-800/40 ${selected ? "bg-blue-600/15" : "hover:bg-zinc-800/40"}`}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${v.path}`} className="accent-blue-500 shrink-0" />
      <span className="w-36 shrink-0 truncate font-mono text-zinc-100" title={v.description || undefined}>{v.path.split(/[/.]/).pop()}</span>
      <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-zinc-500" title={v.path}>{v.path}</span>
      <span className="w-24 shrink-0 truncate text-zinc-500" title={v.dsLabel}>{v.dsLabel}</span>
      <span className="w-24 shrink-0 flex items-center gap-1 justify-end tabular-nums text-zinc-300">
        <span className={`w-1.5 h-1.5 rounded-full ${dot(live?.quality)}`} title={live?.quality ?? ""} />
        {fmtValue(live)}
      </span>
      <span className="w-32 shrink-0 truncate font-mono text-[10px] text-blue-600" title={node ? `ns:${node.path}` : ""}>{node ? `◆ ${node.path}` : ""}</span>
      <span className="w-14 shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
        {!node && <button onClick={onAdd} className="px-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300" title="Give it a name in the namespace">+ ns</button>}
        {canBind && <button onClick={onBind} className="px-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white" title="Bind the selected widget to this variable">Bind</button>}
      </span>
    </div>
  );
}

/** Rows of a fixed height, only the ones in view drawn: a controller can have thousands of variables. */
function VirtualRows<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight || 600);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = Math.max(0, Math.floor(top / ROW_H) - 8);
  const last = Math.min(items.length, Math.ceil((top + height) / ROW_H) + 8);
  return (
    <div ref={box} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" onScroll={(e) => setTop(e.currentTarget.scrollTop)} data-testid="variable-rows">
      <div style={{ height: items.length * ROW_H, position: "relative" }}>
        <div style={{ position: "absolute", top: first * ROW_H, left: 0, right: 0 }}>
          {items.slice(first, last).map(render)}
        </div>
      </div>
    </div>
  );
}

function TreeRow({ t, depth, selected, onSelect, onDropOn, renaming, onRename, onCommitRename, onBind, canBind }: {
  t: NsTreeNode; depth: number; selected: string | null; onSelect: (p: string) => void;
  onDropOn: (parent: string, e: React.DragEvent) => void; renaming: string | null;
  onRename: (p: string | null) => void; onCommitRename: (p: string, name: string) => void;
  onBind: (p: string) => void; canBind: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const { node } = t;
  const isFolder = node.type === "folder" || node.type === "asset";
  const live = useLive(isFolder ? "" : `ns:${node.path}`);
  const drop = (e: React.DragEvent) => { setOver(false); onDropOn(isFolder ? node.path : nsParent(node.path), e); };
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(VAR_MIME) || e.dataTransfer.types.includes(NODE_MIME);
  return (
    <>
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData(NODE_MIME, node.path); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => { onSelect(node.path); if (isFolder) setOpen((o) => !o); }}
        style={{ paddingLeft: 8 + depth * 14, height: ROW_H }}
        className={`group flex items-center gap-1.5 text-[11px] cursor-pointer border-b border-zinc-800/30 ${over ? "bg-blue-600/30" : selected === node.path ? "bg-blue-600/15" : "hover:bg-zinc-800/40"}`}
      >
        <span className="w-3 text-[9px] text-zinc-500 shrink-0">{isFolder ? (open ? "▾" : "▸") : ""}</span>
        <span className={`text-[10px] shrink-0 ${isFolder ? "text-amber-400" : "text-blue-400"}`}>{isFolder ? "▣" : "◆"}</span>
        {renaming === node.path ? (
          <input
            autoFocus defaultValue={nsLeaf(node.path)} aria-label="New name"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => onCommitRename(node.path, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCommitRename(node.path, e.currentTarget.value); if (e.key === "Escape") onRename(null); }}
            className="flex-1 min-w-0 bg-zinc-950 border border-blue-600 rounded px-1 text-[11px]"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-zinc-200" onDoubleClick={(e) => { e.stopPropagation(); onRename(node.path); }} title="Double-click to rename">
            {nsLeaf(node.path)}{t.implicit ? <span className="text-zinc-600"> (level)</span> : null}
          </span>
        )}
        {!isFolder && <span className="text-[10px] tabular-nums text-zinc-400 shrink-0">{fmtValue(live)}</span>}
        {node.driverId && <span className="text-[9px] font-mono text-zinc-600 truncate max-w-24" title={`${node.driverId}:${node.driverAddr}`}>{node.driverId}</span>}
        {!isFolder && canBind && (
          <button onClick={(e) => { e.stopPropagation(); onBind(node.path); }} className="opacity-0 group-hover:opacity-100 px-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-[10px]" title="Bind the selected widget">Bind</button>
        )}
      </div>
      {open && t.children.map((c) => (
        <TreeRow key={c.node.path} t={c} depth={depth + 1} selected={selected} onSelect={onSelect} onDropOn={onDropOn}
          renaming={renaming} onRename={onRename} onCommitRename={onCommitRename} onBind={onBind} canBind={canBind} />
      ))}
    </>
  );
}

export function VariablesTab() {
  const project = useProject((s) => s.project);
  const { upsertNamespaceNode, upsertNamespaceNodes, moveNamespaceNode, removeNamespaceNode, setWidgetTag } = useProject.getState();
  const selectedWidgetId = useProject((s) => s.selectedWidgetId);
  const activePageId = useProject((s) => s.activePageId);
  const { vars, status, loading, refresh } = useVariables();
  const index = useNamespaceIndex();

  const [filter, setFilter] = useState("");
  // Opened from a datasource's own tab: show that datasource's variables.
  const variablesDs = useWorkspace((s) => s.variablesDs);
  const [dsFilter, setDsFilter] = useState(variablesDs);
  useEffect(() => { setDsFilter(variablesDs); }, [variablesDs]);
  const [unnamedOnly, setUnnamedOnly] = useState(false);
  const [writableOnly, setWritableOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [selectedNs, setSelectedNs] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<(Partial<NamespaceNode> & { path: string }) | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vars.filter((v) => {
      if (dsFilter && v.dsId !== dsFilter) return false;
      if (unnamedOnly && index.has(v.key)) return false;
      if (writableOnly && !v.writable) return false;
      return !q || v.path.toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q) || (index.get(v.key)?.path ?? "").toLowerCase().includes(q);
    });
  }, [vars, filter, dsFilter, unnamedOnly, writableOnly, index]);

  const tree = useMemo(() => nsTree(project.namespace ?? []), [project.namespace]);
  const selectedNode = selectedNs ? (project.namespace ?? []).find((n) => n.path === selectedNs) : undefined;
  const isLeaf = (n: NamespaceNode | undefined) => !!n && (n.type === "tag" || n.type === "virtual");
  // New names go under the folder that is selected (or beside the node that is).
  const folderOfSelection = selectedNs ? (isLeaf(selectedNode) ? nsParent(selectedNs) : selectedNs) : "";

  const selectedWidget = selectedWidgetId ? project.pages.find((p) => p.id === activePageId)?.widgets.find((w) => w.id === selectedWidgetId) : undefined;
  const bindTo = (binding: string) => {
    if (!selectedWidgetId) return;
    setWidgetTag(activePageId, selectedWidgetId, "value", binding);
    setMessage({ ok: true, text: `Bound the selected widget to ${binding}` });
  };

  /** Gives variables names under a level of the namespace. */
  const addVars = async (items: { dsId: string; path: string }[], parent: string) => {
    const taken = new Set((project.namespace ?? []).map((n) => n.path));
    const nodes: NamespaceNode[] = [];
    let already = 0;
    for (const it of items) {
      if (index.has(varKey(it.dsId, it.path))) { already++; continue; }
      const leaf = addrSegments(it.path).at(-1) ?? "tag";
      const path = uniquePath(taken, parent, leaf);
      taken.add(path);
      nodes.push({ path, type: "tag", driverId: it.dsId, driverAddr: it.path });
    }
    if (nodes.length) upsertNamespaceNodes(nodes);
    const failed = nodes.length ? await publishToRuntime(nodes) : 0;
    const where = parent ? `under ${parent}` : "at the top";
    setMessage({
      ok: true,
      text: `Added ${nodes.length} ${nodes.length === 1 ? "variable" : "variables"} ${where}${already ? `; ${already} already had a name` : ""}${failed ? "; the runtime takes the rest on the next deploy" : ""}`,
    });
    setPicked(new Set());
  };

  const onDropOn = (parent: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const vj = e.dataTransfer.getData(VAR_MIME);
    if (vj) { void addVars(JSON.parse(vj) as { dsId: string; path: string }[], parent); return; }
    const from = e.dataTransfer.getData(NODE_MIME);
    if (from) {
      if (nsParent(from) === parent) return;
      const r = moveNamespaceNode(from, nsJoin(parent, nsLeaf(from)));
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: `Moved ${from} ${parent ? `into ${parent}` : "to the top"}; every use of it follows` });
    }
  };

  const commitRename = (path: string, name: string) => {
    setRenaming(null);
    const clean = nsName(name);
    if (!clean || clean === nsLeaf(path)) return;
    const r = moveNamespaceNode(path, nsJoin(nsParent(path), clean));
    setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: `Renamed to ${clean}; every use of it follows` });
    if (!r.error && selectedNs === path) setSelectedNs(nsJoin(nsParent(path), clean));
  };

  const newFolder = () => {
    const taken = new Set((project.namespace ?? []).map((n) => n.path));
    const path = uniquePath(taken, folderOfSelection, "Folder");
    upsertNamespaceNode({ path, type: "folder" });
    setSelectedNs(path);
    setRenaming(path);
  };

  const dragVariable = (v: Variable) => (e: React.DragEvent) => {
    const chosen = picked.has(v.key) ? vars.filter((x) => picked.has(x.key)) : [v];
    e.dataTransfer.setData(VAR_MIME, JSON.stringify(chosen.map((x) => ({ dsId: x.dsId, path: x.path }))));
    e.dataTransfer.effectAllowed = "copy";
  };
  const rootAccepts = (e: React.DragEvent) => e.dataTransfer.types.includes(VAR_MIME) || e.dataTransfer.types.includes(NODE_MIME);

  const offline = project.datasources.filter((d) => !status[d.id]?.connected);
  const allPicked = filtered.length > 0 && filtered.every((v) => picked.has(v.key));
  const uses = selectedNs ? countNsRefs(project, selectedNs) : 0;
  const inp = "bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-600";
  const btn = "text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40";

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-semibold">Variables</h2>
        <span className="text-[11px] text-zinc-500">
          {vars.length} from {project.datasources.length} datasource{project.datasources.length === 1 ? "" : "s"} · {(project.namespace ?? []).filter((n) => isLeaf(n)).length} named
        </span>
        <div className="flex-1" />
        <button className={btn} onClick={() => void refresh()}>{loading ? "Loading…" : "Refresh"}</button>
        <button className="text-[11px] px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40" onClick={() => setImporting(true)} disabled={project.datasources.length === 0}>Import from datasource…</button>
      </div>
      {offline.length > 0 && !loading && (
        <div className="px-4 py-1.5 text-[11px] text-amber-600 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
          {offline.map((d) => `${d.label}: ${status[d.id] ? (status[d.id]!.lastError || "not connected") : "the runtime did not answer"}`).join(" · ")}
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        {/* Flat list of every variable */}
        <section className="flex-[2] min-w-0 flex flex-col border-r border-zinc-800">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 shrink-0 flex-wrap">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search address, description or name…" aria-label="Search variables" className={`${inp} flex-1 min-w-40`} />
            <select value={dsFilter} onChange={(e) => setDsFilter(e.target.value)} aria-label="Datasource" className={inp}>
              <option value="">All datasources</option>
              {project.datasources.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-zinc-400"><input type="checkbox" checked={unnamedOnly} onChange={(e) => setUnnamedOnly(e.target.checked)} className="accent-blue-500" />No name yet</label>
            <label className="flex items-center gap-1 text-[11px] text-zinc-400"><input type="checkbox" checked={writableOnly} onChange={(e) => setWritableOnly(e.target.checked)} className="accent-blue-500" />Writable</label>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60 shrink-0">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(filtered.map((v) => v.key)))} aria-label="Select all shown" className="accent-blue-500" />
            <span className="w-36">Name ({filtered.length}{filtered.length !== vars.length ? ` of ${vars.length}` : ""})</span>
            <span className="flex-1">Address</span>
            <span className="w-24">Datasource</span><span className="w-24 text-right">Value</span><span className="w-32">Namespace</span><span className="w-14" />
          </div>
          {vars.length === 0 ? (
            <div className="p-6 text-xs text-zinc-500 italic">
              {loading ? "Reading the datasources…" : project.datasources.length === 0
                ? "Add a datasource first (Datasources in the project tree)."
                : "No variables found. Check that the datasource is connected and the controller exposes variables (HMI attribute for REST, OPC attribute for OPC UA)."}
            </div>
          ) : (
            <VirtualRows
              items={filtered}
              render={(v) => (
                <VariableRow
                  key={v.key} v={v} node={index.get(v.key)} selected={picked.has(v.key)}
                  onToggle={() => setPicked((p) => { const n = new Set(p); if (n.has(v.key)) n.delete(v.key); else n.add(v.key); return n; })}
                  onDragStart={dragVariable(v)}
                  onAdd={() => void addVars([{ dsId: v.dsId, path: v.path }], folderOfSelection)}
                  onBind={() => bindTo(index.get(v.key) ? `ns:${index.get(v.key)!.path}` : v.key)}
                  canBind={!!selectedWidget}
                />
              )}
            />
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-800 shrink-0 text-[11px] text-zinc-400">
            <span>{picked.size} selected</span>
            <button className={btn} disabled={picked.size === 0} onClick={() => void addVars(vars.filter((v) => picked.has(v.key)).map((v) => ({ dsId: v.dsId, path: v.path })), folderOfSelection)}>
              Add to namespace{folderOfSelection ? ` under ${folderOfSelection}` : ""}
            </button>
            <span className="flex-1 text-right text-zinc-600">{selectedWidget ? `Bind works on the selected ${selectedWidget.type}` : "Select a widget on the screen to bind it"}</span>
          </div>
        </section>

        {/* The namespace */}
        <section
          className="flex-1 min-w-0 flex flex-col"
          onDragOver={(e) => { if (rootAccepts(e)) e.preventDefault(); }}
          onDrop={(e) => onDropOn("", e)}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 shrink-0 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Namespace</span>
            <div className="flex-1" />
            <button className={btn} onClick={newFolder}>+ Folder</button>
            <button className={btn} onClick={() => setEditing({ path: folderOfSelection ? `${folderOfSelection}.` : "" })}>+ Node</button>
            {selectedNode && <button className={btn} onClick={() => setEditing({ ...selectedNode })}>Edit</button>}
            {selectedNs && (confirmDelete ? (
              <>
                <span className="text-[11px] text-red-600">Delete{uses ? ` (${uses} uses)` : ""}?</span>
                <button className={`${btn} !bg-red-700`} onClick={() => { removeNamespaceNode(selectedNs); setSelectedNs(null); setConfirmDelete(false); }}>Delete</button>
                <button className={btn} onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : <button className={btn} onClick={() => setConfirmDelete(true)}>Delete</button>)}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {tree.length === 0 ? (
              <div className="p-6 text-xs text-zinc-500 italic">The namespace is empty. Drag variables here, or use Import from datasource to bring in a controller's own structure.</div>
            ) : tree.map((t) => (
              <TreeRow
                key={t.node.path} t={t} depth={0} selected={selectedNs}
                onSelect={(p) => { setSelectedNs(p); setConfirmDelete(false); }}
                onDropOn={onDropOn} renaming={renaming} onRename={setRenaming} onCommitRename={commitRename}
                onBind={(p) => bindTo(`ns:${p}`)} canBind={!!selectedWidget}
              />
            ))}
          </div>
          {selectedNode && !editing && (
            <div className="px-3 py-2 border-t border-zinc-800 text-[11px] space-y-0.5 shrink-0">
              <div className="font-mono text-zinc-300 break-all">ns:{selectedNode.path}</div>
              {selectedNode.driverId && <div className="text-zinc-500">source <span className="font-mono text-emerald-600">{selectedNode.driverId}:{selectedNode.driverAddr}</span></div>}
              {selectedNode.description && <div className="text-zinc-500">{selectedNode.description}</div>}
              {(selectedNode.unit || selectedNode.dataType) && <div className="font-mono text-zinc-600">{selectedNode.dataType}{selectedNode.unit ? ` [${selectedNode.unit}]` : ""}</div>}
              {isLeaf(selectedNode) && <div className="text-zinc-600">{uses} {uses === 1 ? "use" : "uses"} in this project</div>}
            </div>
          )}
          {editing && (
            <div className="shrink-0 max-h-[55%] overflow-auto">
              <NamespaceNodeEditor
                node={editing}
                datasources={project.datasources.map((d) => ({ id: d.id, label: d.label }))}
                onSave={(n) => { upsertNamespaceNode(n); setEditing(null); setSelectedNs(n.path); }}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          {message && (
            <div className={`px-3 py-1.5 text-[11px] border-t border-zinc-800 shrink-0 ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">{message.text}</div>
          )}
        </section>
      </div>
      {importing && <ImportNamespaceDialog onClose={() => setImporting(false)} onDone={(text) => { setImporting(false); setMessage({ ok: true, text }); }} />}
    </div>
  );
}
