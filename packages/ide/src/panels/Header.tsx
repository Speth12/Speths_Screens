// The top of the editor: a menu bar (File, Edit, View, Project, Help) and a toolbar under it with the
// things used all the time: undo and redo, save, the screen size and data source being edited, Preview,
// and the deploy target with Pull and Deploy. Everything in the toolbar is also in a menu.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProject } from "../store/projectStore";
import { openProject, openSummary } from "../store/openProject";
import { validateProject } from "../store/validateProject";
import { setApiBase } from "../store/runtimeTarget";
import { describeFailure, isNetworkFailure } from "../store/targetErrors";
import { tagStoreClient } from "../store/tagStoreClient";
import { clearToken, authHeader, loginBaseFor } from "../store/runtimeAuth";
import { subscribeTargets, getTargets, getActiveTarget, setActiveTarget, baseOf, loadTargets } from "../store/targetsStore";
import { CURRENT_SCHEMA_VERSION } from "@speths-screens/shared-types/upgrade";
import { setIdeMode, storedIdeMode, type IdeMode } from "../store/ideTheme";
import { useEditorView } from "../store/editorView";
import { useEditorStatus, say } from "../store/editorStatus";
import { exportGitFiles, exportHtmlFile, openProjectFile, saveProjectFile } from "../store/projectFiles";
import { EDIT_SHORTCUTS, runEditCommand } from "../store/editActions";
import { reachLabel, useReach, useRuntimeReach } from "../store/runtimeReach";
import { DataSwitch, DEVICES, DeviceSwitch } from "./DeviceSwitch";
import { NewProjectDialog } from "./NewProjectDialog";
import { TargetsDialog } from "./TargetsDialog";
import { RuntimeLoginDialog } from "./RuntimeLoginDialog";
import { MCPModal } from "./MCPModal";
import { StatusMessage } from "./StatusMessage";
import { Button, IconButton, MenuBar, Select, type MenuItem, type MenuSpec } from "../ui";
import { DarkIcon, LightIcon, PreviewIcon, RedoIcon, SaveIcon, SettingsIcon, UndoIcon } from "../ui/icons";

type HeaderProps = {
  onHelp: () => void;
  onGallery: () => void;
  onTheme: () => void;
  onLanguages: () => void;
  showJSON: boolean;
  onToggleJSON: () => void;
  onPreview: () => void;
};

const Divider = () => <div className="w-px h-5 bg-zinc-700 shrink-0" aria-hidden="true" />;

export function Header({ onHelp, onGallery, onTheme, onLanguages, showJSON, onToggleJSON, onPreview }: HeaderProps) {
  const { exportJSON, loadProject, newProject } = useProject.getState();
  const { canUndo, canRedo, undo, redo } = useProject(
    useShallow((s) => ({ canUndo: s.canUndo, canRedo: s.canRedo, undo: s.undo, redo: s.redo })),
  );
  const device = useEditorView((s) => s.device);
  const setDevice = useEditorView((s) => s.setDevice);
  const data = useEditorView((s) => s.data);
  const setData = useEditorView((s) => s.setData);
  const message = useEditorStatus((s) => s.message);

  const targets = useSyncExternalStore(subscribeTargets, getTargets);
  const activeTarget = useSyncExternalStore(subscribeTargets, getActiveTarget);
  const reach = useRuntimeReach();

  const [busy, setBusy] = useState<"none" | "deploy" | "pull">("none");
  const [showTargets, setShowTargets] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginBase, setLoginBase] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showMCP, setShowMCP] = useState(false);
  const [ideMode, setIdeModeState] = useState<IdeMode>(storedIdeMode);

  // Keep apiBase + WebSocket in sync whenever the active target changes.
  // Requests to any target but this program's own runtime go through its relay (see store/runtimeTarget.ts).
  const base = baseOf(activeTarget);
  useEffect(() => {
    setApiBase(base);
    tagStoreClient.reconnectTo(base);
  }, [base]);
  // The saved targets live in the program that serves the editor.
  useEffect(() => { void loadTargets(); }, []);

  // A 401 is either the target's or, for a relayed request that never left, this program's own.
  const askLogin = (r: Response) => {
    const who = loginBaseFor(base, r);
    clearToken(who);
    setLoginBase(who);
    setBusy("none");
    setShowLogin(true);
  };

  const doDeploy = async () => {
    const problems = validateProject(useProject.getState().project);
    if (problems.length) { say(`not deployed: ${problems.join("; ")}`); return; }
    // A runtime that says which project format it reads is asked before the project is sent.
    const reads = useReach.getState().targetFormat;
    if (reads !== null && reads < CURRENT_SCHEMA_VERSION) {
      say(`not deployed: ${activeTarget.name} runs an older Speth's Screens (it reads project format ${reads} and this project is format ${CURRENT_SCHEMA_VERSION}). Update the runtime there first.`);
      return;
    }
    setBusy("deploy"); say("");
    try {
      const r = await fetch(`${base}/api/v1/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(base) },
        body: exportJSON(),
      });
      if (r.status === 401) { askLogin(r); return; } // token missing or expired: a login deploys again
      const body = (await r.json()) as { ok?: boolean; error?: string; datasources?: number; pages?: number };
      say(r.ok ? `deployed → ${activeTarget.name} (${body.datasources} ds, ${body.pages} pg)` : `error: ${body.error}`);
    } catch (e) {
      say(`error: ${describeFailure(e)}`);
    } finally { setBusy("none"); }
  };

  const pullFromRuntime = async () => {
    setBusy("pull");
    try {
      const r = await fetch(`${base}/api/v1/project`, { headers: { ...authHeader(base) } });
      if (r.status === 401) { askLogin(r); return; }
      if (!r.ok) {
        const why = ((await r.json().catch(() => ({}))) as { error?: string }).error;
        say(why ? `pull failed: ${why}` : "pull failed");
        return;
      }
      const p = await r.json();
      if (!p) { say("runtime has no project"); return; }
      const o = openProject(p);
      if (o.ok) loadProject(o.project);
      say(openSummary(`the project from ${activeTarget.name}`, o));
    } catch (e) { say(isNetworkFailure(e) ? `pull failed: ${describeFailure(e)}` : "pull failed"); }
    finally { setBusy("none"); }
  };

  const toggleLook = () => {
    const next: IdeMode = ideMode === "dark" ? "light" : "dark";
    setIdeMode(next);
    setIdeModeState(next);
  };

  const idle = busy === "none";
  const menus: MenuSpec[] = [
    {
      label: "File",
      items: [
        { label: "New project…", onSelect: () => setShowNew(true) },
        { label: "Open project file…", onSelect: openProjectFile },
        { label: "Save", icon: <SaveIcon size={14} />, shortcut: "Ctrl+S", onSelect: saveProjectFile },
        { separator: true },
        { label: `Pull from ${activeTarget.name}`, disabled: !idle, onSelect: () => void pullFromRuntime() },
        { label: `Deploy to ${activeTarget.name}`, disabled: !idle, onSelect: () => void doDeploy() },
        { separator: true },
        { label: "Export HTML snapshot…", onSelect: () => void exportHtmlFile() },
        { label: "Export Git files…", onSelect: exportGitFiles },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", icon: <UndoIcon size={14} />, shortcut: "Ctrl+Z", disabled: !canUndo, onSelect: undo },
        { label: "Redo", icon: <RedoIcon size={14} />, shortcut: "Ctrl+Y", disabled: !canRedo, onSelect: redo },
        { separator: true },
        { label: "Copy", shortcut: EDIT_SHORTCUTS.copy, onSelect: () => runEditCommand("copy") },
        { label: "Paste", shortcut: EDIT_SHORTCUTS.paste, onSelect: () => runEditCommand("paste") },
        { label: "Duplicate", shortcut: EDIT_SHORTCUTS.duplicate, onSelect: () => runEditCommand("duplicate") },
        { label: "Delete", shortcut: EDIT_SHORTCUTS.delete, onSelect: () => runEditCommand("delete") },
        { separator: true },
        { label: "Select all", shortcut: EDIT_SHORTCUTS.selectAll, onSelect: () => runEditCommand("selectAll") },
        { separator: true },
        { label: "Bring to front", shortcut: EDIT_SHORTCUTS.toFront, onSelect: () => runEditCommand("toFront") },
        { label: "Bring forward", shortcut: EDIT_SHORTCUTS.forward, onSelect: () => runEditCommand("forward") },
        { label: "Send backward", shortcut: EDIT_SHORTCUTS.backward, onSelect: () => runEditCommand("backward") },
        { label: "Send to back", shortcut: EDIT_SHORTCUTS.toBack, onSelect: () => runEditCommand("toBack") },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Preview", icon: <PreviewIcon size={14} />, shortcut: "F5", onSelect: onPreview },
        { separator: true },
        ...DEVICES.map((d): MenuItem => ({ label: `${d.label} layout`, checked: device === d.id, onSelect: () => setDevice(d.id) })),
        { separator: true },
        { label: "Live values", checked: data === "live", onSelect: () => setData("live") },
        { label: "Demo values", checked: data === "dummy", onSelect: () => setData("dummy") },
        { separator: true },
        { label: "Project JSON", checked: showJSON, onSelect: onToggleJSON },
        { label: "Dark look", checked: ideMode === "dark", onSelect: toggleLook },
        { separator: true },
        { label: "Widget gallery…", onSelect: onGallery },
      ],
    },
    {
      label: "Project",
      items: [
        { label: "Theme…", onSelect: onTheme },
        { label: "Languages…", onSelect: onLanguages },
        { separator: true },
        { label: "MCP setup…", onSelect: () => setShowMCP(true) },
      ],
    },
    {
      label: "Help",
      items: [{ label: "Keyboard shortcuts", shortcut: "?", onSelect: onHelp }],
    },
  ];

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-900">
      {/* ── Menu bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 h-9">
        <div className="text-ui-title font-semibold shrink-0">
          Speth's Screens <span className="text-zinc-400 font-normal">IDE</span>
        </div>
        <MenuBar label="Main menu" menus={menus} />
        <div className="flex-1" />
        <IconButton label={ideMode === "dark" ? "Switch the editor to the light look" : "Switch the editor to the dark look"} size="sm"
          icon={ideMode === "dark" ? <LightIcon size={14} /> : <DarkIcon size={14} />} onClick={toggleLook} />
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-zinc-800">
        <div className="flex items-center gap-1">
          <IconButton label="Undo (Ctrl+Z)" icon={<UndoIcon size={16} />} disabled={!canUndo} onClick={undo} />
          <IconButton label="Redo (Ctrl+Y)" icon={<RedoIcon size={16} />} disabled={!canRedo} onClick={redo} />
          <IconButton label="Save to a file (Ctrl+S)" icon={<SaveIcon size={16} />} onClick={saveProjectFile} />
        </div>
        <Divider />
        <DeviceSwitch />
        <DataSwitch />
        <Button icon={<PreviewIcon size={14} />} title="Full-screen operator view (F5)" onClick={onPreview}>Preview</Button>

        <div className="flex-1 min-w-0 flex justify-end">
          {message && <StatusMessage text={message} className="max-w-[24rem] text-ui-label text-zinc-300" />}
        </div>

        <Divider />
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-ui-label text-zinc-300 whitespace-nowrap shrink-0"
            title={reach.reachable === false ? "Nothing answers at this address, so Deploy, Pull and live values will not work." : "A runtime answers at this address."}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${reach.reachable === false ? "bg-red-500" : reach.reachable ? "bg-emerald-500" : "bg-zinc-500"}`} />
            {reachLabel(reach)}
          </span>
          <Select aria-label="Target" className="w-40" value={activeTarget.id} onChange={(e) => setActiveTarget(e.target.value)}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <IconButton label="Manage targets" icon={<SettingsIcon size={16} />} onClick={() => setShowTargets(true)} />
          <Button disabled={!idle} onClick={() => void pullFromRuntime()} title="Pull the project from the runtime">{busy === "pull" ? "Pulling…" : "Pull"}</Button>
          <Button variant="primary" disabled={!idle} onClick={() => void doDeploy()} title="Deploy the project to the target">{busy === "deploy" ? "Deploying…" : "Deploy"}</Button>
        </div>
      </div>

      {showNew && <NewProjectDialog onCancel={() => setShowNew(false)} onCreate={(chrome) => { newProject({ chrome }); setShowNew(false); }} />}
      {showTargets && <TargetsDialog onClose={() => setShowTargets(false)} />}
      {showMCP && <MCPModal onClose={() => setShowMCP(false)} />}
      {showLogin && <RuntimeLoginDialog targetUrl={loginBase} label={loginBase ? `${activeTarget.name} (${activeTarget.url})` : "the runtime that serves this editor"}
        onClose={() => setShowLogin(false)} onSuccess={() => { setShowLogin(false); void loadTargets(); void doDeploy(); }} />}
    </header>
  );
}
