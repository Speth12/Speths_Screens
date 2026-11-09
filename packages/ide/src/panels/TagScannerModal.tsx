import { useEffect, useState } from "react";
import { useProject } from "../store/projectStore";
import { apiBase } from "../store/runtimeTarget";
import { authHeader } from "../store/runtimeAuth";
import { addToNamespace } from "../store/tagPaths";

// ── Shared types ───────────────────────────────────────────────────────────

type TagDef = { Path: string; Description?: string; Writable?: boolean };

function slugify(s: string) {
  return s.replace(/[^a-zA-Z0-9._]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// ── Tag Scanner Modal ──────────────────────────────────────────────────────

function tagGroup(path: string): string {
  const slashIdx = path.lastIndexOf("/");
  if (slashIdx > 0) return path.slice(0, slashIdx);
  const dotIdx = path.lastIndexOf(".");
  if (dotIdx > 0) return path.slice(0, dotIdx);
  return "Tags";
}

function shortLabel(group: string): string {
  const parts = group.split(/[./]/).filter(Boolean);
  return parts.slice(-2).join(".");
}

export function TagScannerModal({
  dsId,
  dsLabel,
  dsType,
  onClose,
}: {
  dsId: string;
  dsLabel: string;
  dsType: string;
  onClose: () => void;
}) {
  const [tags, setTags]         = useState<TagDef[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [filter, setFilter]     = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nsPaths, setNsPaths]   = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [results, setResults]   = useState<{ path: string; ok: boolean; msg: string }[]>([]);
  const [done, setDone]         = useState(false);
  const [mbEntries, setMbEntries] = useState<{ addr: string; name: string }[]>([
    { addr: "holding:0", name: "Register0" },
  ]);

  const { upsertNamespaceNode } = useProject();
  const isModbus = dsType === "mbtcp";

  useEffect(() => {
    if (isModbus) { setLoading(false); return; }
    setLoading(true);
    fetch(`${apiBase}/api/v1/datasources/${dsId}/tags`, { headers: authHeader(apiBase) })
      .then(r => r.ok ? r.json() : Promise.reject("not connected"))
      .then((data: TagDef[]) => { setTags(data ?? []); setLoading(false); })
      .catch(() => { setError("Could not fetch tags — is the runtime running and the datasource connected?"); setLoading(false); });
  }, [dsId, isModbus]);

  const defaultNSPath = (tag: TagDef) =>
    nsPaths[tag.Path] ?? `${slugify(dsLabel)}.${slugify(tag.Path.split("/").pop() ?? tag.Path)}`;

  const filtered = tags.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return t.Path.toLowerCase().includes(q) || (t.Description ?? "").toLowerCase().includes(q);
  });

  // Build groups from filtered list
  const groups = filtered.reduce<Record<string, TagDef[]>>((acc, t) => {
    const g = tagGroup(t.Path);
    (acc[g] ??= []).push(t);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort();

  const toggleTag = (path: string) =>
    setSelected(prev => { const s = new Set(prev); if (s.has(path)) s.delete(path); else s.add(path); return s; });

  const toggleGroup = (key: string) => {
    const paths = (groups[key] ?? []).map(t => t.Path);
    const allOn = paths.every(p => selected.has(p));
    setSelected(prev => {
      const s = new Set(prev);
      if (allOn) paths.forEach(p => s.delete(p));
      else paths.forEach(p => s.add(p));
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.Path)));
  };

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });

  const handlePublish = async () => {
    setPublishing(true);
    const items = isModbus ? mbEntries.filter(e => e.addr.trim()) : filtered.filter(t => selected.has(t.Path));
    const out: { path: string; ok: boolean; msg: string }[] = [];
    for (const item of items) {
      if (isModbus) {
        const mb = item as { addr: string; name: string };
        const nsPath = `${slugify(dsLabel)}.${slugify(mb.name || mb.addr)}`;
        try {
          const { runtimeError } = await addToNamespace(upsertNamespaceNode, nsPath, dsId, mb.addr);
          out.push({ path: nsPath, ok: true, msg: runtimeError ? "added; the runtime gets it on the next deploy" : "added" });
        } catch (e) { out.push({ path: nsPath, ok: false, msg: (e as Error).message }); }
      } else {
        const tag = item as TagDef;
        const nsPath = defaultNSPath(tag);
        try {
          const { runtimeError } = await addToNamespace(upsertNamespaceNode, nsPath, dsId, tag.Path);
          out.push({ path: nsPath, ok: true, msg: runtimeError ? "added; the runtime gets it on the next deploy" : "added" });
        } catch (e) { out.push({ path: nsPath, ok: false, msg: (e as Error).message }); }
      }
    }
    setResults(out);
    setPublishing(false);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 560, maxHeight: "82vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <div className="font-semibold text-sm text-zinc-100">Tag Scanner</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {dsLabel} <span className="font-mono text-zinc-600">[{dsType}]</span>
              {!isModbus && !loading && !error && ` · ${tags.length} tag${tags.length !== 1 ? "s" : ""} in ${groupKeys.length} group${groupKeys.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        {done ? (
          <div className="flex-1 overflow-auto px-5 py-4 space-y-2">
            <div className="text-[11px] text-zinc-400 mb-3">
              {results.filter(r => r.ok).length} of {results.length} tags published to namespace.
            </div>
            {results.map(r => (
              <div key={r.path} className="flex items-center gap-2 text-[11px]">
                <span className={r.ok ? "text-emerald-400" : "text-red-400"}>{r.ok ? "✓" : "✗"}</span>
                <span className="font-mono text-zinc-300 flex-1 truncate">{r.path}</span>
                {!r.ok && <span className="text-red-400 text-[10px] truncate max-w-[180px]">{r.msg}</span>}
              </div>
            ))}
          </div>
        ) : isModbus ? (
          <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
            <div className="text-[11px] text-zinc-400 leading-relaxed">
              Modbus TCP has no automatic tag discovery. Add the registers you want to monitor manually using
              format <code className="text-zinc-300 font-mono">holding:N</code>, <code className="text-zinc-300 font-mono">coil:N</code>, <code className="text-zinc-300 font-mono">input:N</code>.
            </div>
            <div className="space-y-1.5">
              {mbEntries.map((entry, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={entry.addr}
                    onChange={e => setMbEntries(rows => rows.map((r, j) => j === i ? { ...r, addr: e.target.value } : r))}
                    placeholder="holding:100"
                    className="w-32 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                  <span className="text-zinc-600 text-[10px] shrink-0">→ NS:</span>
                  <input value={entry.name}
                    onChange={e => setMbEntries(rows => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                    placeholder="name"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                  <button onClick={() => setMbEntries(rows => rows.filter((_, j) => j !== i))}
                    className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setMbEntries(r => [...r, { addr: `holding:${r.length * 10}`, name: `Register${r.length}` }])}
              className="text-[11px] px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
              + Add register
            </button>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Scanning tags…</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-6 text-center">
            <div className="text-[12px] text-zinc-500">{error}</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search + select-all toolbar */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 shrink-0 border-b border-zinc-800/60">
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="filter tags…"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-600 text-zinc-200"
              />
              <button onClick={toggleAll}
                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0 text-zinc-400 whitespace-nowrap">
                {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
              </button>
              {selected.size > 0 && (
                <span className="text-[10px] text-blue-400 shrink-0">{selected.size} selected</span>
              )}
            </div>

            {/* Grouped tag list */}
            <div className="flex-1 overflow-auto px-3 py-2 space-y-1">
              {filtered.length === 0 && <div className="text-[11px] text-zinc-600 italic px-2 pt-2">No tags match.</div>}
              {groupKeys.map(gKey => {
                const groupTags = groups[gKey] ?? [];
                const allGroupSelected = groupTags.every(t => selected.has(t.Path));
                const someGroupSelected = !allGroupSelected && groupTags.some(t => selected.has(t.Path));
                const isCollapsed = collapsed.has(gKey);

                return (
                  <div key={gKey} className="rounded-lg border border-zinc-800 overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 cursor-pointer select-none"
                      onClick={() => toggleCollapse(gKey)}>
                      <span className="text-[10px] text-zinc-500 w-3 shrink-0">{isCollapsed ? "▸" : "▾"}</span>
                      {/* Group checkbox */}
                      <div
                        className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                          allGroupSelected ? "bg-blue-600 border-blue-500" : someGroupSelected ? "bg-blue-900 border-blue-600" : "border-zinc-600"
                        }`}
                        onClick={e => { e.stopPropagation(); toggleGroup(gKey); }}
                      >
                        {allGroupSelected && <span className="text-[8px] text-white font-bold">✓</span>}
                        {someGroupSelected && <span className="text-[8px] text-blue-400 font-bold">–</span>}
                      </div>
                      <span className="text-[11px] font-medium text-zinc-300 flex-1 truncate">{shortLabel(gKey)}</span>
                      <span className="text-[10px] text-zinc-600 font-mono shrink-0">{groupTags.length}</span>
                      <button
                        className="text-[10px] text-zinc-500 hover:text-blue-400 shrink-0 ml-1"
                        onClick={e => { e.stopPropagation(); toggleGroup(gKey); }}
                      >
                        {allGroupSelected ? "none" : "all"}
                      </button>
                    </div>

                    {/* Tag rows */}
                    {!isCollapsed && (
                      <div className="divide-y divide-zinc-800/40">
                        {groupTags.map(tag => {
                          const isSelected = selected.has(tag.Path);
                          const nsPath = defaultNSPath(tag);
                          const shortName = tag.Path.slice(gKey.length + 1) || tag.Path;
                          return (
                            <div key={tag.Path}
                              className={`transition-colors ${isSelected ? "bg-blue-950/20" : "hover:bg-zinc-800/30"}`}>
                              <div className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer"
                                onClick={() => toggleTag(tag.Path)}>
                                <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                  isSelected ? "bg-blue-600 border-blue-500" : "border-zinc-600"
                                }`}>
                                  {isSelected && <span className="text-[8px] text-white font-bold">✓</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-zinc-200 truncate font-medium">{shortName}</div>
                                  {tag.Description && tag.Description !== tag.Path && (
                                    <div className="text-[10px] text-zinc-500 truncate">{tag.Description}</div>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex items-center gap-1.5 px-3 pb-2">
                                  <span className="text-[9px] text-zinc-600 shrink-0">→ NS:</span>
                                  <input
                                    value={nsPath}
                                    onChange={e => setNsPaths(prev => ({ ...prev, [tag.Path]: e.target.value }))}
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-blue-600"
                                    onClick={e => e.stopPropagation()}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 shrink-0">
          {done ? (
            <button onClick={onClose}
              className="ml-auto text-xs px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose}
                className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
                Skip
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || (!isModbus && selected.size === 0) || (isModbus && mbEntries.filter(e => e.addr.trim()).length === 0)}
                className="text-xs px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium"
              >
                {publishing ? "Publishing…" : `Publish ${!isModbus && selected.size > 0 ? `${selected.size} tags` : ""} to Namespace`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────
