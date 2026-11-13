// What a person is asked when they start a new project: whether the operator screen draws its own
// top bar and navigation, or the project builds them from widgets.
import { useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../ui/icons";

export type Chrome = "builtin" | "custom";

export function NewProjectDialog({ onCreate, onCancel }: { onCreate: (chrome: Chrome) => void; onCancel: () => void }) {
  const [chrome, setChrome] = useState<Chrome>("custom");
  const option = (value: Chrome, title: string, text: string) => (
    <label className={`flex gap-3 items-start rounded border px-3 py-2.5 cursor-pointer ${chrome === value ? "border-blue-500 bg-zinc-800" : "border-zinc-700 hover:border-zinc-500"}`}>
      <input type="radio" name="chrome" checked={chrome === value} onChange={() => setChrome(value)} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-zinc-400">{text}</span>
      </span>
    </label>
  );
  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onCancel}>
      <div role="dialog" aria-label="New project" className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-[28rem] shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">New project</span>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"><CloseIcon size={14} /></button>
        </div>
        <div className="text-xs text-zinc-400">Unsaved changes to the project you have open will be lost.</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Header and navigation</div>
        {option("custom", "Editable, from widgets", "The header and navigation are custom widgets you can edit on the canvas: add a logo, a button, text, or move anything. The header and navigation choices in the project tree still work on them.")}
        {option("builtin", "Built-in", "The operator screen draws its own top bar and page navigation from the choices in the project tree. You can turn it into editable widgets later.")}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          <button type="button" onClick={() => onCreate(chrome)} className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 font-medium">Create</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
