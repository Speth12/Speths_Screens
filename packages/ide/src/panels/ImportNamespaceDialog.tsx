// Import from datasource: browses a controller's variables as the tree its addresses imply (for OPC UA, its own
// structure), lets the user tick what to bring in, shows what that would add, and adds it to the namespace.
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../store/projectStore";
import { addrSegments, importPlan, nsName } from "../store/namespaceOps";
import { publishToRuntime } from "../store/variables";
import { apiFetch } from "../store/runtimeAuth";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, TagIcon } from "../ui/icons";

type TagDef = { Path: string; Description?: string };
type TNode = { name: string; id: string; children: Map<string, TNode>; tags: string[]; all: string[] };

const segmentsOf = (path: string) => { const s = addrSegments(path); return s.length ? s : [nsName(path) || "tag"]; };

/** The addresses as a tree: one level per segment, every node knowing the variables under it. */
export function buildImportTree(paths: readonly string[]): TNode {
  const root: TNode = { name: "", id: "", children: new Map(), tags: [], all: [] };
  for (const p of paths) {
    let node = root;
    node.all.push(p);
    for (const seg of segmentsOf(p)) {
      let next = node.children.get(seg);
      if (!next) { next = { name: seg, id: node.id ? `${node.id}.${seg}` : seg, children: new Map(), tags: [], all: [] }; node.children.set(seg, next); }
      node = next;
      node.all.push(p);
    }
    node.tags.push(p);
  }
  return root;
}

function Check({ state, onChange, label }: { state: "all" | "some" | "none"; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === "some"; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} onChange={onChange} aria-label={label} className="accent-blue-500 shrink-0" />;
}

function BranchRow({ node, depth, picked, toggle, named }: {
  node: TNode; depth: number; picked: Set<string>; toggle: (paths: string[]) => void; named: Set<string>;
}) {
  // The first levels are open, and so is a level with one thing under it (the chain a controller's names share).
  const [open, setOpen] = useState(depth < 3 || (node.children.size === 1 && node.tags.length === 0));
  const n = node.all.filter((p) => picked.has(p)).length;
  const state = n === 0 ? "none" : n === node.all.length ? "all" : "some";
  const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="flex items-center gap-1.5 h-6 text-[11px] hover:bg-zinc-800/40" style={{ paddingLeft: 6 + depth * 14 }}>
        <span className="w-3 text-[9px] text-zinc-500 cursor-pointer" onClick={() => setOpen((o) => !o)}>{kids.length || node.tags.length ? (open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />) : ""}</span>
        <Check state={state} onChange={() => toggle(node.all)} label={`Import ${node.id}`} />
        <FolderIcon size={12} className="text-amber-400" />
        <span className="flex-1 truncate text-zinc-200 cursor-pointer" onClick={() => setOpen((o) => !o)}>{node.name}</span>
        <span className="text-[10px] text-zinc-600 pr-2">{node.all.length}</span>
      </div>
      {open && kids.map((c) => <BranchRow key={c.id} node={c} depth={depth + 1} picked={picked} toggle={toggle} named={named} />)}
      {open && node.tags.map((p) => (
        <div key={p} className="flex items-center gap-1.5 h-6 text-[11px] hover:bg-zinc-800/40" style={{ paddingLeft: 6 + (depth + 1) * 14 + 15 }}>
          <Check state={picked.has(p) ? "all" : "none"} onChange={() => toggle([p])} label={`Import ${p}`} />
          <TagIcon size={12} className="text-blue-400" />
          <span className="flex-1 truncate font-mono text-zinc-300" title={p}>{node.name}</span>
          {named.has(p) && <span className="text-[10px] text-zinc-600 pr-2">has a name</span>}
        </div>
      ))}
    </>
  );
}

export function ImportNamespaceDialog({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const datasources = useProject((s) => s.project.datasources);
  const namespace = useProject((s) => s.project.namespace);
  const [dsId, setDsId] = useState(datasources[0]?.id ?? "");
  const [tags, setTags] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [strip, setStrip] = useState(true);
  const ds = datasources.find((d) => d.id === dsId);
  const [root, setRoot] = useState(() => nsName(datasources[0]?.label ?? "") || "plc");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dsId) return;
    let live = true;
    setLoading(true);
    setError("");
    setPicked(new Set());
    apiFetch(`/api/v1/datasources/${dsId}/tags`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not connected"))))
      .then((data: TagDef[] | null) => { if (live) { setTags(Array.isArray(data) ? data : []); setLoading(false); } })
      .catch(() => { if (live) { setTags([]); setError("Could not read this datasource. Is the runtime running and the datasource connected?"); setLoading(false); } });
    return () => { live = false; };
  }, [dsId]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? tags.filter((t) => t.Path.toLowerCase().includes(q) || (t.Description ?? "").toLowerCase().includes(q)) : tags;
  }, [tags, filter]);
  const tree = useMemo(() => buildImportTree(shown.map((t) => t.Path)), [shown]);
  const named = useMemo(() => new Set((namespace ?? []).filter((n) => n.driverId === dsId && n.driverAddr).map((n) => n.driverAddr!)), [namespace, dsId]);

  const toggle = (paths: string[]) => setPicked((prev) => {
    const next = new Set(prev);
    const allOn = paths.every((p) => next.has(p));
    for (const p of paths) { if (allOn) next.delete(p); else next.add(p); }
    return next;
  });

  const plan = useMemo(
    () => importPlan([...picked].map((path) => ({ path })), dsId, nsName(root), namespace ?? [], strip),
    [picked, dsId, root, namespace, strip],
  );
  const added = plan.nodes.filter((n) => n.type === "tag");
  const topKids = [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name));

  const run = async () => {
    setBusy(true);
    useProject.getState().upsertNamespaceNodes(plan.nodes);
    const failed = await publishToRuntime(plan.nodes);
    onDone(`Imported ${added.length} ${added.length === 1 ? "variable" : "variables"} from ${ds?.label ?? dsId} into ${nsName(root) || "the top"}${plan.skipped ? `; ${plan.skipped} already had a name` : ""}${failed ? "; the runtime takes the rest on the next deploy" : ""}`);
  };

  const btn = "text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40";
  const inp = "bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-600";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" role="dialog" aria-label="Import from datasource">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[820px] max-w-full h-[80vh] flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold">Import from datasource</h3>
          <select value={dsId} onChange={(e) => { setDsId(e.target.value); setRoot(nsName(datasources.find((d) => d.id === e.target.value)?.label ?? "") || "plc"); }} aria-label="Datasource" className={inp}>
            {datasources.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search…" aria-label="Search the datasource" className={`${inp} flex-1`} />
          <button className={btn} onClick={() => setPicked(new Set(shown.map((t) => t.Path)))} disabled={!shown.length}>Select all{filter ? " shown" : ""}</button>
          <button className={btn} onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto py-1">
          {loading ? <div className="p-6 text-xs text-zinc-500 italic">Reading {ds?.label}…</div>
            : error ? <div className="p-6 text-xs text-red-600">{error}</div>
            : shown.length === 0 ? <div className="p-6 text-xs text-zinc-500 italic">{tags.length ? "Nothing matches the search." : "This datasource has no variables to import."}</div>
            : topKids.map((c) => <BranchRow key={c.id} node={c} depth={0} picked={picked} toggle={toggle} named={named} />)}
        </div>
        <div className="flex items-center gap-4 px-4 py-3 border-t border-zinc-800 text-xs flex-wrap">
          <label className="flex items-center gap-2 text-zinc-400">Put them under
            <input value={root} onChange={(e) => setRoot(e.target.value)} aria-label="Folder" className={`${inp} w-36 font-mono`} />
          </label>
          <label className="flex items-center gap-1.5 text-zinc-400"><input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} className="accent-blue-500" />Drop the levels every chosen variable shares</label>
          <span className="flex-1 text-right text-zinc-500">
            {picked.size === 0 ? "Tick what to import" : `${added.length} to add${plan.skipped ? `, ${plan.skipped} already named` : ""}${added[0] ? ` · e.g. ${added[0].path}` : ""}`}
          </span>
          <button className={btn} onClick={onClose}>Cancel</button>
          <button className={`${btn} !bg-blue-700 hover:!bg-blue-600 text-white`} onClick={() => void run()} disabled={busy || added.length === 0}>Import {added.length || ""}</button>
        </div>
      </div>
    </div>
  );
}
