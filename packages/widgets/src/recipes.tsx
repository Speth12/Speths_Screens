// The recipes widget: a recipe set as a table. One list of variables, many named recipes that set them. A supervisor
// can Load a recipe (write its values to the PLC), Save (store values into it), Save as (a new recipe) and Delete.
//
// The runtime keeps the recipes (GET /api/v1/recipe-sets, and POST, PUT and DELETE under it); the widget only asks and
// shows the answer. It checks nothing itself: limits, names and permissions are the runtime's, and a refusal is shown.
//
// What Save and Save as store: the values typed into the table, when any were typed; otherwise the values the
// variables hold now. The confirmation says which.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecipeSet, RecipesProps, RecipeVariable, SetRecipe } from "@speths-screens/shared-types";
import { useHost } from "./host";
import { mayEditRecipes } from "./recipeSets";

type Result = { ok: boolean; msg: string };
type Answer = { ok?: boolean; applied?: number; errors?: string[]; error?: string; id?: string } | null;

/** The words for the runtime's answer to a load. */
export function applyResult(status: number, data: Answer): Result {
  if (data?.ok) {
    const n = data.applied ?? 0;
    return { ok: true, msg: `Loaded ${n} variable${n === 1 ? "" : "s"}` };
  }
  if (status === 401 || status === 403) return { ok: false, msg: "Not allowed: sign in as a user who may load recipes" };
  return { ok: false, msg: data?.errors?.join(", ") || data?.error || `Failed (${status})` };
}

/** What a person typed into a value cell: a flag, a number when the whole text is one, otherwise the text. */
export function parseCell(text: string): boolean | number | string {
  const t = text.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : text;
}

const same = (a: unknown, b: unknown) => String(a) === String(b);
const columnName = (v: RecipeVariable) => v.label || v.binding.replace(/^[^:]+:/, "") || "—";

export function RecipesWidget({ w }: { w: { props?: RecipesProps } }) {
  const host = useHost();
  const t = host.useTranslate();
  const projectSets = host.useRecipeSets();
  const user = host.useUser();
  const canEdit = mayEditRecipes(user);
  const [fromRuntime, setFromRuntime] = useState<RecipeSet[] | null>(null);
  const [setId, setSetId] = useState<string | undefined>(undefined);
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [ask, setAsk] = useState<"save" | "delete" | "saveAs" | null>(null);
  const [newName, setNewName] = useState("");

  // The runtime's list, which has what operators saved; until it answers (or when there is no runtime: design time),
  // the recipes the project ships.
  const reload = useCallback(async () => {
    try {
      const res = await host.apiFetch("/api/v1/recipe-sets");
      if (res.ok) setFromRuntime((await res.json()) as RecipeSet[]);
    } catch { /* keep what is shown */ }
  }, [host]);
  useEffect(() => { void reload(); }, [reload]);

  const sets = fromRuntime ?? projectSets;
  const wantedSet = w.props?.recipeSetId ?? w.props?.recipeId;
  const fixedSet = wantedSet ? sets.find((s) => s.id === wantedSet) : undefined;
  const set = fixedSet ?? sets.find((s) => s.id === setId) ?? (wantedSet ? undefined : sets[0]);
  const recipes: SetRecipe[] = set?.recipes ?? [];
  const recipe = recipes.find((r) => r.id === recipeId) ?? recipes[0];
  const variables = useMemo(() => (set?.variables ?? []).filter((v) => v.binding.trim() !== ""), [set]);
  const live = host.useTags(variables.map((v) => v.binding));
  const edited = Object.keys(draft).length > 0;

  const pick = (fn: () => void) => { fn(); setDraft({}); setAsk(null); setResult(null); };
  const valueOf = (v: RecipeVariable): unknown => (v.binding in draft ? draft[v.binding] : recipe?.values?.[v.binding] ?? v.default);
  /** The table as it would be saved: the recipe's values with what was typed over them. */
  const tableValues = () => Object.fromEntries(variables.flatMap((v) => (valueOf(v) === undefined ? [] : [[v.binding, valueOf(v)] as const])));

  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: Answer }> => {
    const res = await host.apiFetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: (await res.json().catch(() => null)) as Answer };
  };
  const run = async (what: () => Promise<Result | null>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await what());
    } catch {
      setResult({ ok: false, msg: "Network error" });
    } finally {
      setBusy(false);
    }
  };
  const failed = (status: number, data: Answer): Result =>
    status === 401 || status === 403 ? { ok: false, msg: "Not allowed: sign in as a supervisor" } : { ok: false, msg: data?.error || data?.errors?.join(", ") || `Failed (${status})` };

  const base = set ? `/api/v1/recipe-sets/${encodeURIComponent(set.id)}/recipes` : "";
  const load = () => run(async () => {
    const { status, data } = await call("POST", `${base}/${encodeURIComponent(recipe!.id)}/apply`);
    return applyResult(status, data);
  });
  const save = () => run(async () => {
    setAsk(null);
    const { status, data } = await call("PUT", `${base}/${encodeURIComponent(recipe!.id)}`, edited ? { values: tableValues() } : { fromCurrent: true });
    if (status !== 200) return failed(status, data);
    setDraft({});
    await reload();
    return { ok: true, msg: `Saved “${recipe!.name}”` };
  });
  const saveAs = () => run(async () => {
    const { status, data } = await call("POST", base, edited ? { name: newName, values: tableValues() } : { name: newName });
    if (status !== 201) return failed(status, data);
    setAsk(null);
    setDraft({});
    setNewName("");
    await reload();
    if (data?.id) setRecipeId(data.id);
    return { ok: true, msg: `Saved as “${newName.trim()}”` };
  });
  const remove = () => run(async () => {
    setAsk(null);
    const { status, data } = await call("DELETE", `${base}/${encodeURIComponent(recipe!.id)}`);
    if (status !== 200) return failed(status, data);
    setDraft({});
    setRecipeId(undefined);
    await reload();
    return { ok: true, msg: `Deleted “${recipe!.name}”` };
  });

  if (!set) {
    return <div className="h-full flex items-center justify-center text-xs italic" style={{ color: "var(--muted-foreground)" }}>{t("No recipes")}</div>;
  }

  const btn = "px-3 text-xs font-semibold disabled:opacity-40 whitespace-nowrap";
  const btnStyle = (primary?: boolean, danger?: boolean) => ({
    minHeight: "var(--control-height, 2rem)", borderRadius: "var(--radius)",
    background: primary ? "var(--primary)" : "transparent", color: primary ? "var(--primary-foreground)" : danger ? "var(--alarm-critical)" : "inherit",
    border: primary ? "none" : "var(--line-width, 1px) solid var(--border)",
  });
  const none = !recipe;

  return (
    <div className="h-full flex flex-col gap-2 min-h-0" data-testid="recipe-set">
      <div className="flex flex-wrap items-center gap-2">
        {!fixedSet && sets.length > 1 && (
          <select aria-label={t("Recipe set")} value={set.id} onChange={(e) => pick(() => { setSetId(e.target.value); setRecipeId(undefined); })}
            className="px-2 text-xs" style={{ minHeight: "var(--control-height, 2rem)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
            {sets.map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
          </select>
        )}
        <select aria-label={t("Recipe")} value={recipe?.id ?? ""} disabled={none} onChange={(e) => pick(() => setRecipeId(e.target.value))}
          className="px-2 text-xs min-w-[8rem] flex-1" style={{ minHeight: "var(--control-height, 2rem)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
          {none && <option value="">{t("No recipes yet")}</option>}
          {recipes.map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}
        </select>
        {canEdit && (
          <>
            <button className={btn} style={btnStyle(true)} disabled={busy || none} onClick={() => void load()}>{t("Load")}</button>
            <button className={btn} style={btnStyle()} disabled={busy || none} onClick={() => setAsk(ask === "save" ? null : "save")}>{t("Save")}</button>
            <button className={btn} style={btnStyle()} disabled={busy} onClick={() => setAsk(ask === "saveAs" ? null : "saveAs")}>{t("Save as…")}</button>
            <button className={btn} style={btnStyle(false, true)} disabled={busy || none} onClick={() => setAsk(ask === "delete" ? null : "delete")}>{t("Delete")}</button>
          </>
        )}
      </div>

      {ask === "save" && recipe && (
        <div role="group" aria-label={t("Confirm save")} className="flex flex-wrap items-center gap-2 text-xs">
          <span>{edited ? t(`Overwrite “${recipe.name}” with the values typed in the table?`) : t(`Overwrite “${recipe.name}” with the values the variables hold now?`)}</span>
          <button className={btn} style={btnStyle(true)} disabled={busy} onClick={() => void save()}>{t("Overwrite")}</button>
          <button className={btn} style={btnStyle()} onClick={() => setAsk(null)}>{t("Cancel")}</button>
        </div>
      )}
      {ask === "saveAs" && (
        <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) void saveAs(); }}>
          <input aria-label={t("New recipe name")} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("Name of the new recipe")}
            maxLength={80} className="px-2 flex-1 min-w-[8rem]" style={{ minHeight: "var(--control-height, 2rem)", border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }} />
          <span style={{ color: "var(--muted-foreground)" }}>{edited ? t("with the values typed in the table") : t("with the values the variables hold now")}</span>
          <button type="submit" className={btn} style={btnStyle(true)} disabled={busy || !newName.trim()}>{t("Save")}</button>
          <button type="button" className={btn} style={btnStyle()} onClick={() => setAsk(null)}>{t("Cancel")}</button>
        </form>
      )}
      {ask === "delete" && recipe && (
        <div role="group" aria-label={t("Confirm delete")} className="flex flex-wrap items-center gap-2 text-xs">
          <span>{t(`Delete “${recipe.name}”?`)}</span>
          <button className={btn} style={btnStyle(false, true)} disabled={busy} onClick={() => void remove()}>{t("Delete")}</button>
          <button className={btn} style={btnStyle()} onClick={() => setAsk(null)}>{t("Cancel")}</button>
        </div>
      )}
      {result && (
        <div role="status" className="text-xs font-medium" style={{ color: result.ok ? "#16a34a" : "var(--alarm-critical)" }}>
          {result.ok ? "✓ " : "✗ "}{result.msg}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-collapse" data-testid="recipe-table">
          <thead className="sticky top-0" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>
            <tr>
              <th className="text-left font-medium px-1 py-1 w-6">#</th>
              <th className="text-left font-medium px-1 py-1">{t("Variable")}</th>
              <th className="text-right font-medium px-1 py-1">{t("Recipe value")}</th>
              <th className="text-right font-medium px-1 py-1">{t("Now")}</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((v, i) => {
              const val = valueOf(v);
              const st = live[v.binding];
              const known = st !== undefined && st.quality !== "Unknown" && st.quality !== "Bad" && st.value !== null && st.value !== undefined;
              const match = known && val !== undefined && same(st.value, val);
              const typed = v.binding in draft;
              return (
                <tr key={v.binding} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-1 py-0.5 tabular-nums" style={{ color: "var(--muted-foreground)" }}>{i + 1}</td>
                  <td className="px-1 py-0.5 font-mono">{t(columnName(v))}</td>
                  <td className="px-1 py-0.5 text-right">
                    {canEdit && !none ? (
                      <input aria-label={`${columnName(v)} ${t("recipe value")}`} value={val === undefined ? "" : String(val)} placeholder="—"
                        onChange={(e) => { setResult(null); setDraft({ ...draft, [v.binding]: parseCell(e.target.value) }); }}
                        className="w-full max-w-[9rem] text-right font-mono tabular-nums px-1" style={{ background: typed ? "var(--accent, rgba(250,204,21,.25))" : "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius)" }} />
                    ) : (
                      <span className="font-mono tabular-nums">{val === undefined ? "—" : String(val)}</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 text-right font-mono tabular-nums" style={{ color: match ? "#16a34a" : undefined }}>
                    {known ? String(st.value) : "—"}{match ? " ✓" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
