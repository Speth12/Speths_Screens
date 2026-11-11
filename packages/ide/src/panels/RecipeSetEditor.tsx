// One recipe set: the variables every recipe of the set writes, and the recipes shipped with the project.
// Operators save more recipes on the runtime (the Recipes widget); those are kept there and are not part of this list,
// and a deploy never overwrites or restores them.
import { useState } from "react";
import type { RecipeSet, RecipeVariable, SetRecipe } from "@speths-screens/shared-types";
import { parseCell } from "@speths-screens/widgets";
import { useProject } from "../store/projectStore";
import { BindingInput } from "./BindingInput";
import { LiveValue } from "./LiveValue";
import { Button, Field, IconButton, Input } from "../ui";
import { AddIcon, CloseIcon, DeleteIcon } from "../ui/icons";

const newId = () => `rec-${Math.random().toString(36).slice(2, 8)}`;
const shown = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (text: string): number | undefined => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : undefined);

export function RecipeSetEditor({ set }: { set: RecipeSet }) {
  const { updateRecipeSet, removeRecipeSet } = useProject.getState();
  const [confirm, setConfirm] = useState(false);
  const recipes = set.recipes ?? [];
  const patch = (p: Partial<RecipeSet>) => updateRecipeSet(set.id, p);

  const setVariable = (i: number, p: Partial<RecipeVariable>) => {
    const old = set.variables[i]!;
    const next = set.variables.map((v, j) => (j === i ? { ...v, ...p } : v));
    // A variable that is pointed at another tag keeps the values the recipes held for it.
    const renamed = p.binding !== undefined && p.binding !== old.binding;
    patch({
      variables: next,
      ...(renamed ? { recipes: recipes.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k === old.binding ? p.binding! : k, v])) })) } : {}),
    });
  };
  const removeVariable = (i: number) => {
    const gone = set.variables[i]!.binding;
    patch({ variables: set.variables.filter((_, j) => j !== i), recipes: recipes.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).filter(([k]) => k !== gone)) })) });
  };
  const setRecipe = (id: string, p: Partial<SetRecipe>) => patch({ recipes: recipes.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const setCell = (r: SetRecipe, binding: string, text: string) => {
    const values = { ...r.values };
    if (text === "") delete values[binding];
    else values[binding] = parseCell(text);
    setRecipe(r.id, { values });
  };
  const blank = set.variables.some((v) => !v.binding.trim());

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-end gap-2">
        <Field label="Name" className="flex-1"><Input value={set.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
        {confirm ? (
          <>
            <Button variant="danger" onClick={() => removeRecipeSet(set.id)}>Delete</Button>
            <Button onClick={() => setConfirm(false)}>Keep</Button>
          </>
        ) : <IconButton label="Delete recipe set" icon={<DeleteIcon size={16} />} onClick={() => setConfirm(true)} />}
      </div>
      {confirm && <div className="text-ui-label text-red-500">Delete “{set.name}”, its {set.variables.length} variable{set.variables.length === 1 ? "" : "s"} and its {recipes.length} shipped recipe{recipes.length === 1 ? "" : "s"}? Recipes operators saved on a runtime stay there.</div>}

      <section aria-label="Variables">
        <h3 className="text-ui-title font-medium text-zinc-100 mb-1">Variables</h3>
        <p className="text-ui-label text-zinc-500 mb-2">Every recipe of the set gives each of these a value. A recipe with no value for a variable uses its default, or leaves the variable alone.</p>
        {blank && <div role="alert" className="pb-2 text-ui-label text-red-500">Some variables have no tag chosen. Pick a tag for each, or remove the row.</div>}
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_9rem_5rem_5rem_6rem_7rem_2rem] gap-2 px-1 pb-1 text-ui-label uppercase tracking-wide text-zinc-500">
          <span>#</span><span>Tag</span><span>Heading</span><span>Min</span><span>Max</span><span>Default</span><span>Now</span><span />
        </div>
        {set.variables.length === 0 && <div className="px-1 py-3 text-ui text-zinc-500">No variables yet.</div>}
        {set.variables.map((v, i) => (
          <div key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_9rem_5rem_5rem_6rem_7rem_2rem] gap-2 items-center py-1 border-t border-zinc-800/60">
            <span className="px-1 text-ui-label text-zinc-500 tabular-nums">{i + 1}</span>
            <BindingInput ariaLabel={`Variable ${i + 1} tag`} value={v.binding} onChange={(b) => setVariable(i, { binding: b })} wrapClassName="min-w-0"
              className="w-full h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-ui font-mono text-zinc-100" />
            <Input aria-label={`Variable ${i + 1} heading`} value={v.label ?? ""} placeholder="tag name" onChange={(e) => setVariable(i, { label: e.target.value || undefined })} />
            <Input mono aria-label={`Variable ${i + 1} min`} value={shown(v.min)} onChange={(e) => setVariable(i, { min: num(e.target.value) })} />
            <Input mono aria-label={`Variable ${i + 1} max`} value={shown(v.max)} onChange={(e) => setVariable(i, { max: num(e.target.value) })} />
            <Input mono aria-label={`Variable ${i + 1} default`} value={shown(v.default)} placeholder="none" onChange={(e) => setVariable(i, { default: e.target.value === "" ? undefined : parseCell(e.target.value) })} />
            <LiveValue path={v.binding} className="text-ui text-zinc-300" />
            <IconButton label={`Remove variable ${i + 1}`} size="sm" icon={<CloseIcon size={14} />} onClick={() => removeVariable(i)} />
          </div>
        ))}
        <Button className="mt-2" icon={<AddIcon size={14} />} onClick={() => patch({ variables: [...set.variables, { binding: "" }] })}>Add variable</Button>
      </section>

      <section aria-label="Shipped recipes">
        <h3 className="text-ui-title font-medium text-zinc-100 mb-1">Recipes shipped with the project</h3>
        <p className="text-ui-label text-zinc-500 mb-2">A deploy adds these to the runtime once. It never changes or brings back a recipe an operator saved over, renamed or deleted there.</p>
        <div className="overflow-x-auto">
          <table className="text-ui border-collapse">
            <thead>
              <tr className="text-ui-label uppercase tracking-wide text-zinc-500">
                <th className="text-left font-normal pr-2 pb-1">Recipe</th>
                {set.variables.map((v, i) => <th key={i} className="text-left font-normal px-1 pb-1 font-mono normal-case">{v.label || v.binding.replace(/^[^:]+:/, "") || "—"}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {recipes.map((r, ri) => (
                <tr key={r.id} className="border-t border-zinc-800/60">
                  <td className="pr-2 py-1"><Input aria-label={`Recipe ${ri + 1} name`} value={r.name} onChange={(e) => setRecipe(r.id, { name: e.target.value })} /></td>
                  {set.variables.map((v, i) => (
                    <td key={i} className="px-1 py-1">
                      <Input mono className="w-24" aria-label={`${r.name || `Recipe ${ri + 1}`}, ${v.label || v.binding || `variable ${i + 1}`}`}
                        value={shown(r.values[v.binding])} placeholder={v.default === undefined ? "—" : shown(v.default)} disabled={!v.binding.trim()}
                        onChange={(e) => setCell(r, v.binding, e.target.value)} />
                    </td>
                  ))}
                  <td><IconButton label={`Remove recipe ${ri + 1}`} size="sm" icon={<CloseIcon size={14} />} onClick={() => patch({ recipes: recipes.filter((x) => x.id !== r.id) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recipes.length === 0 && <div className="px-1 py-3 text-ui text-zinc-500">None. Operators can still save recipes on the runtime.</div>}
        <Button className="mt-2" icon={<AddIcon size={14} />} onClick={() => patch({ recipes: [...recipes, { id: newId(), name: `Recipe ${recipes.length + 1}`, values: {} }] })}>Add recipe</Button>
      </section>
    </div>
  );
}
