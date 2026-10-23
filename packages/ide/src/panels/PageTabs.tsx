import { useRef, useState } from "react";
import { useProject } from "../store/projectStore";

export function PageTabs() {
  const { project, activePageId, setActivePage, addPage, removePage, renamePage } = useProject();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setDraft(currentName);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  };

  const commitRename = () => {
    if (editingId && draft.trim()) renamePage(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 overflow-x-auto shrink-0">
      {project.pages.map((p) => (
        <div
          key={p.id}
          onClick={() => setActivePage(p.id)}
          className={`group flex items-center gap-1 px-2.5 py-1 rounded text-xs cursor-pointer select-none ${
            activePageId === p.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"
          }`}
        >
          {editingId === p.id ? (
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-700 rounded px-1 outline-none w-24 text-zinc-100"
            />
          ) : (
            <span onDoubleClick={(e) => { e.stopPropagation(); startRename(p.id, p.name); }}>
              {p.name}
            </span>
          )}
          {project.pages.length > 1 && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); removePage(p.id); }}
              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 ml-1 text-xs leading-none"
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button
        onClick={() => addPage()}
        className="ml-1 text-xs px-2 py-1 rounded text-zinc-500 hover:bg-zinc-800/50 shrink-0"
      >
        + Page
      </button>
    </div>
  );
}
