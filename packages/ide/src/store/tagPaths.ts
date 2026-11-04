// Namespace paths first: the IDE binds widgets to ns: paths wherever the
// namespace has the variable, and adds a PLC variable to the namespace in
// one step. Raw "datasource:path" bindings keep working.
import type { NamespaceNode, Project } from "./projectStore";
import { apiFetch } from "./runtimeAuth";

const isTag = (n: NamespaceNode) => n.type === "tag" || n.type === "virtual";

/** The namespace node for a raw "datasource:path" binding, if there is one. */
export function nsNodeFor(project: Project, binding: string): NamespaceNode | undefined {
  if (binding.startsWith("ns:")) return undefined;
  const sep = binding.indexOf(":");
  if (sep <= 0) return undefined;
  const ds = binding.slice(0, sep);
  const addr = binding.slice(sep + 1);
  return (project.namespace ?? []).find((n) => n.type === "tag" && n.driverId === ds && n.driverAddr === addr);
}

/** The binding to use for a tag: its ns: path when the namespace has it. */
export function preferNs(project: Project, binding: string): string {
  const n = nsNodeFor(project, binding);
  return n ? `ns:${n.path}` : binding;
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

/** A namespace path for a PLC variable, not yet taken: "<datasource>.<last part of the address>". */
export function suggestNsPath(project: Project, dsLabel: string, addr: string): string {
  // Also OPC UA node ids: "ns=5;s=Arp.Plc.Eclr/rTemp" gives "rTemp".
  const last = addr.split(/[./\\#:;=]/).filter(Boolean).pop() ?? addr;
  const base = `${slug(dsLabel) || "plc"}.${slug(last) || "tag"}`;
  const taken = new Set((project.namespace ?? []).map((n) => n.path));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** Namespace tags matching what was typed (path, description or PLC address), best first. */
export function nsSuggestions(project: Project, typed: string, limit = 12): NamespaceNode[] {
  const q = typed.replace(/^ns:/, "").toLowerCase();
  const nodes = (project.namespace ?? []).filter(isTag);
  const score = (n: NamespaceNode) => {
    const p = n.path.toLowerCase();
    if (!q) return 1;
    if (p.startsWith(q)) return 0;
    if (p.includes(q)) return 1;
    const other = `${n.description ?? ""} ${n.driverId ?? ""}:${n.driverAddr ?? ""}`.toLowerCase();
    return other.includes(q) ? 2 : -1;
  };
  return nodes
    .map((n) => [score(n), n] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].path.localeCompare(b[1].path))
    .slice(0, limit)
    .map(([, n]) => n);
}

/**
 * Adds a PLC variable to the project's namespace and returns its ns: binding.
 * The project is the source of truth (the runtime takes the namespace on
 * deploy); a reachable runtime is told at once so live values show before
 * the next deploy. `runtimeError` says why it was not, if it was not.
 */
export async function addToNamespace(
  upsert: (n: NamespaceNode) => void,
  nsPath: string,
  driverId: string,
  driverAddr: string,
): Promise<{ binding: string; runtimeError?: string }> {
  upsert({ path: nsPath, type: "tag", driverId, driverAddr });
  try {
    const r = await apiFetch(`/api/v1/namespace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nsPath, type: "tag", driverId, driverAddr }),
    });
    if (!r.ok) return { binding: `ns:${nsPath}`, runtimeError: (await r.text()) || `HTTP ${r.status}` };
  } catch (e) {
    return { binding: `ns:${nsPath}`, runtimeError: (e as Error).message };
  }
  return { binding: `ns:${nsPath}` };
}
