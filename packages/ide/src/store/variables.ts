// Every variable the datasources offer, in one flat list: what the controllers report when asked to browse, and the
// variables the project itself defines for a memory or computed datasource, which show before the project is deployed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NamespaceNode } from "@speths-screens/shared-types";
import { useProject } from "./projectStore";
import { apiFetch } from "./runtimeAuth";

export type Variable = { key: string; dsId: string; dsLabel: string; dsType: string; path: string; description?: string; writable?: boolean };
export type DsStatus = { connected: boolean; lastError: string; tagCount: number };
export type TagDef = { Path: string; Description?: string; Writable?: boolean };

/**
 * The variables the project defines for a datasource that has them in its own settings (memory tags, computed tags).
 * The runtime only reports them once the project is deployed; the editor knows them at once.
 */
export function projectTags(ds: { type: string; config: unknown }): TagDef[] {
  const config = (ds.config ?? {}) as { memoryTags?: { path: string; type: string }[]; tags?: { path: string; expr: string }[] };
  if (ds.type === "memory") return (config.memoryTags ?? []).filter((t) => t.path).map((t) => ({ Path: t.path, Description: `memory variable, ${t.type}`, Writable: true }));
  if (ds.type === "virtual") return (config.tags ?? []).filter((t) => t.path).map((t) => ({ Path: t.path, Description: `computed: ${t.expr}`, Writable: false }));
  return [];
}

/** What the runtime reported for a datasource, then the project's own variables it did not report. */
export function withProjectTags(ds: { type: string; config: unknown }, reported: readonly TagDef[]): TagDef[] {
  const have = new Set(reported.map((t) => t.Path));
  return [...reported, ...projectTags(ds).filter((t) => !have.has(t.Path))];
}

/** The key of a variable as a binding: "datasource:address". */
export const varKey = (dsId: string, path: string) => `${dsId}:${path}`;

export function useVariables() {
  const datasources = useProject((s) => s.project.datasources);
  const [vars, setVars] = useState<Variable[]>([]);
  const [status, setStatus] = useState<Record<string, DsStatus | null>>({});
  const [loading, setLoading] = useState(false);
  // A slower, older load must not replace a newer one.
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    const all: Variable[] = [];
    const st: Record<string, DsStatus | null> = {};
    await Promise.all(datasources.map(async (ds) => {
      try {
        const [tagR, stR] = await Promise.all([apiFetch(`/api/v1/datasources/${ds.id}/tags`), apiFetch(`/api/v1/datasources/${ds.id}/status`)]);
        const data = tagR.ok ? ((await tagR.json()) as TagDef[] | null) : null;
        for (const t of withProjectTags(ds, Array.isArray(data) ? data : [])) {
          all.push({ key: varKey(ds.id, t.Path), dsId: ds.id, dsLabel: ds.label, dsType: ds.type, path: t.Path, description: t.Description, writable: t.Writable });
        }
        st[ds.id] = stR.ok ? ((await stR.json()) as DsStatus) : null;
      } catch {
        // The runtime did not answer: the variables the project defines are still listed.
        for (const t of projectTags(ds)) all.push({ key: varKey(ds.id, t.Path), dsId: ds.id, dsLabel: ds.label, dsType: ds.type, path: t.Path, description: t.Description, writable: t.Writable });
        st[ds.id] = null;
      }
    }));
    if (mine !== seq.current) return;
    all.sort((a, b) => a.dsLabel.localeCompare(b.dsLabel) || a.path.localeCompare(b.path));
    setVars(all);
    setStatus(st);
    setLoading(false);
  }, [datasources]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { vars, status, loading, refresh };
}

/** The namespace node of each variable that already has one, by variable key. */
export function useNamespaceIndex(): Map<string, NamespaceNode> {
  const namespace = useProject((s) => s.project.namespace);
  return useMemo(() => {
    const m = new Map<string, NamespaceNode>();
    for (const n of namespace ?? []) if (n.type === "tag" && n.driverId && n.driverAddr) m.set(varKey(n.driverId, n.driverAddr), n);
    return m;
  }, [namespace]);
}

const MAX_PARALLEL = 6;

/** Tells a reachable runtime about new namespace tags so live values show before the next deploy (the project is
 *  the source of truth, and the runtime takes the namespace on deploy). Returns how many it did not take. */
export async function publishToRuntime(nodes: readonly NamespaceNode[]): Promise<number> {
  const tags = nodes.filter((n) => n.type === "tag");
  let failed = 0;
  for (let i = 0; i < tags.length; i += MAX_PARALLEL) {
    await Promise.all(tags.slice(i, i + MAX_PARALLEL).map(async (n) => {
      try {
        const r = await apiFetch("/api/v1/namespace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) });
        if (!r.ok) failed++;
      } catch { failed++; }
    }));
  }
  return failed;
}
