// The project's named variables as a small tree in the left panel, to drag onto a widget on the screen. Dropping a
// variable on a widget binds the widget's value to it. The Variables tab is where variables are made and named; this
// is the quick way to use them while a screen is open.
import { useMemo, useState } from "react";
import { useProject } from "../store/projectStore";
import { nsLeaf, nsTree, type NsTreeNode } from "../store/namespaceOps";
import { LiveValue } from "./LiveValue";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, TagIcon } from "../ui/icons";

/** What the canvas reads on a drop to bind a widget: a tag as a binding ("ns:plant.pump1"). */
export const TAG_BINDING_MIME = "text/x-tag-binding";

const isLeaf = (n: NsTreeNode) => n.node.type === "tag" || n.node.type === "virtual";

export function NamespaceList({ onOpenVariables }: { onOpenVariables: () => void }) {
  const namespace = useProject((s) => s.project.namespace);
  const tree = useMemo(() => nsTree(namespace ?? []), [namespace]);

  if (tree.length === 0) {
    return (
      <div className="px-3 py-3 text-ui-label text-zinc-400 leading-relaxed">
        No named variables yet. Name a datasource's variables in the Variables tab, then drag them from here onto a widget.
        <div className="mt-2">
          <button type="button" onClick={onOpenVariables} className="text-ui-label px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Open Variables</button>
        </div>
      </div>
    );
  }

  return (
    <div role="tree" aria-label="Named variables" className="max-h-80 overflow-auto py-1">
      <div className="px-3 pb-1 text-ui-label text-zinc-500">Drag a variable onto a widget to bind it.</div>
      {tree.map((t) => <Row key={t.node.path} t={t} depth={0} />)}
    </div>
  );
}

function Row({ t, depth }: { t: NsTreeNode; depth: number }) {
  const leaf = isLeaf(t);
  // Top-level folders start open; deeper ones start closed, so only what is in view asks the runtime for values.
  const [open, setOpen] = useState(depth === 0);
  const name = nsLeaf(t.node.path);
  const binding = `ns:${t.node.path}`;

  if (!leaf) {
    return (
      <div role="treeitem" aria-expanded={open} aria-label={name}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ paddingLeft: 8 + depth * 12 }}
          className="w-full flex items-center gap-1.5 h-7 text-ui text-zinc-300 hover:bg-zinc-800/40 text-left">
          {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          <FolderIcon size={12} className="text-amber-500" />
          <span className="flex-1 truncate">{name}</span>
        </button>
        {open && <div role="group">{t.children.map((c) => <Row key={c.node.path} t={c} depth={depth + 1} />)}</div>}
      </div>
    );
  }

  return (
    <div role="treeitem" aria-label={name} draggable
      onDragStart={(e) => { e.dataTransfer.setData(TAG_BINDING_MIME, binding); e.dataTransfer.setData("text/plain", binding); e.dataTransfer.effectAllowed = "copy"; }}
      title={`${binding}\nDrag onto a widget to bind it`} style={{ paddingLeft: 8 + depth * 12 + 16 }}
      className="flex items-center gap-1.5 h-7 pr-3 text-ui text-zinc-100 cursor-grab hover:bg-zinc-800/40">
      <TagIcon size={12} className="text-blue-500 shrink-0" />
      <span className="flex-1 truncate">{name}</span>
      <LiveValue path={binding} className="text-ui-label text-zinc-300 shrink-0" />
    </div>
  );
}
