// The Recipes tab: a recipe is a named set of tag writes applied together (a startup sequence, a product changeover).
// The list is on the left; on the right the chosen recipe's writes, each with the value the tag has right now,
// and Apply, which has the runtime make the writes.
import { useState } from "react";
import type { Recipe, RecipeEntry, RecipeSet } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";
import { applyOnRuntime, entryValueText, parseEntryValue } from "../store/recipeApply";
import { BindingInput } from "./BindingInput";
import { RecipeSetEditor } from "./RecipeSetEditor";
import { LiveValue } from "./LiveValue";
import { Button, Field, IconButton, Input } from "../ui";
import { EmptyState, SelectList, TabHeader } from "../ui/Layout";
import { AddIcon, CheckIcon, CloseIcon, DeleteIcon } from "../ui/icons";

const NONE: Recipe[] = [];
const NO_SETS: RecipeSet[] = [];
type Apply = { state: "idle" | "busy" | "ok" | "err"; message: string };

const newId = () => `rec-${Math.random().toString(36).slice(2, 8)}`;
const writes = (n: number) => `${n} write${n === 1 ? "" : "s"}`;

export function RecipesTab() {
  const recipes = useProject((s) => s.project.recipes) ?? NONE;
  const recipeSets = useProject((s) => s.project.recipeSets) ?? NO_SETS;
  const { addRecipe, updateRecipe, removeRecipe, addRecipeSet } = useProject.getState();
  const chosen = useWorkspace((s) => s.selection.recipes);
  const select = useWorkspace((s) => s.select);
  const [applied, setApplied] = useState<Record<string, Apply>>({});
  const [confirm, setConfirm] = useState(false);

  // A recipe set is chosen when its id is; with nothing chosen the first set, else the first single recipe, is shown.
  const chosenSet = recipeSets.find((s) => s.id === chosen) ?? (recipes.some((r) => r.id === chosen) ? undefined : recipeSets[0]);
  const recipe = chosenSet ? undefined : recipes.find((r) => r.id === chosen) ?? recipes[0];

  const addSet = () => {
    const s: RecipeSet = { id: newId(), name: `Recipe set ${recipeSets.length + 1}`, variables: [], recipes: [] };
    addRecipeSet(s);
    select("recipes", s.id);
  };
  // An older single recipe becomes a set of one recipe: its tags are the variables, its values the one recipe.
  const convert = (r: Recipe) => {
    const entries = r.entries.filter((e) => e.binding.trim() !== "");
    const s: RecipeSet = {
      id: `set-${r.id}`, name: r.name || "Recipe set", variables: entries.map((e) => ({ binding: e.binding })),
      recipes: [{ id: newId(), name: r.name || "Recipe", values: Object.fromEntries(entries.map((e) => [e.binding, e.value])) }],
    };
    addRecipeSet(s);
    removeRecipe(r.id);
    select("recipes", s.id);
  };

  const add = () => {
    const r: Recipe = { id: newId(), name: `Recipe ${recipes.length + 1}`, description: "", entries: [] };
    addRecipe(r);
    select("recipes", r.id);
  };

  // The runtime applies the deployed copy of the recipe, through the write pipeline, with its recipe.apply check.
  const apply = async (r: Recipe) => {
    setApplied((a) => ({ ...a, [r.id]: { state: "busy", message: "" } }));
    const { errors, applied: n } = await applyOnRuntime(r.id);
    setApplied((a) => ({ ...a, [r.id]: errors.length === 0 ? { state: "ok", message: `Applied ${writes(n)}.` } : { state: "err", message: errors.join("; ") } }));
  };

  const setEntries = (r: Recipe, entries: RecipeEntry[]) => updateRecipe(r.id, { entries });
  const result = recipe ? applied[recipe.id] : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <TabHeader title="Recipes" summary={`${recipes.length} recipe${recipes.length === 1 ? "" : "s"}${recipeSets.length ? `, ${recipeSets.length} recipe set${recipeSets.length === 1 ? "" : "s"}` : ""}`}
        actions={<><Button icon={<AddIcon size={14} />} onClick={add}>New recipe</Button><Button variant="primary" icon={<AddIcon size={14} />} onClick={addSet}>New recipe set</Button></>} />
      <div className="flex-1 flex min-h-0">
        <section className="w-72 shrink-0 min-w-0 flex flex-col border-r border-zinc-800">
          {recipes.length === 0 && recipeSets.length === 0 ? (
            <EmptyState title="No recipes yet" action={<Button variant="primary" icon={<AddIcon size={14} />} onClick={addSet}>New recipe set</Button>}>
              A recipe set is a list of variables with named recipes that set them: a product changeover, a startup sequence. Operators load, save and delete recipes on the screen.
            </EmptyState>
          ) : (
            <SelectList label="Recipes" className="flex-1 min-h-0" selected={chosenSet?.id ?? recipe?.id ?? null} onSelect={(id) => { select("recipes", id); setConfirm(false); }}
              items={[...recipeSets.map((s) => ({
                id: s.id,
                content: (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-ui font-medium text-zinc-100">{s.name || "Unnamed set"}</span>
                      <span className="text-ui-label text-zinc-500 shrink-0">{`${s.variables.length} variable${s.variables.length === 1 ? "" : "s"}`}</span>
                    </div>
                    <div className="truncate text-ui-label text-zinc-500">{`Recipe set, ${(s.recipes ?? []).length} shipped`}</div>
                  </div>
                ),
              })), ...recipes.map((r) => ({
                id: r.id,
                content: (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-ui font-medium text-zinc-100">{r.name || "Unnamed recipe"}</span>
                      <span className="text-ui-label text-zinc-500 shrink-0">{writes(r.entries.length)}</span>
                    </div>
                    {r.description && <div className="truncate text-ui-label text-zinc-500">{r.description}</div>}
                  </div>
                ),
              }))]} />
          )}
        </section>

        <section className="flex-1 min-w-0 min-h-0 overflow-auto">
          {chosenSet ? (
            <div key={chosenSet.id} className="max-w-5xl"><RecipeSetEditor set={chosenSet} /></div>
          ) : !recipe ? (
            <EmptyState title="Choose a recipe, or make one" />
          ) : (
            <div key={recipe.id} className="p-4 max-w-3xl space-y-4">
              <div className="flex items-end gap-2">
                <Field label="Name" className="flex-1">
                  <Input value={recipe.name} onChange={(e) => updateRecipe(recipe.id, { name: e.target.value })} />
                </Field>
                <Button variant="primary" disabled={result?.state === "busy" || recipe.entries.length === 0 || recipe.entries.some((e) => !e.binding.trim())}
                  icon={result?.state === "ok" ? <CheckIcon size={14} /> : undefined} onClick={() => void apply(recipe)}>
                  {result?.state === "busy" ? "Applying…" : "Apply on the runtime"}
                </Button>
                <Button onClick={() => convert(recipe)}>Convert to a recipe set</Button>
                {confirm ? (
                  <>
                    <Button variant="danger" onClick={() => { removeRecipe(recipe.id); setConfirm(false); }}>Delete</Button>
                    <Button onClick={() => setConfirm(false)}>Keep</Button>
                  </>
                ) : <IconButton label="Delete recipe" icon={<DeleteIcon size={16} />} onClick={() => setConfirm(true)} />}
              </div>
              {confirm && <div className="text-ui-label text-red-500">Delete “{recipe.name}” and its {writes(recipe.entries.length)}?</div>}

              {result && result.state !== "idle" && result.state !== "busy" && (
                <div role="status" className={`rounded border px-3 py-2 text-ui ${result.state === "err" ? "border-red-500 text-red-500" : "border-emerald-500 text-emerald-600"}`}>
                  {result.message}
                </div>
              )}

              <Field label="Description" hint="Apply works on the copy the runtime has, so deploy the project first after a change.">
                <Input value={recipe.description ?? ""} onChange={(e) => updateRecipe(recipe.id, { description: e.target.value })} placeholder="Optional" />
              </Field>

              <div>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)_8rem_9rem_2rem] gap-2 px-1 pb-1 text-ui-label uppercase tracking-wide text-zinc-500">
                  <span>#</span><span>Tag</span><span>Value to write</span><span>Now</span><span />
                </div>
                {recipe.entries.some((e) => !e.binding.trim()) && <div role="alert" className="px-1 pb-2 text-ui-label text-red-500">Some writes have no tag chosen. Pick a tag for each, or remove the row; the recipe cannot be applied until then.</div>}
                {recipe.entries.length === 0 && <div className="px-1 py-3 text-ui text-zinc-500">No writes yet. Add the tags this recipe sets.</div>}
                {recipe.entries.map((entry, i) => (
                  <EntryRow key={i} index={i} entry={entry}
                    onChange={(patch) => setEntries(recipe, recipe.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)))}
                    onRemove={() => setEntries(recipe, recipe.entries.filter((_, j) => j !== i))} />
                ))}
                <Button className="mt-2" icon={<AddIcon size={14} />} onClick={() => setEntries(recipe, [...recipe.entries, { binding: "", value: 0 }])}>Add write</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EntryRow({ index, entry, onChange, onRemove }: {
  index: number; entry: RecipeEntry; onChange: (patch: Partial<RecipeEntry>) => void; onRemove: () => void;
}) {
  // The text as typed while the field has the focus, so "2." on the way to "2.5" is not turned into 2.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_8rem_9rem_2rem] gap-2 items-center py-1 border-t border-zinc-800/60">
      <span className="px-1 text-ui-label text-zinc-500 tabular-nums">{index + 1}</span>
      <BindingInput ariaLabel={`Tag ${index + 1}`} value={entry.binding} onChange={(v) => onChange({ binding: v })} wrapClassName="min-w-0"
        className="w-full h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-ui font-mono text-zinc-100" />
      <Input mono aria-label={`Value ${index + 1}`} value={draft ?? entryValueText(entry.value)}
        onChange={(e) => { setDraft(e.target.value); onChange({ value: parseEntryValue(e.target.value) }); }}
        onBlur={() => setDraft(null)} placeholder="value" />
      <LiveValue path={entry.binding} className="text-ui text-zinc-300" />
      <IconButton label={`Remove write ${index + 1}`} size="sm" icon={<CloseIcon size={14} />} onClick={onRemove} />
    </div>
  );
}
