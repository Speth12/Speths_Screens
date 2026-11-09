// Namespace operations that need no UI: names, the tree (with the folders a flat list implies), moving a node and
// everything that points at it, and turning a datasource's variables into namespace nodes (the import).
import type { NamespaceNode, Project } from "@speths-screens/shared-types";

const NAME = /^[A-Za-z0-9_]+$/;

/** A namespace name is letters, digits and underscores; the dot separates levels. */
export const isNsName = (s: string): boolean => NAME.test(s);
/** Any text as a namespace name: other characters become underscores. */
export const nsName = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

export const nsParent = (path: string): string => (path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "");
export const nsLeaf = (path: string): string => path.slice(path.lastIndexOf(".") + 1);
export const nsJoin = (parent: string, name: string): string => (parent ? `${parent}.${name}` : name);

/** The levels of a PLC address: "ns=6;s=Arp.Plc.Eclr/MainInstance.iInt" gives Arp, Plc, Eclr, MainInstance, iInt. */
export function addrSegments(addr: string): string[] {
  return addr.replace(/^ns=\d+;[sibg]=/, "").split(/[./\\#:;]/).map(nsName).filter(Boolean);
}

/** `parent.leaf`, or `parent.leaf_2` and so on when that is taken. */
export function uniquePath(taken: ReadonlySet<string>, parent: string, leaf: string): string {
  const base = nsJoin(parent, nsName(leaf) || "tag");
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

export type NsTreeNode = { node: NamespaceNode; implicit: boolean; children: NsTreeNode[] };

/** The namespace as a tree. A node whose parent is not a node of its own gets that parent as a folder (marked
 *  implicit), so a flat list written by hand or by an older version still shows its levels. Folders first. */
export function nsTree(nodes: readonly NamespaceNode[]): NsTreeNode[] {
  const byPath = new Map<string, NsTreeNode>();
  for (const n of nodes) byPath.set(n.path, { node: n, implicit: false, children: [] });
  for (const n of nodes) {
    for (let p = nsParent(n.path); p; p = nsParent(p)) {
      if (!byPath.has(p)) byPath.set(p, { node: { path: p, type: "folder" }, implicit: true, children: [] });
    }
  }
  const roots: NsTreeNode[] = [];
  for (const t of byPath.values()) {
    const parent = byPath.get(nsParent(t.node.path));
    (parent ? parent.children : roots).push(t);
  }
  const order = (a: NsTreeNode, b: NsTreeNode) => {
    const fa = a.node.type === "folder" || a.node.type === "asset" ? 0 : 1;
    const fb = b.node.type === "folder" || b.node.type === "asset" ? 0 : 1;
    return fa - fb || nsLeaf(a.node.path).localeCompare(nsLeaf(b.node.path));
  };
  const sort = (list: NsTreeNode[]) => { list.sort(order); list.forEach((t) => sort(t.children)); };
  sort(roots);
  return roots;
}

/** `ns:<path>` where the name ends there or goes on with a dot ("ns:a.b" is in "ns:a.b.c", not in "ns:a.b0"). */
const nsRefPattern = (path: string) => new RegExp(`ns:${path.split(".").join("[.]")}(?![A-Za-z0-9_])`, "g");

/** Every `ns:<from>` in the project (a binding, an expression, an alarm rule, a script) becomes `ns:<to>`, and so
 *  does `ns:<from>.child`. `ns:<from>0` is another name and is left alone. */
export function rewriteNsRefs(project: Project, from: string, to: string): Project {
  const re = nsRefPattern(from);
  return JSON.parse(JSON.stringify(project).replace(re, () => `ns:${to}`)) as Project;
}

/** Moves a node, and what is under it, to a new path, and points everything that used the old path at the new one. */
export function moveNsNode(project: Project, from: string, to: string): { project: Project; error?: string } {
  if (from === to) return { project };
  const nodes = project.namespace ?? [];
  if (!to.split(".").every(isNsName)) return { project, error: "Names use letters, digits and underscores; a dot starts a new level." };
  if (to.startsWith(`${from}.`)) return { project, error: "A folder cannot go inside itself." };
  const taken = new Set(nodes.map((n) => n.path));
  if (taken.has(to)) return { project, error: `${to} already exists.` };
  const moved = nodes.map((n) => (n.path === from ? { ...n, path: to } : n.path.startsWith(`${from}.`) ? { ...n, path: to + n.path.slice(from.length) } : n));
  // A level that exists only because of its children needs no node of its own: the tree draws it as a folder.
  return { project: rewriteNsRefs({ ...project, namespace: moved }, from, to) };
}

/** How many of the leading levels every address shares. Each address keeps its last two levels (a folder and the
 *  variable), so importing one branch still shows that branch's name. */
export function commonPrefixLen(all: readonly string[][]): number {
  if (!all.length) return 0;
  const max = Math.max(0, Math.min(...all.map((s) => s.length - 2)));
  let n = 0;
  while (n < max && all.every((s) => s[n] === all[0]![n])) n++;
  return n;
}

export type ImportPlan = { nodes: NamespaceNode[]; skipped: number };

/** The nodes that importing these variables would add under `root`: folders for the levels of each address, a tag
 *  for each variable. A variable already in the namespace is skipped. `stripShared` drops the levels every chosen
 *  address starts with ("Arp.Plc.Eclr"). */
export function importPlan(
  tags: readonly { path: string }[], dsId: string, root: string, existing: readonly NamespaceNode[], stripShared: boolean,
): ImportPlan {
  const have = new Set(existing.map((n) => `${n.driverId}\u0000${n.driverAddr}`));
  const todo = tags.filter((t) => !have.has(`${dsId}\u0000${t.path}`));
  const segs = todo.map((t) => { const s = addrSegments(t.path); return s.length ? s : [nsName(t.path) || "tag"]; });
  const strip = stripShared ? commonPrefixLen(segs) : 0;
  const taken = new Set(existing.map((n) => n.path));
  const nodes: NamespaceNode[] = [];
  const addFolder = (path: string) => {
    if (!path || taken.has(path)) return;
    addFolder(nsParent(path));
    taken.add(path);
    nodes.push({ path, type: "folder" });
  };
  todo.forEach((t, i) => {
    const levels = segs[i]!.slice(strip);
    const parent = [root, ...levels.slice(0, -1)].filter(Boolean).join(".");
    addFolder(parent);
    const path = uniquePath(taken, parent, levels.at(-1) ?? "tag");
    taken.add(path);
    nodes.push({ path, type: "tag", driverId: dsId, driverAddr: t.path });
  });
  return { nodes, skipped: tags.length - todo.length };
}

/** How many places in the project use `ns:<path>` (or something under it). */
export function countNsRefs(project: Project, path: string): number {
  const { namespace: _n, ...rest } = project;
  void _n;
  const re = nsRefPattern(path);
  return (JSON.stringify(rest).match(re) ?? []).length;
}
