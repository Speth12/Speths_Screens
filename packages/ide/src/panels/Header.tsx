import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useProject } from "../store/projectStore";
import { useShallow } from "zustand/react/shallow";
import { setApiBase } from "../store/runtimeTarget";
import { tagStoreClient } from "../store/tagStoreClient";
import { getToken, setToken, clearToken, authHeader } from "../store/runtimeAuth";
import {
  subscribeTargets, getTargets, getActiveTarget,
  setActiveTarget, addTarget, updateTarget, removeTarget,
  type Target,
} from "../store/targetsStore";
import { themes, applyTheme, getThemeById, getStoredThemeId } from "../store/themes";

// ── Manage Targets modal ───────────────────────────────────────────────────

function ManageTargetsModal({ onClose }: { onClose: () => void }) {
  const targets = useSyncExternalStore(subscribeTargets, getTargets);
  const active  = useSyncExternalStore(subscribeTargets, getActiveTarget);

  const [newName, setNewName] = useState("");
  const [newUrl,  setNewUrl]  = useState("http://");
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl,  setEditUrl]  = useState("");

  const addDisabled = !newName.trim() || !newUrl.trim() || newUrl === "http://";

  const handleAdd = () => {
    if (addDisabled) return;
    const t = addTarget(newName.trim(), newUrl.trim());
    setActiveTarget(t.id);
    setNewName(""); setNewUrl("http://");
  };

  const startEdit = (t: Target) => {
    setEditId(t.id); setEditName(t.name); setEditUrl(t.url);
  };

  const commitEdit = () => {
    if (editId) updateTarget(editId, { name: editName.trim(), url: editUrl.trim() });
    setEditId(null);
  };

  const inp = "bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500 text-zinc-200";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-[420px] shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Deploy Targets</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>

        {/* Target list */}
        <div className="space-y-1.5">
          {targets.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors cursor-pointer ${
                active.id === t.id
                  ? "border-blue-500 bg-blue-950/30"
                  : "border-zinc-700 hover:border-zinc-600"
              }`}
              onClick={() => { if (editId !== t.id) setActiveTarget(t.id); }}
            >
              {/* Active indicator */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${active.id === t.id ? "bg-blue-400" : "bg-zinc-700"}`} />

              {/* Edit inline or display */}
              {editId === t.id ? (
                <div className="flex-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className={`${inp} w-28`} placeholder="Name" />
                  <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)}
                    className={`${inp} flex-1 font-mono text-[10px]`} placeholder="http://host:8080" />
                  <button onClick={commitEdit} className="text-xs px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-white shrink-0">✓</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0">✕</button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-200">{t.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">{t.url || "localhost (Vite proxy)"}</div>
                </div>
              )}

              {/* Actions — only for non-local, non-editing rows */}
              {t.id !== "local" && editId !== t.id && (
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => startEdit(t)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400">edit</button>
                  <button onClick={() => removeTarget(t.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-red-900 text-zinc-500 hover:text-red-400">×</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new target */}
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Add target</div>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Plant A)"
              className={`${inp} w-32`} />
            <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
              placeholder="http://host:8080"
              className={`${inp} flex-1 font-mono text-[10px]`} />
            <button
              onClick={handleAdd}
              disabled={addDisabled}
              className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shrink-0"
            >+ Add</button>
          </div>
          <div className="text-[10px] text-zinc-600">URL is the Speth's Screens runtime base, e.g. http://10.0.0.210:8080</div>
        </div>
      </div>
    </div>
  );
}

// ── Theme picker ───────────────────────────────────────────────────────────

function ThemePicker() {
  const [activeId, setActiveId] = useState(getStoredThemeId);

  const pick = (id: string) => {
    const t = getThemeById(id);
    applyTheme(t);
    setActiveId(id);
  };

  // Apply stored theme on mount
  useEffect(() => { applyTheme(getThemeById(activeId)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[10px] text-zinc-500">theme</span>
      <select
        value={activeId}
        onChange={(e) => pick(e.target.value)}
        className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 max-w-[140px] truncate"
        style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)" }}
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── Runtime login modal ────────────────────────────────────────────────────

function RuntimeLoginModal({
  targetUrl,
  onClose,
  onSuccess,
}: {
  targetUrl: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${targetUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = (await r.json()) as { token?: string; error?: string; mustChangePassword?: boolean };
      if (!r.ok || !data.token) { setErr(data.error ?? "Login failed"); return; }
      if (data.mustChangePassword) {
        // The token only allows a password change; the operator screen does that.
        setErr(`${user} must choose a new password first: open ${targetUrl || "the runtime"} in a browser and log in there.`);
        return;
      }
      setToken(targetUrl, data.token);
      onSuccess();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const inp = "w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-72 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Runtime Login</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono truncate">{targetUrl || "localhost"}</div>
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" className={inp} autoFocus />
        <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password" type="password" className={inp} />
        {err && <div className="text-[11px] text-red-400">{err}</div>}
        <button
          type="submit"
          disabled={busy || !user || !pass}
          className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium"
        >{busy ? "Logging in…" : "Login & Deploy"}</button>
      </form>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

type HeaderProps = {
  onHelp: () => void;
  onDemo: () => void;
  showJSON: boolean;
  onToggleJSON: () => void;
  onPreview: () => void;
};

export function Header({ onHelp, onDemo, showJSON, onToggleJSON, onPreview }: HeaderProps) {
  const { exportJSON, loadProject } = useProject();
  const { canUndo, canRedo, undo, redo } = useProject(
    useShallow((s) => ({ canUndo: s.canUndo, canRedo: s.canRedo, undo: s.undo, redo: s.redo }))
  );

  const targets      = useSyncExternalStore(subscribeTargets, getTargets);
  const activeTarget = useSyncExternalStore(subscribeTargets, getActiveTarget);

  const [busy, setBusy]             = useState<"none" | "deploy" | "pull">("none");
  const [msg, setMsg]               = useState("");
  const [showManage, setShowManage] = useState(false);
  const [showLogin, setShowLogin]   = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // Keep apiBase + WebSocket in sync whenever the active target changes.
  useEffect(() => {
    setApiBase(activeTarget.url);
    tagStoreClient.reconnectTo(activeTarget.url);
  }, [activeTarget.url]);

  const doDeploy = async () => {
    setBusy("deploy"); setMsg("");
    try {
      const r = await fetch(`${activeTarget.url}/api/v1/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(activeTarget.url) },
        body: exportJSON(),
      });
      if (r.status === 401) {
        // Token missing or expired — show login modal
        clearToken(activeTarget.url);
        setBusy("none");
        setShowLogin(true);
        return;
      }
      const data = (await r.json()) as { ok?: boolean; error?: string; datasources?: number; pages?: number };
      setMsg(r.ok ? `deployed → ${activeTarget.name} (${data.datasources} ds, ${data.pages} pg)` : `error: ${data.error}`);
    } catch (e) {
      setMsg(`error: ${(e as Error).message}`);
    } finally { setBusy("none"); }
  };

  const saveToFile = () => {
    const { project } = useProject.getState();
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${(project.name ?? "project").replace(/\s+/g, "-")}.xhmi.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("saved");
  };

  const loadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { loadProject(JSON.parse(reader.result as string)); setMsg(`loaded ${file.name}`); }
      catch { setMsg("invalid file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const pullFromRuntime = async () => {
    setBusy("pull");
    try {
      const r = await fetch(`${activeTarget.url}/api/v1/project`, {
        headers: { ...authHeader(activeTarget.url) },
      });
      if (r.status === 401) { setBusy("none"); setShowLogin(true); return; }
      if (!r.ok) throw new Error();
      const p = await r.json();
      if (p) { loadProject(p); setMsg(`pulled from ${activeTarget.name}`); }
      else setMsg("runtime has no project");
    } catch { setMsg("pull failed"); }
    finally { setBusy("none"); }
  };

  const previewUrl = activeTarget.url || window.location.origin;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
      {/* Brand */}
      <div className="font-semibold text-sm shrink-0">
        Speth's Screens <span className="text-zinc-500 font-normal">IDE</span>
      </div>

      <div className="w-px h-4 bg-zinc-700 mx-1 shrink-0" />

      {/* Undo / Redo */}
      <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
        className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 font-mono">↩</button>
      <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
        className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 font-mono">↪</button>

      <div className="flex-1" />

      {msg && <span className="text-[11px] text-zinc-400 max-w-[220px] truncate">{msg}</span>}

      {/* Target selector */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-zinc-500">target</span>
        <select
          value={activeTarget.id}
          onChange={(e) => setActiveTarget(e.target.value)}
          className="text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 max-w-[120px] truncate"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowManage(true)}
          title="Manage targets"
          className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
        >⚙</button>
      </div>

      {/* Preview */}
      <button
        onClick={onPreview}
        title="Full-screen operator view (F5)"
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0"
      >⬡ Preview</button>

      {/* JSON toggle */}
      <button
        onClick={onToggleJSON}
        title="View project JSON"
        className={`text-xs px-2 py-1 rounded font-mono shrink-0 transition-colors ${
          showJSON ? "bg-blue-700 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        }`}
      >{"{ }"}</button>

      {/* Save / Load / Pull / Deploy */}
      <button onClick={saveToFile} title="Save to file"
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0">↓ Save</button>
      <button onClick={() => fileInputRef.current?.click()} title="Load from file"
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0">↑ Load</button>
      <input ref={fileInputRef} type="file" accept=".json,.xhmi.json" className="hidden" onChange={loadFromFile} />
      <button onClick={pullFromRuntime} disabled={busy !== "none"}
        className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 shrink-0">
        {busy === "pull" ? "…" : "Pull"}
      </button>
      <button onClick={doDeploy} disabled={busy !== "none"}
        className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium shrink-0">
        {busy === "deploy" ? "deploying…" : "Deploy"}
      </button>

      {/* Theme */}
      <ThemePicker />

      {/* Demo */}
      <button onClick={onDemo} title="Platform feature demo"
        className="text-xs px-2 py-1 rounded bg-violet-700 hover:bg-violet-600 text-white font-medium shrink-0">Demo</button>

      {/* Help */}
      <button onClick={onHelp} title="Keyboard shortcuts (?)"
        className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-mono shrink-0">?</button>

      {showManage && <ManageTargetsModal onClose={() => setShowManage(false)} />}
      {showLogin && (
        <RuntimeLoginModal
          targetUrl={activeTarget.url}
          onClose={() => setShowLogin(false)}
          onSuccess={() => { setShowLogin(false); void doDeploy(); }}
        />
      )}
    </div>
  );
}
