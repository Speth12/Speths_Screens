import { useState, useEffect } from "react";
import { useProject, type Datasource, type CanvasResolution, type CanvasSnap } from "../store/projectStore";
import { SYMBOL_PACKS, SYMBOLS } from "@speths-screens/widgets";
import { AlarmBadge } from "./AlarmBadge";
import { AddDatasourceModal } from "./AddDatasourceModal";
import { Users } from "./Users";
import { ChromeSettings } from "./ChromeSettings";
import { AuditTrail } from "./AuditTrail";
import { HistorySettings } from "./HistorySettings";
import { CertPinModal, needsCertPin } from "./CertCheck";
import { ALARMS_TAB, CUSTOM_WIDGETS_TAB, RECIPES_TAB, SCRIPTS_TAB, datasourceTab, PAGES_TAB, useWorkspace } from "../store/workspace";
import { convertWidget } from "../store/presets";
import { apiBase } from "../store/runtimeTarget";
import { authHeader } from "../store/runtimeAuth";
import { CloseIcon, CheckIcon, WarningIcon, ChevronDownIcon, ChevronRightIcon, OpenTabIcon } from "../ui/icons";

type DSStatus = "connected" | "disconnected" | "unknown";

function useDSStatus(dsIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, DSStatus>>({});
  useEffect(() => {
    const poll = async () => {
      const next: Record<string, DSStatus> = {};
      await Promise.all(dsIds.map(async (id) => {
        try {
          const r = await fetch(`${apiBase}/api/v1/datasources/${encodeURIComponent(id)}/status`, { headers: authHeader(apiBase) });
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
  label, count, badge, action, defaultOpen = false, onOpen, children,
}: {
  label: string;
  /** Clicking the name opens a tab in the middle of the editor; the arrow still folds the list. */
  onOpen?: () => void;
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
        <span className="text-zinc-600 text-[9px] w-3 shrink-0">{open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</span>
        <span
          className={`text-[10px] uppercase tracking-wider font-medium flex-1 ${onOpen ? "text-zinc-300 hover:text-blue-500 hover:underline" : "text-zinc-400"}`}
          onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
          title={onOpen ? `Open ${label} in the middle of the editor` : undefined}
        >{label}</span>
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

/** A section that opens as a tab in the middle of the editor instead of unfolding in the tree. */
function TreeLink({ label, tabId, count, badge, onOpen }: { label: string; tabId: string; count?: number; badge?: React.ReactNode; onOpen: () => void }) {
  const active = useWorkspace((s) => s.activeId) === tabId;
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left border-b border-zinc-800/60 hover:bg-zinc-800/30 ${active ? "bg-blue-600/15" : ""}`}
    >
      <span className="mx-[3px] h-1.5 w-1.5 rounded-full bg-zinc-600 shrink-0" aria-hidden="true" />
      <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium flex-1">{label}</span>
      {badge}
      {count !== undefined && count > 0 && <span className="text-[9px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">{count}</span>}
      <OpenTabIcon size={12} className="text-zinc-600" />
    </button>
  );
}

// ── Main LeftPanel — project tree ─────────────────────────────────────────────

export function LeftPanel({ width }: { width?: number }) {
  const {
    project, activePageId, setActivePage,
    addPage, renamePage, removePage,
    addDatasource, removeDatasource, updateDatasource,
    exportJSON, loadProject,
  } = useProject();
  const openTab = useWorkspace((s) => s.open);
  const openVariables = useWorkspace((s) => s.openVariables);

  const [pinDS,      setPinDS]      = useState<Datasource | null>(null);
  const [showAddDS,  setShowAddDS]  = useState(false);
  const [renaming,   setRenaming]   = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
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
        </div>
        <div className="flex items-center justify-between min-h-[14px]">
          {autosaved
            ? <span className="text-[9px] text-emerald-500"><CheckIcon size={10} /> Autosaved</span>
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
          onOpen={() => openTab(PAGES_TAB)}
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
                ><CloseIcon size={14} /></button>
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
                    onClick={() => openTab(datasourceTab(d.id, d.label))}
                    title="Open this datasource"
                  >
                    <div className="text-[11px] text-zinc-200 truncate">{d.label}</div>
                    <div className="text-[9px] text-zinc-600 font-mono">[{d.id}] {d.type}</div>
                  </div>
                  {needsCertPin(d) && (
                    <button
                      onClick={() => setPinDS(d)}
                      className="text-amber-400 hover:text-amber-300 text-[10px] shrink-0"
                      title="The server's certificate is not checked. Click to pin it."
                      aria-label={`Pin the certificate of ${d.label}`}
                    ><WarningIcon size={14} /></button>
                  )}
                  <button
                    onClick={() => openVariables(d.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-blue-400 text-[10px] shrink-0 transition-opacity"
                    title="Browse this datasource's variables" aria-label={`Browse the variables of ${d.label}`}
                  ><OpenTabIcon size={14} /></button>
                  <button
                    onClick={() => removeDatasource(d.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-[11px] shrink-0 transition-opacity"
                    title="Remove datasource" aria-label={`Remove ${d.label}`}
                  ><CloseIcon size={14} /></button>
                </div>
              );
            })}
          </div>
        </TreeSection>

        {/* The namespace (what screens bind to) and the controllers' own variables, in one tab */}
        <TreeLink label="Variables" tabId="variables" count={project.namespace?.filter((n) => n.type === "tag" || n.type === "virtual").length}
          onOpen={() => openVariables()} />

        {/* Alarm rules, and the events the runtime raises */}
        <TreeLink label="Alarms" tabId={ALARMS_TAB.id} count={project.alarmRules?.length} badge={<AlarmBadge />} onOpen={() => openTab(ALARMS_TAB)} />

        {/* Runtime scripts, and the session variables (kept per browser tab) that screens and scripts share */}
        <TreeLink label="Scripts" tabId={SCRIPTS_TAB.id} count={(project.scripts?.length ?? 0) + (project.sessionVars?.length ?? 0)} onOpen={() => openTab(SCRIPTS_TAB)} />

        {/* Recipes: sets of tag writes applied together */}
        <TreeLink label="Recipes" tabId={RECIPES_TAB.id} count={project.recipes?.length} onOpen={() => openTab(RECIPES_TAB)} />

        {/* Custom widgets: reusable pieces of screen */}
        <TreeLink label="Custom widgets" tabId={CUSTOM_WIDGETS_TAB.id} count={project.customWidgets?.length} onOpen={() => openTab(CUSTOM_WIDGETS_TAB)} />

        {/* Project properties: the project's settings, its users and audit trail, and getting it in and out */}
        <TreeSection label="Project properties">
          <div className="ml-3 border-l border-zinc-800">
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
            <HistorySettings value={project.historian} onChange={(historian) => setProp({ historian })} />
            <CanvasSettings />
            <SymbolPacksSettings />
          </div>
          </TreeSection>
          <TreeSection label="Header and navigation">
            <ChromeSettings />
          </TreeSection>
          <TreeSection label="Users">
            <Users />
          </TreeSection>
          <TreeSection label="Audit">
            <AuditTrail />
          </TreeSection>
          </div>
        </TreeSection>

      </div>

      {/* Modals */}
      {showAddDS && (
        <AddDatasourceModal
          onClose={() => setShowAddDS(false)}
          onAdd={(ds) => { addDatasource(ds); setShowAddDS(false); openTab(datasourceTab(ds.id, ds.label)); }}
        />
      )}
      {pinDS && (
        <CertPinModal
          ds={pinDS}
          onClose={() => setPinDS(null)}
          onPin={(fp) => { updateDatasource(pinDS.id, { config: { ...pinDS.config, certCheck: "pinned", certFingerprint: fp } }); setPinDS(null); }}
        />
      )}
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

  const [fw, setFw] = useState<number>(res.type === "fixed" ? (res.width ?? 1920) : 1920);
  const [fh, setFh] = useState<number>(res.type === "fixed" ? (res.height ?? 1080) : 1080);

  const setPatch = (patch: Partial<typeof project>) => {
    const p = JSON.parse(exportJSON());
    loadProject({ ...p, ...patch });
  };

  const setRes = (r: CanvasResolution) => setPatch({ canvasResolution: r });

  const setSnap = (s: CanvasSnap) => {
    if (s === snap) return;
    const p = JSON.parse(exportJSON());
    // Convert every widget, pages and presets, so it looks the same after the switch.
    const pages = (p.pages as typeof project.pages).map((pg) => ({ ...pg, widgets: pg.widgets.map((w) => convertWidget(w, s)) }));
    const presets = (p.presets as typeof project.presets)?.map((ps) => ({ ...ps, widgets: ps.widgets.map((w) => convertWidget(w, s)) }));
    loadProject({ ...p, pages, presets, canvasSnap: s });
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
