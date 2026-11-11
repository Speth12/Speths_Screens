// Recipe sets as the screens see them. The project lists the sets (and the recipes they ship); the runtime keeps the
// recipes operators save. A recipe from before recipe sets is shown as a set of one recipe, as the runtime does.
import type { Project, RecipeSet } from "@speths-screens/shared-types";

export function recipeSetsOf(project: Pick<Project, "recipes" | "recipeSets"> | undefined): RecipeSet[] {
  if (!project) return [];
  const sets: RecipeSet[] = [...(project.recipeSets ?? [])];
  const taken = new Set(sets.map((s) => s.id));
  for (const rec of project.recipes ?? []) {
    if (taken.has(rec.id)) continue;
    const entries = rec.entries.filter((e) => e.binding.trim() !== "");
    sets.push({
      id: rec.id,
      name: rec.name,
      variables: entries.map((e) => ({ binding: e.binding })),
      recipes: [{ id: "default", name: rec.name, values: Object.fromEntries(entries.map((e) => [e.binding, e.value])) }],
    });
  }
  return sets;
}

/** Whether a user may load, save and delete recipes: the roles the runtime gives recipe.apply and recipe.edit. With no
 *  login, everyone may. The runtime checks it again; this only decides what the screen offers. */
export function mayEditRecipes(user: { role?: string; loginRequired: boolean }): boolean {
  return !user.loginRequired || ["supervisor", "engineer", "admin"].includes((user.role ?? "").toLowerCase());
}
