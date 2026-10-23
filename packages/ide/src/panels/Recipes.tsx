// Recipe management panel.
// Recipes are named sets of tag write operations applied in one click.
// Use for: startup/shutdown sequences, parameter sets, product changeovers.
import { useState } from "react";
import { useProject, type Recipe, type RecipeEntry } from "../store/projectStore";
import { apiBase } from "../store/runtimeTarget";

const uid = () => Math.random().toString(36).slice(2, 8);

function newRecipe(): Recipe {
  return { id: `rec-${uid()}`, name: "New Recipe", description: "", entries: [] };
}

function newEntry(): RecipeEntry {
  return { binding: "", value: 0 };
}

export function Recipes() {
  const { project, addRecipe, updateRecipe, removeRecipe } = useProject();
  const recipes = project.recipes ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<Record<string, "idle" | "busy" | "ok" | "err">>({});
  const [applyMsg, setApplyMsg] = useState<Record<string, string>>({});

  const apply = async (recipe: Recipe) => {
    setApplyState((s) => ({ ...s, [recipe.id]: "busy" }));
    setApplyMsg((m) => ({ ...m, [recipe.id]: "" }));
    const errors: string[] = [];
    let applied = 0;

    await Promise.all(
      recipe.entries.map(async (entry) => {
        if (!entry.binding) return;
        const sep = entry.binding.indexOf(":");
        if (sep < 0) { errors.push(`bad binding: ${entry.binding}`); return; }
        const datasource = entry.binding.slice(0, sep);
        const path = entry.binding.slice(sep + 1);
        try {
          const r = await fetch(`${apiBase}/api/v1/tag/${encodeURIComponent(path)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ datasource, value: entry.value }),
          });
          if (r.ok) { applied++; }
          else { errors.push(`${path}: HTTP ${r.status}`); }
        } catch (e) {
          errors.push(`${path}: ${(e as Error).message}`);
        }
      })
    );

    if (errors.length === 0) {
      setApplyState((s) => ({ ...s, [recipe.id]: "ok" }));
      setApplyMsg((m) => ({ ...m, [recipe.id]: `Applied ${applied} write${applied !== 1 ? "s" : ""}` }));
    } else {
      setApplyState((s) => ({ ...s, [recipe.id]: "err" }));
      setApplyMsg((m) => ({ ...m, [recipe.id]: errors.join("; ") }));
    }
    setTimeout(() => setApplyState((s) => ({ ...s, [recipe.id]: "idle" })), 3000);
  };

  const updateEntry = (recipeId: string, idx: number, patch: Partial<RecipeEntry>) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    const entries = rec.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    updateRecipe(recipeId, { entries });
  };

  const removeEntry = (recipeId: string, idx: number) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    updateRecipe(recipeId, { entries: rec.entries.filter((_, i) => i !== idx) });
  };

  const addEntry = (recipeId: string) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    updateRecipe(recipeId, { entries: [...rec.entries, newEntry()] });
  };

  const inp = "bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-zinc-600";

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Recipes</div>
        <button
          onClick={() => { const r = newRecipe(); addRecipe(r); setExpandedId(r.id); }}
          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
        >
          + New
        </button>
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {recipes.length === 0 && (
          <div className="text-xs text-zinc-500 italic p-2">
            No recipes yet. Create one to batch-write tag values (e.g. startup/shutdown sequences).
          </div>
        )}

        {recipes.map((rec) => {
          const expanded = expandedId === rec.id;
          const state = applyState[rec.id] ?? "idle";
          const msg = applyMsg[rec.id] ?? "";

          return (
            <div key={rec.id} className="border border-zinc-800 rounded-md overflow-hidden">
              {/* Recipe header row */}
              <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-900/60">
                <button
                  onClick={() => setExpandedId(expanded ? null : rec.id)}
                  className="text-zinc-400 hover:text-zinc-200 text-[10px] w-3 shrink-0"
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <input
                  value={rec.name}
                  onChange={(e) => updateRecipe(rec.id, { name: e.target.value })}
                  className="flex-1 bg-transparent text-xs font-medium text-zinc-200 focus:outline-none"
                  placeholder="Recipe name"
                />
                <span className="text-[10px] text-zinc-600 shrink-0">{rec.entries.length} writes</span>
                <button
                  onClick={() => apply(rec)}
                  disabled={state === "busy" || rec.entries.length === 0}
                  className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 disabled:opacity-40 transition-colors ${
                    state === "ok" ? "bg-emerald-700 text-white"
                    : state === "err" ? "bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {state === "busy" ? "…" : state === "ok" ? "✓" : state === "err" ? "!" : "Apply"}
                </button>
                <button
                  onClick={() => removeRecipe(rec.id)}
                  className="text-zinc-600 hover:text-red-400 text-xs shrink-0"
                >
                  ×
                </button>
              </div>

              {/* Apply feedback */}
              {msg && (
                <div className={`px-3 py-0.5 text-[10px] ${state === "err" ? "text-red-400 bg-red-900/20" : "text-emerald-400 bg-emerald-900/20"}`}>
                  {msg}
                </div>
              )}

              {/* Expanded body */}
              {expanded && (
                <div className="px-3 py-2 space-y-2 bg-zinc-950/40">
                  {/* Description */}
                  <input
                    value={rec.description ?? ""}
                    onChange={(e) => updateRecipe(rec.id, { description: e.target.value })}
                    placeholder="Description (optional)"
                    className={`${inp} w-full text-zinc-400`}
                  />

                  {/* Entry list */}
                  <div className="space-y-1">
                    {rec.entries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={entry.binding}
                          onChange={(e) => updateEntry(rec.id, i, { binding: e.target.value })}
                          placeholder="ds:tagPath"
                          className={`${inp} flex-1 font-mono text-zinc-300`}
                        />
                        <span className="text-zinc-600 text-[10px] shrink-0">=</span>
                        <input
                          value={String(entry.value ?? "")}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = parseFloat(raw);
                            updateEntry(rec.id, i, { value: isNaN(num) ? raw : num });
                          }}
                          placeholder="value"
                          className={`${inp} w-20 font-mono`}
                        />
                        <button
                          onClick={() => removeEntry(rec.id, i)}
                          className="text-zinc-600 hover:text-red-400 text-xs shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {rec.entries.length === 0 && (
                      <div className="text-[10px] text-zinc-600 italic">No entries — add tag writes below</div>
                    )}
                  </div>

                  <button
                    onClick={() => addEntry(rec.id)}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 w-full text-left"
                  >
                    + Add write
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
