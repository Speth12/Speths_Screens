// Widget presets in the palette (click to insert, drag onto the canvas), and
// the dialog that saves widgets as a preset.
import { useState } from "react";
import { newWidgetId, useProject, type Widget } from "../store/projectStore";
import { allPresets, instantiatePreset, presetFromWidgets, type PresetEntry } from "../store/presets";

/** The drag type a preset carries onto the canvas; the value is the preset id. */
export const PRESET_DRAG = "text/x-preset-id";

/** Inserts a preset on the active page with its top-left at `at` (default: below everything). */
export function insertPreset(id: string, at?: { x: number; y: number }): Widget[] {
  const { project, activePageId, addWidgets } = useProject.getState();
  const page = project.pages.find((p) => p.id === activePageId);
  const entry = allPresets(project).find((e) => e.preset.id === id);
  if (!page || !entry) return [];
  const where = at ?? { x: 0, y: page.widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0) };
  const ws = instantiatePreset(entry.preset, where, { from: entry.units, to: project.canvasSnap ?? "grid" }, newWidgetId);
  addWidgets(page.id, ws);
  return ws;
}

export function PresetList() {
  const { project } = useProject();
  const entries = allPresets(project);
  return (
    <div className="p-2 pt-0 space-y-1">
      <div className="text-[9px] uppercase tracking-widest text-zinc-600 px-1 pt-2">Presets</div>
      {entries.map((e) => <PresetRow key={`${e.builtin}:${e.preset.id}`} entry={e} />)}
      {!project.presets?.length && (
        <div className="text-[10px] text-zinc-600 px-1">Right-click widgets on the canvas and choose "Save as preset" to add your own.</div>
      )}
    </div>
  );
}

function PresetRow({ entry }: { entry: PresetEntry }) {
  const { updatePreset, removePreset } = useProject();
  const { preset, builtin } = entry;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(preset.name);

  if (renaming) {
    const done = () => {
      if (name.trim() && name.trim() !== preset.name) updatePreset(preset.id, { name: name.trim() });
      setRenaming(false);
    };
    return (
      <input
        autoFocus
        aria-label={`New name for ${preset.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { setName(preset.name); setRenaming(false); } }}
        className="w-full text-[11px] px-3 py-2 rounded bg-zinc-900 border border-blue-600 text-zinc-100 focus:outline-none"
      />
    );
  }
  return (
    <div className="group flex items-center gap-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">
      <button
        draggable
        onDragStart={(e) => { e.dataTransfer.setData(PRESET_DRAG, preset.id); e.dataTransfer.effectAllowed = "copy"; }}
        onClick={() => insertPreset(preset.id)}
        title={`${preset.description ?? preset.name}. Click to add, or drag onto the canvas.`}
        className="flex-1 min-w-0 text-left px-3 py-2"
      >
        <div className="text-[11px] text-zinc-300 truncate">
          {preset.name}
          <span className="text-[9px] text-zinc-500 ml-1.5">{preset.widgets.length > 1 ? `${preset.widgets.length} widgets` : preset.widgets[0]!.type}</span>
        </div>
        {preset.description && <div className="text-[9px] text-zinc-500 truncate">{preset.description}</div>}
      </button>
      {builtin ? (
        <span className="text-[9px] text-zinc-600 pr-2 shrink-0">built-in</span>
      ) : (
        <>
          <button onClick={() => setRenaming(true)} aria-label={`Rename ${preset.name}`}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200 text-[11px] px-1 shrink-0">✎</button>
          <button onClick={() => removePreset(preset.id)} aria-label={`Delete ${preset.name}`}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-[11px] pr-2 shrink-0">×</button>
        </>
      )}
    </div>
  );
}

/** Saves the given widgets as a project preset. */
export function SavePresetDialog({ widgets, onClose }: { widgets: Widget[]; onClose: () => void }) {
  const { addPreset } = useProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const save = () => {
    if (!name.trim() || !widgets.length) return;
    addPreset(presetFromWidgets(widgets, `preset-${newWidgetId()}`, name.trim(), description.trim() || undefined));
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-label="Save as preset" className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-80 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold text-zinc-200">
          Save {widgets.length > 1 ? `${widgets.length} widgets` : "widget"} as a preset
        </div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Pump control"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-600" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-600" />
        <div className="text-[10px] text-zinc-500">Settings, tags and events are kept. Inserting the preset makes a copy; changing the preset later does not change copies already on pages.</div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
          <button onClick={save} disabled={!name.trim()} className="text-xs px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white">Save</button>
        </div>
      </div>
    </div>
  );
}
