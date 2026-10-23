import { useState, useEffect } from "react";
import { useProject, type DatasourceType, type CanvasResolution, type CanvasSnap } from "../store/projectStore";
import { SYMBOL_PACKS, SYMBOLS } from "../data/symbols";
import { Alarms, AlarmBadge } from "./Alarms";
import { Recipes } from "./Recipes";
import { Users } from "./Users";
import { TagBrowser, TagScannerModal } from "./TagBrowser";
import { generateStandaloneHtml } from "../store/exportHtml";
import { AuditTrail } from "./AuditTrail";
import { AssetModel } from "./AssetModel";
import { Faceplates } from "./Faceplates";
import { Namespace } from "./Namespace";
import { MCPModal } from "./MCPModal";
import { downloadGitFormat, importGitFormat } from "../store/gitFormat";
import { apiBase } from "../store/runtimeTarget";

type DSStatus = "connected" | "disconnected" | "unknown";

function useDSStatus(dsIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, DSStatus>>({});
  useEffect(() => {
    const poll = async () => {
      const next: Record<string, DSStatus> = {};
      await Promise.all(dsIds.map(async (id) => {
        try {
          const r = await fetch(`${apiBase}/api/v1/datasources/${encodeURIComponent(id)}/status`);
          if (!r.ok) { next[id] = "disconnected"; return; }
          const data = await r.json() as { connected: boolean };
          next[id] = data.connected ? "connected" : "disconnected";
        } catch { next[id] = "unknown"; }
      }));
      setStatuses(next);
    };
    if (dsIds.length) poll();
    const iv = setInterval(() => { if (dsIds.length) poll(); }, 5000);
    return () => clearInterval(iv);
  }, [dsIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return statuses;
}

// ── Collapsible tree section ──────────────────────────────────────────────────

function TreeSection({
  label, count, badge, action, defaultOpen = false, children,
}: {
  label: string;
  count?: number;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800/60">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-zinc-800/30 group"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-zinc-600 text-[9px] w-3 shrink-0">{open ? "▾" : "▸"}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium flex-1">{label}</span>
        {badge}
        {count !== undefined && count > 0 && (
          <span className="text-[9px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">{count}</span>
        )}
        {action && (
          <span onClick={(e) => e.stopPropagation()}>{action}</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

// ── Main LeftPanel — project tree ─────────────────────────────────────────────

export function LeftPanel({ width }: { width?: number }) {
  const {
    project, activePageId, setActivePage,
    addPage, renamePage, removePage,
    addDatasource, removeDatasource,
    exportJSON, loadProject, newProject,
  } = useProject();

  const [showMCP,    setShowMCP]    = useState(false);
  const [showAddDS,  setShowAddDS]  = useState(false);
  const [scannerDS,  setScannerDS]  = useState<{ id: string; label: string; type: string } | null>(null);
  const [renaming,   setRenaming]   = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deploying,  setDeploying]  = useState(false);
  const [deployMsg,  setDeployMsg]  = useState("");
  const [autosaved,  setAutosaved]  = useState(false);

  const dsStatuses = useDSStatus(project.datasources.map((d) => d.id));

  // Autosave indicator — flash for 2s after any project change
  useEffect(() => {
    setAutosaved(true);
    const t = setTimeout(() => setAutosaved(false), 2000);
    return () => clearTimeout(t);
  }, [project]);

  const setName = (name: string) => {
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, name: name || undefined });
  };

  const setProp = (patch: Partial<typeof project>) => {
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, ...patch });
  };

  const doDeploy = async () => {
    setDeploying(true); setDeployMsg("");
    try {
      const r = await fetch(`${apiBase}/api/v1/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: exportJSON(),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; datasources?: number; pages?: number };
      setDeployMsg(r.ok ? `✓ Deployed (${data.datasources ?? 0} ds, ${data.pages ?? 0} pg)` : `✗ ${data.error}`);
    } catch (e) { setDeployMsg(`✗ ${(e as Error).message}`); }
    finally { setDeploying(false); setTimeout(() => setDeployMsg(""), 4000); }
  };

  const exportHtml = () => {
    const html = generateStandaloneHtml(project, "");
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${(project.name ?? "project").replace(/\s+/g, "-")}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importGit = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(reader.result as string) as Record<string, unknown>;
          if (raw._gitFormat) {
            const strMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(raw._files as Record<string, unknown>)) strMap[k] = JSON.stringify(v);
            loadProject(importGitFormat(strMap));
          } else { loadProject(raw as Parameters<typeof loadProject>[0]); }
        } catch (e) { alert(`Import failed: ${(e as Error).message}`); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const startRename = (id: string, name: string) => { setRenaming(id); setRenameDraft(name); };
  const commitRename = () => {
    if (renaming && renameDraft.trim()) renamePage(renaming, renameDraft.trim());
    setRenaming(null);
  };

  const inp = "bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

  return (
    <div className="shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col min-h-0" style={{ width: width ?? 280 }}>

      {/* ── Project header ──────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2 border-b border-zinc-800 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={project.name ?? ""}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled Project"
            className={`flex-1 min-w-0 ${inp}`}
          />
          <button
            onClick={() => { if (window.confirm("Start a new blank project? Unsaved changes will be lost.")) newProject(); }}
            title="New project"
            className="shrink-0 text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
          >New</button>
        </div>
        <div className="flex items-center justify-between min-h-[14px]">
          {autosaved
            ? <span className="text-[9px] text-emerald-500">✓ Autosaved</span>
            : <span className="text-[9px] text-zinc-600">autosave on</span>
          }
        </div>
      </div>

      {/* ── Tree body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">

        {/* Pages */}
        <TreeSection
          label="Pages"
          count={project.pages.length}
          defaultOpen
          action={
            <button
              onClick={() => addPage()}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            >+ Add</button>
          }
        >
          <div className="pb-1">
            {project.pages.map((pg) => (
              <div
                key={pg.id}
                onClick={() => setActivePage(pg.id)}
                className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors ${
                  pg.id === activePageId
                    ? "bg-blue-600/20 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <span className={`text-[8px] shrink-0 ${pg.id === activePageId ? "text-blue-400" : "text-zinc-600"}`}>●</span>
                {renaming === pg.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-1 text-xs focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(pg.id, pg.name); }}
                  >{pg.name}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); if (project.pages.length > 1) removePage(pg.id); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-[11px] shrink-0 transition-opacity"
                  title="Remove page"
                >×</button>
              </div>
            ))}
          </div>
        </TreeSection>

        {/* Datasources */}
        <TreeSection
          label="Datasources"
          count={project.datasources.length}
          defaultOpen
          action={
            <button
              onClick={() => setShowAddDS(true)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            >+ Add</button>
          }
        >
          <div className="pb-1">
            {project.datasources.length === 0 && (
              <div className="px-4 py-2 text-[11px] text-zinc-600 italic">No datasources yet</div>
            )}
            {project.datasources.map((d) => {
              const st = dsStatuses[d.id] ?? "unknown";
              const dot = st === "connected" ? "bg-emerald-400" : st === "disconnected" ? "bg-red-500" : "bg-zinc-600";
              return (
                <div key={d.id} className="group flex items-center gap-2 px-4 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} title={st} />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setScannerDS({ id: d.id, label: d.label, type: d.type })}
                    title="Click to scan tags / publish to namespace"
                  >
                    <div className="text-[11px] text-zinc-200 truncate">{d.label}</div>
                    <div className="text-[9px] text-zinc-600 font-mono">[{d.id}] {d.type}</div>
                  </div>
                  <button
                    onClick={() => setScannerDS({ id: d.id, label: d.label, type: d.type })}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-blue-400 text-[10px] shrink-0 transition-opacity"
                    title="Scan tags"
                  >⊕</button>
                  <button
                    onClick={() => removeDatasource(d.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-[11px] shrink-0 transition-opacity"
                    title="Remove datasource"
                  >×</button>
                </div>
              );
            })}
          </div>
        </TreeSection>

        {/* Tags */}
        <TreeSection label="Tags">
          <TagBrowser />
        </TreeSection>

        {/* Namespace */}
        <TreeSection label="Namespace" count={project.namespace?.length}>
          <Namespace />
        </TreeSection>

        {/* Alarms */}
        <TreeSection
          label="Alarms"
          count={project.alarmRules?.length}
          badge={<AlarmBadge />}
        >
          <Alarms />
        </TreeSection>

        {/* Recipes */}
        <TreeSection label="Recipes" count={project.recipes?.length}>
          <Recipes />
        </TreeSection>

        {/* Users */}
        <TreeSection label="Users" count={project.users?.length}>
          <Users />
        </TreeSection>

        {/* Assets & Faceplates */}
        <TreeSection label="Assets">
          <AssetModel />
        </TreeSection>

        <TreeSection label="Faceplates" count={project.faceplates?.length}>
          <Faceplates />
        </TreeSection>

        {/* Settings */}
        <TreeSection label="Settings">
          <div className="p-3 space-y-4">
            {/* Security */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Security</div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Operator PIN (blank = no lock)</div>
                  <input
                    type="password"
                    value={project.pin ?? ""}
                    onChange={(e) => setProp({ pin: e.target.value || undefined })}
                    placeholder="e.g. 1234"
                    className={`w-full ${inp}`}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={project.viewOnly ?? false}
                    onChange={(e) => setProp({ viewOnly: e.target.checked || undefined })}
                    className="accent-blue-500" />
                  <span className="text-xs text-zinc-300">View-only (disable all writes)</span>
                </label>
              </div>
            </div>
            <CanvasSettings />
            <SymbolPacksSettings />
          </div>
        </TreeSection>

        {/* Audit */}
        <TreeSection label="Audit">
          <AuditTrail />
        </TreeSection>

      </div>

      {/* ── Bottom action bar ────────────────────────────────────────── */}
      <div className="border-t border-zinc-800 p-2 space-y-1 shrink-0">
        {deployMsg && <div className="text-[10px] text-zinc-400 truncate px-1">{deployMsg}</div>}
        <button
          onClick={doDeploy}
          disabled={deploying}
          className="w-full text-xs py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
        >
          <span>{deploying ? "⏳" : "↑"}</span>
          {deploying ? "Deploying…" : "Deploy to Runtime"}
        </button>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={exportHtml} className="text-[10px] py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400" title="Export standalone HTML">⬇ HTML</button>
          <button onClick={() => downloadGitFormat(project)} className="text-[10px] py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400" title="Export Git format">⬇ Git</button>
          <button onClick={importGit} className="text-[10px] py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400" title="Import project">⬆ Import</button>
        </div>
        <button onClick={() => setShowMCP(true)} className="w-full text-[10px] py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500">⚙ MCP Setup</button>
      </div>

      {/* Modals */}
      {showAddDS && (
        <AddDatasourceModal
          onClose={() => setShowAddDS(false)}
          onAdd={(ds) => { addDatasource(ds); setShowAddDS(false); setScannerDS({ id: ds.id, label: ds.label, type: ds.type }); }}
        />
      )}
      {scannerDS && (
        <TagScannerModal dsId={scannerDS.id} dsLabel={scannerDS.label} dsType={scannerDS.type} onClose={() => setScannerDS(null)} />
      )}
      {showMCP && <MCPModal onClose={() => setShowMCP(false)} />}
    </div>
  );
}

// ── Symbol Packs ──────────────────────────────────────────────────────────────

function SymbolPacksSettings() {
  const { project, exportJSON, loadProject } = useProject();
  const enabled: string[] = project.enabledSymbolPacks ?? SYMBOL_PACKS.map(p => p.id);

  const toggle = (packId: string) => {
    const next = enabled.includes(packId)
      ? enabled.filter(id => id !== packId)
      : [...enabled, packId];
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, enabledSymbolPacks: next });
  };

  const toggleAll = () => {
    const allEnabled = SYMBOL_PACKS.every(p => enabled.includes(p.id));
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, enabledSymbolPacks: allEnabled ? [] : SYMBOL_PACKS.map(p => p.id) });
  };

  const allOn = SYMBOL_PACKS.every(p => enabled.includes(p.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Symbol Packs</div>
        <button
          onClick={toggleAll}
          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
        >
          {allOn ? "disable all" : "enable all"}
        </button>
      </div>
      <div className="space-y-1.5">
        {SYMBOL_PACKS.map(pack => {
          const on = enabled.includes(pack.id);
          const count = SYMBOLS.filter(s => s.packId === pack.id).length;
          return (
            <label
              key={pack.id}
              className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                on
                  ? "border-blue-600/40 bg-blue-950/30"
                  : "border-zinc-800 bg-zinc-900/40 opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(pack.id)}
                className="mt-0.5 accent-blue-500 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-zinc-200 leading-tight">{pack.name}</div>
                <div className="text-[10px] text-zinc-500 leading-tight mt-0.5 truncate">{pack.description}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">{count} symbols</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Canvas Settings ───────────────────────────────────────────────────────────

const RES_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1920×1080", w: 1920, h: 1080 },
  { label: "1280×720",  w: 1280, h: 720  },
  { label: "1024×768",  w: 1024, h: 768  },
  { label: "800×600",   w: 800,  h: 600  },
];

function CanvasSettings() {
  const { project, exportJSON, loadProject } = useProject();
  const res: CanvasResolution = project.canvasResolution ?? { type: "dynamic" };
  const snap: CanvasSnap = project.canvasSnap ?? "grid";

  const [fw, setFw] = useState<number>(res.type === "fixed" ? res.width  : 1920);
  const [fh, setFh] = useState<number>(res.type === "fixed" ? res.height : 1080);

  const COL_W = 80, ROW_H = 64, GAP = 8;

  const setPatch = (patch: Partial<typeof project>) => {
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, ...patch });
  };

  const setRes = (r: CanvasResolution) => setPatch({ canvasResolution: r });

  const setSnap = (s: CanvasSnap) => {
    if (s === snap) return;
    const p = JSON.parse(exportJSON());
    // Convert all widget positions so they appear in the same place after the switch.
    const pages = p.pages.map((pg: typeof project.pages[number]) => ({
      ...pg,
      widgets: pg.widgets.map((w: typeof project.pages[number]["widgets"][number]) => {
        if (s === "pixel") {
          // grid → pixel
          return {
            ...w,
            x: Math.round((w.x ?? 0) * (COL_W + GAP)),
            y: Math.round((w.y ?? 0) * (ROW_H + GAP)),
            w: Math.max(40, Math.round(w.w * (COL_W + GAP) - GAP)),
            h: Math.max(40, Math.round(w.h * (ROW_H + GAP) - GAP)),
          };
        } else {
          // pixel → grid
          return {
            ...w,
            x: Math.max(0, Math.round((w.x ?? 0) / (COL_W + GAP))),
            y: Math.max(0, Math.round((w.y ?? 0) / (ROW_H + GAP))),
            w: Math.max(1, Math.round((w.w + GAP) / (COL_W + GAP))),
            h: Math.max(1, Math.round((w.h + GAP) / (ROW_H + GAP))),
          };
        }
      }),
    }));
    loadProject({ ...p, pages, canvasSnap: s });
  };

  const numCls = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-zinc-500";

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Canvas</div>

      {/* Snap */}
      <div className="mb-3">
        <div className="text-[10px] text-zinc-500 mb-1">Snap</div>
        <div className="flex gap-1">
          {(["grid", "pixel"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSnap(s)}
              className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                snap === s
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s === "grid" ? "Grid" : "Pixel"}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-zinc-600 mt-1">
          {snap === "grid" ? "Widgets snap to 80×64 grid cells" : "Pixel-precise positioning"}
        </div>
      </div>

      {/* Resolution */}
      <div>
        <div className="text-[10px] text-zinc-500 mb-1">Resolution</div>
        <div className="flex gap-1 mb-2">
          {(["dynamic", "fixed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t === "dynamic") setRes({ type: "dynamic" });
                else setRes({ type: "fixed", width: fw, height: fh });
              }}
              className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                res.type === t
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "dynamic" ? "Dynamic" : "Fixed"}
            </button>
          ))}
        </div>

        {res.type === "fixed" && (
          <>
            <div className="flex gap-1 flex-wrap mb-2">
              {RES_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setFw(p.w); setFh(p.h); setRes({ type: "fixed", width: p.w, height: p.h }); }}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    res.width === p.w && res.height === p.h
                      ? "bg-zinc-600 border-zinc-500 text-zinc-100"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={fw}
                min={320} max={7680}
                onChange={(e) => { const v = Number(e.target.value); setFw(v); setRes({ type: "fixed", width: v, height: fh }); }}
                className={numCls}
                placeholder="Width"
              />
              <span className="text-zinc-600 text-xs shrink-0">×</span>
              <input
                type="number"
                value={fh}
                min={240} max={4320}
                onChange={(e) => { const v = Number(e.target.value); setFh(v); setRes({ type: "fixed", width: fw, height: v }); }}
                className={numCls}
                placeholder="Height"
              />
            </div>
          </>
        )}
        {res.type === "dynamic" && (
          <div className="text-[10px] text-zinc-600">Canvas scales to fit the viewport</div>
        )}
      </div>
    </div>
  );
}

// ── Alarm Rules (inline in Project Settings) ──────────────────────────────────

type AlarmRule = {
  id: string;
  name: string;
  binding: string;
  condition: string;
  threshold: number;
  severity: string;
  message: string;
};

function AlarmRulesEditor() {
  const { exportJSON, loadProject } = useProject();
  const project = useProject((s) => s.project) as { alarmRules?: AlarmRule[] } & Record<string, unknown>;
  const rules: AlarmRule[] = (project.alarmRules as AlarmRule[]) ?? [];

  const setRules = (next: AlarmRule[]) => {
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, alarmRules: next });
  };

  const addRule = () => setRules([...rules, {
    id: `alarm-${Date.now()}`,
    name: "New Alarm",
    binding: "",
    condition: "gt",
    threshold: 0,
    severity: "warning",
    message: "",
  }]);

  const updateRule = (idx: number, patch: Partial<AlarmRule>) => {
    setRules(rules.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          Alarm Rules <AlarmBadge />
        </div>
        <button
          onClick={addRule}
          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          + add
        </button>
      </div>
      <div className="space-y-2">
        {rules.length === 0 && (
          <div className="text-[11px] text-zinc-600 italic">No alarm rules.</div>
        )}
        {rules.map((rule, i) => (
          <div key={rule.id} className="border border-zinc-700/50 rounded p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <input
                value={rule.name}
                onChange={(e) => updateRule(i, { name: e.target.value })}
                placeholder="Alarm name"
                className={`${inp} flex-1`}
              />
              <button onClick={() => removeRule(i)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">×</button>
            </div>
            <input
              value={rule.binding}
              onChange={(e) => updateRule(i, { binding: e.target.value })}
              placeholder="ds:tagPath"
              className={`${inp} font-mono text-[10px]`}
            />
            <div className="flex gap-1">
              <select
                value={rule.condition}
                onChange={(e) => updateRule(i, { condition: e.target.value })}
                className="bg-zinc-900 border border-zinc-700 rounded px-1 py-1 text-[10px] w-16"
              >
                <option value="gt">&gt;</option>
                <option value="gte">≥</option>
                <option value="lt">&lt;</option>
                <option value="lte">≤</option>
                <option value="eq">=</option>
                <option value="ne">≠</option>
              </select>
              <input
                type="number"
                value={rule.threshold}
                onChange={(e) => updateRule(i, { threshold: Number(e.target.value) })}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono w-20"
              />
              <select
                value={rule.severity}
                onChange={(e) => updateRule(i, { severity: e.target.value })}
                className="bg-zinc-900 border border-zinc-700 rounded px-1 py-1 text-[10px] flex-1"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <input
              value={rule.message}
              onChange={(e) => updateRule(i, { message: e.target.value })}
              placeholder="Alarm message"
              className={inp}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page templates ────────────────────────────────────────────────────────────

import { newWidgetId } from "../store/projectStore";
import type { Widget } from "../store/projectStore";

type Template = { id: string; name: string; description: string; widgets: Omit<Widget, "id">[] };

const PAGE_TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Empty page",
    widgets: [],
  },
  {
    id: "overview",
    name: "Overview",
    description: "Gauges, LED, button",
    widgets: [
      { type: "gauge",          x: 0,  y: 0, w: 4, h: 3, config: { label: "Value 1" } },
      { type: "gauge",          x: 4,  y: 0, w: 4, h: 3, config: { label: "Value 2" } },
      { type: "tank",           x: 8,  y: 0, w: 2, h: 4, config: { label: "Level" } },
      { type: "numericDisplay", x: 0,  y: 3, w: 3, h: 2, config: { label: "PV" } },
      { type: "numericDisplay", x: 3,  y: 3, w: 3, h: 2, config: { label: "SP" } },
      { type: "led",            x: 10, y: 0, w: 2, h: 2, config: { label: "Status" } },
      { type: "button",         x: 10, y: 2, w: 2, h: 2, config: { label: "Reset" } },
    ],
  },
  {
    id: "trend",
    name: "Trend",
    description: "Full-width trend chart",
    widgets: [
      { type: "trend",  x: 0, y: 0, w: 12, h: 7, config: { label: "Trend", duration: 300 } },
      { type: "button", x: 0, y: 7, w: 3,  h: 2, config: { label: "← Back", action: "navigate" } },
    ],
  },
  {
    id: "alarms",
    name: "Alarms",
    description: "Alarm banner + history",
    widgets: [
      { type: "alarmBanner", x: 0, y: 0, w: 12, h: 4, config: { label: "Active Alarms", maxRows: 8 } },
      { type: "historyLog",  x: 0, y: 4, w: 12, h: 5, config: { label: "Write History" } },
    ],
  },
];

function TemplateModal({ onClose, onSelect }: { onClose: () => void; onSelect: (t: Template) => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-[420px] shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">New Page — Choose Template</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t); onClose(); }}
              className="text-left p-3 rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-zinc-800 transition-colors space-y-1"
            >
              <div className="text-sm font-medium text-zinc-100">{t.name}</div>
              <div className="text-[11px] text-zinc-500">{t.description}</div>
              <div className="text-[10px] text-zinc-600">{t.widgets.length} widget{t.widgets.length !== 1 ? "s" : ""}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page Thumbnail ────────────────────────────────────────────────────────────

const THUMB_W = 200;
const THUMB_H = 120;
const COLS = 12;
const COL_W = 80;
const ROW_H = 64;
const GAP   = 8;

// Widget type → fill color for the schematic thumbnail
const TYPE_COLOR: Record<string, string> = {
  gauge:          "#3b82f6",
  numericDisplay: "#22c55e",
  numericInput:   "#16a34a",
  textDisplay:    "#6b7280",
  textInput:      "#4b5563",
  led:            "#eab308",
  button:         "#2563eb",
  setpoint:       "#8b5cf6",
  tank:           "#0ea5e9",
  trend:          "#f59e0b",
  historyLog:     "#64748b",
  multiState:     "#ec4899",
  alarmBanner:    "#ef4444",
  image:          "#78716c",
  symbol:         "#a78bfa",
};

function PageThumbnail({ page }: { page: import("../store/projectStore").Page }) {
  // Natural canvas size in grid-px
  const maxCol = Math.max(COLS, ...page.widgets.map(w => w.x + w.w));
  const maxRow = Math.max(6,    ...page.widgets.map(w => w.y + w.h));
  const naturalW = maxCol * (COL_W + GAP) - GAP;
  const naturalH = maxRow * (ROW_H + GAP) - GAP;
  const scale = Math.min(THUMB_W / naturalW, THUMB_H / naturalH);

  return (
    <svg
      viewBox={`0 0 ${naturalW} ${naturalH}`}
      width={THUMB_W}
      height={THUMB_H}
      style={{ display: "block" }}
    >
      <rect width={naturalW} height={naturalH} fill="#09090b" rx="4" />
      {page.widgets.map((w) => {
        const x = w.x * (COL_W + GAP);
        const y = w.y * (ROW_H + GAP);
        const rw = w.w * (COL_W + GAP) - GAP;
        const rh = w.h * (ROW_H + GAP) - GAP;
        const fill = TYPE_COLOR[w.type] ?? "#52525b";
        return (
          <g key={w.id}>
            <rect x={x} y={y} width={rw} height={rh} fill={fill} opacity={0.25} rx="4" />
            <rect x={x} y={y} width={rw} height={rh} fill="none" stroke={fill} strokeWidth="2" opacity={0.6} rx="4" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Page Settings ─────────────────────────────────────────────────────────────

function PageSettings() {
  const { project, activePageId, setActivePage, addPage, removePage, renamePage, addWidget, updatePage } = useProject();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const startRename = (id: string, name: string) => { setEditingId(id); setDraft(name); };
  const commitRename = () => { if (editingId && draft.trim()) renamePage(editingId, draft.trim()); setEditingId(null); };

  const applyTemplate = (t: Template) => {
    addPage(t.name === "Blank" ? undefined : t.name);
    setTimeout(() => {
      const { activePageId: newId } = useProject.getState();
      t.widgets.forEach((w) => addWidget(newId, { ...w, id: newWidgetId() }));
    }, 0);
  };

  return (
    <div className="p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pages</div>

      <div className="space-y-2">
        {project.pages.map((p) => {
          const isActive = p.id === activePageId;
          return (
            <div
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`group rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                isActive ? "border-blue-500" : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {/* Thumbnail */}
              <div className="bg-zinc-950 overflow-hidden">
                <PageThumbnail page={p} />
              </div>

              {/* Name bar */}
              <div className={`flex items-center gap-1.5 px-2 py-1 ${isActive ? "bg-blue-900/30" : "bg-zinc-800/60"}`}>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-blue-400" : "bg-zinc-600"}`} />
                {editingId === p.id ? (
                  <input
                    autoFocus value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); e.stopPropagation(); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-zinc-600 rounded px-1 text-xs outline-none text-zinc-100"
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(p.id, p.name); }}
                  >
                    {p.name}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 shrink-0">{p.widgets.length}w</span>
                {project.pages.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removePage(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs shrink-0"
                  >×</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowTemplates(true)}
        className="w-full text-xs py-1.5 rounded border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
      >
        + Add Page
      </button>
      {/* Background color for active page */}
      {(() => {
        const activePg = project.pages.find(p => p.id === activePageId);
        if (!activePg) return null;
        return (
          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
            <span className="text-[10px] text-zinc-500 flex-1">Page background</span>
            <input
              type="color"
              value={activePg.backgroundColor ?? "#09090b"}
              onChange={(e) => updatePage(activePageId, { backgroundColor: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-zinc-700 bg-transparent p-0"
              title="Background color"
            />
            {activePg.backgroundColor && (
              <button
                onClick={() => updatePage(activePageId, { backgroundColor: undefined })}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
                title="Reset to default"
              >✕</button>
            )}
          </div>
        );
      })()}

      <div className="text-[10px] text-zinc-600">Double-click a page name to rename.</div>

      {/* Page script editor */}
      {(() => {
        const activePg = project.pages.find((p) => p.id === activePageId);
        if (!activePg) return null;
        return (
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Page Script</span>
              {activePg.script && (
                <button
                  onClick={() => updatePage(activePageId, { script: undefined })}
                  className="text-[10px] text-zinc-600 hover:text-red-400"
                >clear</button>
              )}
            </div>
            <div className="text-[10px] text-zinc-600 leading-relaxed">
              Runs when this page opens. Available: <code className="text-zinc-400">navigate(name)</code>, <code className="text-zinc-400">readTag(b)</code>, <code className="text-zinc-400">writeTag(b,v)</code>, <code className="text-zinc-400">onTimer(ms,fn)</code>, <code className="text-zinc-400">afterDelay(ms,fn)</code>, <code className="text-zinc-400">onTagChange(b,fn)</code>, <code className="text-zinc-400">log(...)</code>
            </div>
            <textarea
              value={activePg.script ?? ""}
              onChange={(e) => updatePage(activePageId, { script: e.target.value || undefined })}
              placeholder={"// Example: go back to Main after 5 minutes\nonTimer(5 * 60 * 1000, () => navigate('Main'));"}
              rows={8}
              spellCheck={false}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-[11px] font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-y"
            />
          </div>
        );
      })()}

      {showTemplates && <TemplateModal onClose={() => setShowTemplates(false)} onSelect={applyTemplate} />}
    </div>
  );
}

// ── Add Datasource Modal (moved from Header) ──────────────────────────────────

const TYPE_DEFAULTS: Record<DatasourceType, { id: string; label: string }> = {
  opcua:   { id: "opcua",  label: "OPC UA" },
  mbtcp:   { id: "mb",     label: "Modbus TCP" },
  mqtt:    { id: "mqtt",   label: "MQTT" },
  rest:    { id: "rest",   label: "PLCnext REST" },
  virtual: { id: "calc",   label: "Computed Tags" },
};

export function AddDatasourceModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (ds: { id: string; type: DatasourceType; label: string; config: Record<string, unknown> }) => void;
}) {
  const [type, setType] = useState<DatasourceType>("rest");
  const [id, setId] = useState(TYPE_DEFAULTS.rest.id);
  const [label, setLabel] = useState(TYPE_DEFAULTS.rest.label);
  const [ip, setIp] = useState("10.0.0.210");
  const [opcuaPort, setOpcuaPort]           = useState(4840);
  const [securityMode, setSecurityMode]     = useState("None");
  const [securityPolicy, setSecurityPolicy] = useState("None");
  const [mbPort, setMbPort]                 = useState(502);
  const [slaveId, setSlaveId]               = useState(1);
  const [mqttPort, setMqttPort]             = useState(1883);
  const [basePath, setBasePath]             = useState("/_pxc_api/v1.14");
  const [bearerToken, setBearerToken]       = useState("");
  const [virtualRows, setVirtualRows]       = useState<{ path: string; formula: string }[]>([
    { path: "tagA", formula: "{rest:tagPath} * 1.0" },
  ]);
  const [testing, setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const changeType = (t: DatasourceType) => { setType(t); setId(TYPE_DEFAULTS[t].id); setLabel(TYPE_DEFAULTS[t].label); setTestResult(null); };

  const buildPayload = () => {
    const config: Record<string, unknown> = {};
    if (type === "opcua") {
      config.endpoint = `opc.tcp://${ip}:${opcuaPort}`;
      config.securityMode = securityMode;
      config.securityPolicy = securityPolicy;
    } else if (type === "mbtcp") {
      config.host = ip; config.port = mbPort || 502; config.slaveId = slaveId || 1;
    } else if (type === "mqtt") {
      config.host = ip; config.port = mqttPort || 1883;
    } else if (type === "virtual") {
      config.tags = JSON.stringify(virtualRows.filter((r) => r.path.trim()));
    } else {
      config.endpoint = `https://${ip}`;
      config.basePath = basePath;
      if (bearerToken) config.bearerToken = bearerToken;
    }
    return { id, type, label, config };
  };

  const testConn = async () => {
    setTesting(true); setTestResult(null);
    const { type: dsType, config } = buildPayload();
    try {
      const r = await fetch(`${apiBase}/api/v1/datasources/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "test", type: dsType, label: "test", config }) });
      const data = (await r.json()) as { connected: boolean; lastError?: string; tagCount?: number };
      setTestResult(data.connected ? { ok: true, msg: `Connected${data.tagCount ? ` · ${data.tagCount} tags` : ""}` } : { ok: false, msg: data.lastError ?? "Connection failed" });
    } catch (e) { setTestResult({ ok: false, msg: (e as Error).message }); }
    finally { setTesting(false); }
  };

  const inpCls = "mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono";
  const lblCls = "block text-[11px] text-zinc-400";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 w-[420px] space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="text-sm font-semibold">Add Datasource</div>

        <label className={lblCls}>Type
          <select value={type} onChange={(e) => changeType(e.target.value as DatasourceType)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
            <option value="opcua">OPC UA</option>
            <option value="mbtcp">Modbus TCP</option>
            <option value="mqtt">MQTT</option>
            <option value="rest">REST (PLCnext pxc_api)</option>
            <option value="virtual">Virtual (computed expressions)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">ID<input value={id} onChange={(e) => setId(e.target.value)} className={inpCls} /></label>
          <label className="text-[11px] text-zinc-400">Label<input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
        </div>

        {type !== "virtual" && (
          <label className={lblCls}>IP Address<input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.210" className={inpCls} /></label>
        )}

        {type === "opcua" && (<>
          <label className={lblCls}>Port<input type="number" value={opcuaPort} onChange={(e) => setOpcuaPort(Number(e.target.value))} className="mt-1 w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs block" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Security mode
              <select value={securityMode} onChange={(e) => setSecurityMode(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
                <option value="None">None</option><option value="Sign">Sign</option><option value="SignAndEncrypt">Sign &amp; Encrypt</option>
              </select>
            </label>
            <label className="text-[11px] text-zinc-400">Security policy
              <select value={securityPolicy} onChange={(e) => setSecurityPolicy(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs">
                <option value="None">None</option><option value="Basic128Rsa15">Basic128Rsa15</option><option value="Basic256">Basic256</option><option value="Basic256Sha256">Basic256Sha256</option>
              </select>
            </label>
          </div>
        </>)}

        {type === "mbtcp" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Port<input type="number" value={mbPort} onChange={(e) => setMbPort(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
            <label className="text-[11px] text-zinc-400">Slave ID<input type="number" value={slaveId} onChange={(e) => setSlaveId(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs" /></label>
          </div>
        )}

        {type === "mqtt" && <label className={lblCls}>Port<input type="number" value={mqttPort} onChange={(e) => setMqttPort(Number(e.target.value))} className="mt-1 w-28 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs block" /></label>}

        {type === "rest" && (<>
          <label className={lblCls}>Base path<input value={basePath} onChange={(e) => setBasePath(e.target.value)} className={inpCls} /></label>
          <label className={lblCls}>Bearer token <span className="text-zinc-600">(optional)</span><input value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="leave blank if not required" className={inpCls} /></label>
        </>)}

        {type === "virtual" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-300">Computed Tags</span>
              <button onClick={() => setVirtualRows((r) => [...r, { path: "", formula: "" }])} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add tag</button>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {virtualRows.map((row, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={row.path} onChange={(e) => setVirtualRows((rows) => rows.map((r, j) => j === i ? { ...r, path: e.target.value } : r))} placeholder="tagName" className="w-24 shrink-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono" />
                  <span className="text-zinc-600 text-[10px] shrink-0">=</span>
                  <input value={row.formula} onChange={(e) => setVirtualRows((rows) => rows.map((r, j) => j === i ? { ...r, formula: e.target.value } : r))} placeholder="{ds:path} * 9/5 + 32" className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono" />
                  <button onClick={() => setVirtualRows((rows) => rows.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 text-xs px-1">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] text-zinc-600 font-mono truncate">
          {type === "opcua"   && `opc.tcp://${ip}:${opcuaPort}`}
          {type === "mbtcp"   && `${ip}:${mbPort}  slave=${slaveId}`}
          {type === "mqtt"    && `${ip}:${mqttPort}`}
          {type === "rest"    && `https://${ip}${basePath}`}
          {type === "virtual" && `${virtualRows.filter((r) => r.path.trim()).length} computed tag(s)`}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={testConn} disabled={testing} className="text-xs px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50">{testing ? "Testing…" : "Test"}</button>
          {testResult && <span className={`text-[11px] flex-1 truncate ${testResult.ok ? "text-emerald-400" : "text-red-400"}`}>{testResult.ok ? "✓ " : "✗ "}{testResult.msg}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button onClick={() => { const { id: dsId, type: dsType, label: dsLabel, config } = buildPayload(); onAdd({ id: dsId, type: dsType, label: dsLabel, config }); }} className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 font-medium">Add</button>
        </div>
      </div>
    </div>
  );
}
