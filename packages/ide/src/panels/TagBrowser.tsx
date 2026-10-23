import { useEffect, useRef, useState, useCallback } from "react";
import { useProject } from "../store/projectStore";
import { apiBase } from "../store/runtimeTarget";
import { tagStoreClient, type TagState } from "../store/tagStoreClient";

// ── Shared types ───────────────────────────────────────────────────────────

type TagDef = { Path: string; Description?: string; Writable?: boolean };
type DSStatus = { connected: boolean; lastError: string; tagCount: number };

type NSNode = {
  path: string;
  name: string;
  type: "folder" | "asset" | "tag" | "virtual";
  dataType?: string;
  unit?: string;
  description?: string;
  driverId?: string;
  driverAddr?: string;
};

function fmtValue(s: TagState | undefined): string {
  if (!s) return "";
  const v = s.value;
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v.length > 16 ? v.slice(0, 16) + "…" : v;
  return JSON.stringify(v).slice(0, 20);
}

function slugify(s: string) {
  return s.replace(/[^a-zA-Z0-9._]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// ── Publish to namespace helper ────────────────────────────────────────────

async function publishToNS(nsPath: string, driverId: string, driverAddr: string, dataType = "float") {
  const r = await fetch(`${apiBase}/api/v1/namespace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: nsPath, driverId, driverAddr, dataType }),
  });
  if (!r.ok) throw new Error(await r.text());
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
    fetch(`${apiBase}/api/v1/datasources/${dsId}/tags`)
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
    setSelected(prev => { const s = new Set(prev); s.has(path) ? s.delete(path) : s.add(path); return s; });

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
    setCollapsed(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const handlePublish = async () => {
    setPublishing(true);
    const items = isModbus ? mbEntries.filter(e => e.addr.trim()) : filtered.filter(t => selected.has(t.Path));
    const out: { path: string; ok: boolean; msg: string }[] = [];
    for (const item of items) {
      if (isModbus) {
        const mb = item as { addr: string; name: string };
        const nsPath = `${slugify(dsLabel)}.${slugify(mb.name || mb.addr)}`;
        try {
          await publishToNS(nsPath, dsId, mb.addr);
          upsertNamespaceNode({ path: nsPath, type: "tag", driverId: dsId, driverAddr: mb.addr });
          out.push({ path: nsPath, ok: true, msg: "published" });
        } catch (e) { out.push({ path: nsPath, ok: false, msg: (e as Error).message }); }
      } else {
        const tag = item as TagDef;
        const nsPath = defaultNSPath(tag);
        try {
          await publishToNS(nsPath, dsId, tag.Path);
          upsertNamespaceNode({ path: nsPath, type: "tag", driverId: dsId, driverAddr: tag.Path });
          out.push({ path: nsPath, ok: true, msg: "published" });
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

export function TagBrowser() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SourceBrowser />
    </div>
  );
}

// ── By-Source browser ──────────────────────────────────────────────────────

function SourceBrowser() {
  const { project, selectedWidgetId, activePageId, updateWidget, upsertNamespaceNode } = useProject();
  const [byDS, setByDS]             = useState<Record<string, TagDef[]>>({});
  const [statusByDS, setStatusByDS] = useState<Record<string, DSStatus | null>>({});
  const [busy, setBusy]             = useState(false);
  const [filter, setFilter]         = useState("");
  const [liveValues, setLiveValues] = useState<Record<string, TagState>>({});
  // Tag key currently expanded for NS publishing
  const [nsExpanded, setNsExpanded] = useState<string | null>(null);
  const [nsDraft, setNsDraft]       = useState("");
  const [nsPublishing, setNsPublishing] = useState(false);
  const [nsMsg, setNsMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  const refresh = async () => {
    setBusy(true);
    const nextTags: Record<string, TagDef[]> = {};
    const nextStatus: Record<string, DSStatus | null> = {};
    for (const ds of project.datasources) {
      try {
        const [tagR, stR] = await Promise.all([
          fetch(`${apiBase}/api/v1/datasources/${ds.id}/tags`),
          fetch(`${apiBase}/api/v1/datasources/${ds.id}/status`),
        ]);
        const data = tagR.ok ? await tagR.json() : null;
        nextTags[ds.id] = Array.isArray(data) ? data : [];
        nextStatus[ds.id] = stR.ok ? (await stR.json()) as DSStatus : null;
      } catch {
        nextTags[ds.id] = [];
        nextStatus[ds.id] = null;
      }
    }
    setByDS(nextTags);
    setStatusByDS(nextStatus);
    setBusy(false);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [project.datasources.length]);

  useEffect(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    const nextValues: Record<string, TagState> = {};
    for (const [dsId, tags] of Object.entries(byDS)) {
      for (const t of tags) {
        const path = `${dsId}:${t.Path}`;
        const unsub = tagStoreClient.subscribe(path, (state) => {
          setLiveValues((prev) => ({ ...prev, [path]: state }));
        });
        unsubsRef.current.push(unsub);
        const cached = tagStoreClient.get(path);
        if (cached) nextValues[path] = cached;
      }
    }
    if (Object.keys(nextValues).length) setLiveValues(nextValues);
    return () => { unsubsRef.current.forEach((u) => u()); unsubsRef.current = []; };
  }, [byDS]);

  const bind = (dsId: string, path: string) => {
    if (!selectedWidgetId) return;
    updateWidget(activePageId, selectedWidgetId, { binding: `${dsId}:${path}` });
  };

  const openNS = (tagKey: string, tagPath: string, dsLabel: string) => {
    if (nsExpanded === tagKey) { setNsExpanded(null); return; }
    setNsExpanded(tagKey);
    setNsMsg(null);
    // Pre-fill NS path: dsLabel.last-segment-of-tagPath
    const last = tagPath.split(/[./\\]/).pop() ?? tagPath;
    setNsDraft(`${slugify(dsLabel)}.${slugify(last)}`);
  };

  const doPublishNS = async (dsId: string, driverAddr: string) => {
    if (!nsDraft.trim()) return;
    setNsPublishing(true);
    setNsMsg(null);
    try {
      await publishToNS(nsDraft.trim(), dsId, driverAddr);
      upsertNamespaceNode({ path: nsDraft.trim(), type: "tag", driverId: dsId, driverAddr });
      setNsMsg({ ok: true, text: "Published!" });
      setTimeout(() => { setNsExpanded(null); setNsMsg(null); }, 1200);
    } catch (e) {
      setNsMsg({ ok: false, text: (e as Error).message });
    } finally {
      setNsPublishing(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Tags</div>
        <button onClick={refresh} disabled={busy} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">
          {busy ? "…" : "refresh"}
        </button>
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter tags…"
        className="w-full mb-2 text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
      />

      {project.datasources.length === 0 && (
        <div className="text-xs text-zinc-500">No datasources. Add one in the project header.</div>
      )}

      {project.datasources.map((ds) => {
        const tags = byDS[ds.id] ?? [];
        const st = statusByDS[ds.id];
        return (
          <div key={ds.id} className="mb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-semibold text-zinc-300">{ds.label || ds.id}</span>
              <span className="text-zinc-500 text-[10px]">[{ds.type}]</span>
              {st != null && (
                <span className={`text-[10px] ml-auto ${st.connected ? "text-emerald-500" : "text-red-400"}`}>
                  {st.connected ? "●" : "○"}
                </span>
              )}
            </div>

            {st != null && !st.connected && st.lastError && (
              <div className="text-[10px] text-red-400 mb-1 break-all">{st.lastError}</div>
            )}

            <div className="space-y-0.5">
              {tags
                .filter((t) => {
                  if (!filter) return true;
                  const q = filter.toLowerCase();
                  return t.Path.toLowerCase().includes(q) || (t.Description ?? "").toLowerCase().includes(q);
                })
                .slice(0, 200)
                .map((t) => {
                  const tagKey = `${ds.id}:${t.Path}`;
                  const live = liveValues[tagKey];
                  const valueText = fmtValue(live);
                  const isGood = live?.quality === "Good";
                  const nsOpen = nsExpanded === tagKey;

                  return (
                    <div key={t.Path} className={`rounded ${nsOpen ? "border border-zinc-700 bg-zinc-800/40" : ""}`}>
                      {/* Main tag row */}
                      <div className="flex items-center group gap-1">
                        <button
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/x-tag-binding", tagKey);
                            e.dataTransfer.effectAllowed = "link";
                          }}
                          onClick={() => bind(ds.id, t.Path)}
                          title={`${tagKey} — drag onto a widget to bind`}
                          className="flex items-center flex-1 min-w-0 text-left py-0.5 px-1.5 rounded hover:bg-zinc-800 cursor-grab active:cursor-grabbing gap-1.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] truncate">{t.Description || t.Path}</div>
                            {t.Description && (
                              <div className="text-[10px] font-mono text-zinc-500 truncate">{t.Path}</div>
                            )}
                          </div>
                          {valueText && (
                            <span className={`text-[10px] font-mono shrink-0 tabular-nums ${isGood ? "text-emerald-400" : "text-zinc-500"}`}>
                              {valueText}
                            </span>
                          )}
                        </button>
                        {/* Add to namespace button */}
                        <button
                          onClick={() => openNS(tagKey, t.Path, ds.label || ds.id)}
                          title="Add to namespace"
                          className={`shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1 py-0.5 rounded transition-all ${
                            nsOpen
                              ? "opacity-100 text-blue-400 bg-blue-950/40"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
                          }`}
                        >
                          ⊕
                        </button>
                      </div>

                      {/* Inline NS path editor */}
                      {nsOpen && (
                        <div className="px-2 pb-2 pt-1 space-y-1.5">
                          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Publish to namespace</div>
                          <div className="flex gap-1.5 items-center">
                            <input
                              value={nsDraft}
                              onChange={e => setNsDraft(e.target.value)}
                              placeholder="Plant.Line1.TagName"
                              autoFocus
                              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-blue-600"
                            />
                            <button
                              onClick={() => doPublishNS(ds.id, t.Path)}
                              disabled={nsPublishing || !nsDraft.trim()}
                              className="shrink-0 text-[10px] px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white font-medium"
                            >
                              {nsPublishing ? "…" : "Add"}
                            </button>
                          </div>
                          {nsMsg && (
                            <div className={`text-[10px] ${nsMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                              {nsMsg.ok ? "✓ " : "✗ "}{nsMsg.text}
                            </div>
                          )}
                          <div className="text-[9px] text-zinc-600">
                            Driver addr: <span className="font-mono text-zinc-500">{t.Path}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {tags.length === 0 && st?.connected && ds.type === "mbtcp" && (
                <div className="text-[10px] text-zinc-500 italic">
                  Connected. Modbus has no tag discovery — bind widgets to paths like{" "}
                  <span className="font-mono">holding:100</span> or{" "}
                  <span className="font-mono">coil:0</span>.
                </div>
              )}
              {tags.length === 0 && (!st || !st.connected) && (
                <div className="text-[11px] text-zinc-600 italic">
                  {st == null ? "not deployed" : "not connected"}
                </div>
              )}
              {tags.length === 0 && st?.connected && ds.type === "rest" && (
                <div className="text-[10px] text-zinc-500 italic">
                  Connected. Click <span className="font-semibold">refresh</span> to browse tags,
                  or bind widgets to paths like{" "}
                  <span className="font-mono">sensors#temperature</span>.
                </div>
              )}
              {tags.length === 0 && st?.connected && ds.type !== "mbtcp" && ds.type !== "rest" && (
                <div className="text-[11px] text-zinc-600 italic">connected — no tags found</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Namespace browser ──────────────────────────────────────────────────────

function NamespaceBrowser() {
  const { selectedWidgetId, activePageId, updateWidget } = useProject();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NSNode[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tree root children
  const [rootNodes, setRootNodes] = useState<NSNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, NSNode[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  // Live values for visible tags
  const [liveValues, setLiveValues] = useState<Record<string, TagState>>({});
  const unsubsRef = useRef<Map<string, () => void>>(new Map());

  const bindNSNode = (node: NSNode) => {
    if (!selectedWidgetId) return;
    if (node.type !== "tag" && node.type !== "virtual") return;
    updateWidget(activePageId, selectedWidgetId, { binding: `ns:${node.path}` });
  };

  const subscribeTag = useCallback((path: string) => {
    if (unsubsRef.current.has(path)) return;
    const unsub = tagStoreClient.subscribe(path, (state) => {
      setLiveValues((prev) => ({ ...prev, [path]: state }));
    });
    unsubsRef.current.set(path, unsub);
    const cached = tagStoreClient.get(path);
    if (cached) setLiveValues((prev) => ({ ...prev, [path]: cached }));
  }, []);

  // Load root on mount
  useEffect(() => {
    fetch(`${apiBase}/api/v1/namespace/tree?path=`)
      .then((r) => r.ok ? r.json() : [])
      .then((nodes: NSNode[]) => {
        setRootNodes(nodes ?? []);
        for (const n of (nodes ?? [])) {
          if (n.type === "tag" || n.type === "virtual") subscribeTag(`ns:${n.path}`);
        }
      })
      .catch(() => setRootNodes([]));
    return () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current.clear();
    };
  }, [subscribeTag]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`${apiBase}/api/v1/namespace/search?q=${encodeURIComponent(query)}`);
        const data: NSNode[] = r.ok ? await r.json() : [];
        setSearchResults(data ?? []);
        for (const n of (data ?? [])) {
          if (n.type === "tag" || n.type === "virtual") subscribeTag(`ns:${n.path}`);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, subscribeTag]);

  const toggleExpand = async (path: string) => {
    if (expanded.has(path)) {
      setExpanded((prev) => { const s = new Set(prev); s.delete(path); return s; });
      return;
    }
    setExpanded((prev) => new Set(prev).add(path));
    if (children[path]) return;
    setLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const r = await fetch(`${apiBase}/api/v1/namespace/tree?path=${encodeURIComponent(path)}`);
      const data: NSNode[] = r.ok ? await r.json() : [];
      setChildren((prev) => ({ ...prev, [path]: data ?? [] }));
      for (const n of (data ?? [])) {
        if (n.type === "tag" || n.type === "virtual") subscribeTag(`ns:${n.path}`);
      }
    } catch {
      setChildren((prev) => ({ ...prev, [path]: [] }));
    } finally {
      setLoadingPaths((prev) => { const s = new Set(prev); s.delete(path); return s; });
    }
  };

  const isLeaf = (n: NSNode) => n.type === "tag" || n.type === "virtual";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-zinc-800 shrink-0">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search namespace…"
            className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 pr-6"
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 animate-pulse">…</span>
          )}
          {query && !searching && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs"
            >×</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {searchResults !== null ? (
          <div className="p-2">
            {searchResults.length === 0 ? (
              <div className="text-[11px] text-zinc-600 italic px-1">No results.</div>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map((n) => (
                  <NSNodeRow
                    key={n.path}
                    node={n}
                    depth={0}
                    live={liveValues[`ns:${n.path}`]}
                    onBind={bindNSNode}
                    hasWidget={!!selectedWidgetId}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
            {rootNodes.length === 0 ? (
              <div className="text-[11px] text-zinc-600 italic px-1 pt-2">
                Namespace is empty. Deploy a project or create nodes via the API.
              </div>
            ) : (
              <NSTree
                nodes={rootNodes}
                depth={0}
                expanded={expanded}
                children={children}
                loadingPaths={loadingPaths}
                liveValues={liveValues}
                onToggle={toggleExpand}
                onBind={bindNSNode}
                hasWidget={!!selectedWidgetId}
                isLeaf={isLeaf}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree renderer ──────────────────────────────────────────────────────────

function NSTree({
  nodes, depth, expanded, children, loadingPaths, liveValues, onToggle, onBind, hasWidget, isLeaf,
}: {
  nodes: NSNode[];
  depth: number;
  expanded: Set<string>;
  children: Record<string, NSNode[]>;
  loadingPaths: Set<string>;
  liveValues: Record<string, TagState>;
  onToggle: (path: string) => void;
  onBind: (node: NSNode) => void;
  hasWidget: boolean;
  isLeaf: (n: NSNode) => boolean;
}) {
  return (
    <div>
      {nodes.map((n) => (
        <div key={n.path}>
          <NSNodeRow
            node={n}
            depth={depth}
            live={liveValues[`ns:${n.path}`]}
            onBind={onBind}
            hasWidget={hasWidget}
            expanded={expanded.has(n.path)}
            loading={loadingPaths.has(n.path)}
            onToggle={isLeaf(n) ? undefined : () => onToggle(n.path)}
          />
          {!isLeaf(n) && expanded.has(n.path) && (
            <NSTree
              nodes={children[n.path] ?? []}
              depth={depth + 1}
              expanded={expanded}
              children={children}
              loadingPaths={loadingPaths}
              liveValues={liveValues}
              onToggle={onToggle}
              onBind={onBind}
              hasWidget={hasWidget}
              isLeaf={isLeaf}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Single node row ────────────────────────────────────────────────────────

const NODE_ICONS: Record<NSNode["type"], string> = {
  folder:  "▸",
  asset:   "◈",
  tag:     "◎",
  virtual: "⊕",
};

function NSNodeRow({
  node, depth, live, onBind, hasWidget, expanded, loading, onToggle,
}: {
  node: NSNode;
  depth: number;
  live?: TagState;
  onBind: (node: NSNode) => void;
  hasWidget: boolean;
  expanded?: boolean;
  loading?: boolean;
  onToggle?: () => void;
}) {
  const isTag = node.type === "tag" || node.type === "virtual";
  const valueText = fmtValue(live);
  const isGood = live?.quality === "Good";

  // Always bind as ns:path so the runtime resolves via the namespace tree
  const nsBinding = `ns:${node.path}`;

  return (
    <div
      style={{ paddingLeft: depth * 12 + 4 }}
      className={`flex items-center group min-w-0 rounded py-0.5 pr-1 gap-1 ${
        isTag && hasWidget
          ? "hover:bg-zinc-800 cursor-pointer"
          : isTag
          ? "cursor-grab active:cursor-grabbing hover:bg-zinc-800/50"
          : "hover:bg-zinc-800/40"
      }`}
      draggable={isTag}
      onDragStart={isTag ? (e) => {
        e.dataTransfer.setData("text/x-tag-binding", nsBinding);
        e.dataTransfer.effectAllowed = "link";
      } : undefined}
      onClick={isTag ? () => onBind(node) : onToggle}
      title={isTag ? `${node.path}${node.description ? " — " + node.description : ""}` : node.path}
    >
      {onToggle ? (
        <span
          className={`text-[10px] text-zinc-500 shrink-0 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {loading ? "·" : "▸"}
        </span>
      ) : (
        <span className="w-3 shrink-0" />
      )}

      <span className={`text-[10px] shrink-0 ${
        node.type === "folder"  ? "text-zinc-600" :
        node.type === "asset"   ? "text-blue-500" :
        node.type === "virtual" ? "text-amber-500" :
        "text-zinc-400"
      }`}>
        {expanded !== undefined && !loading ? (expanded ? "▾" : NODE_ICONS[node.type]) : NODE_ICONS[node.type]}
      </span>

      <div className="flex-1 min-w-0">
        <span className={`text-[11px] truncate block ${isTag ? "text-zinc-200" : "text-zinc-400"}`}>
          {node.name}
        </span>
        {isTag && (node.unit || node.dataType) && (
          <span className="text-[9px] text-zinc-600 block truncate">
            {[node.dataType, node.unit].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {isTag && (
        valueText
          ? <span className={`text-[10px] font-mono shrink-0 tabular-nums ml-1 ${isGood ? "text-emerald-400" : "text-zinc-500"}`}>{valueText}</span>
          : !node.driverId
            ? <span className="text-[9px] text-amber-600 shrink-0 ml-1" title="No driver binding — drag a source tag onto this node or use ⊕ to bind it">⚠ unbound</span>
            : null
      )}
    </div>
  );
}
