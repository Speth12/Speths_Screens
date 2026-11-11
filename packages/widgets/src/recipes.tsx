// The recipes widget: the project's recipes, each with a button that writes its values to the PLC.
// The runtime does the writing (POST /api/v1/recipes/{id}/apply, which checks the user may apply
// recipes and writes every tag through the write pipeline), so the widget only asks and shows the answer.
import { useState } from "react";
import type { Recipe, RecipesProps } from "@speths-screens/shared-types";
import { useHost } from "./host";

type Result = { ok: boolean; msg: string };

/** The words for the runtime's answer to an apply. */
export function applyResult(status: number, data: { ok?: boolean; applied?: number; errors?: string[]; error?: string } | null): Result {
  if (data?.ok) {
    const n = data.applied ?? 0;
    return { ok: true, msg: `Applied ${n} tag${n === 1 ? "" : "s"}` };
  }
  if (status === 401 || status === 403) return { ok: false, msg: "Not allowed: sign in as a user who may apply recipes" };
  return { ok: false, msg: data?.errors?.join(", ") || data?.error || `Failed (${status})` };
}

export function RecipesWidget({ w }: { w: { props?: RecipesProps } }) {
  const host = useHost();
  const t = host.useTranslate();
  const all = host.useRecipes();
  const [applying, setApplying] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } & Result | null>(null);

  const recipes: Recipe[] = w.props?.recipeId ? all.filter((r) => r.id === w.props!.recipeId) : all;
  const showEntries = w.props?.showEntries !== false;
  // The values the tags hold now, for the "Now" column. A hook, so it runs before the early return.
  const live = host.useTags(showEntries ? [...new Set(recipes.flatMap((r) => r.entries.map((e) => e.binding)).filter(Boolean))] : []);

  const apply = async (r: Recipe) => {
    setApplying(r.id);
    setResult(null);
    try {
      const res = await host.apiFetch(`/api/v1/recipes/${encodeURIComponent(r.id)}/apply`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as Parameters<typeof applyResult>[1];
      setResult({ id: r.id, ...applyResult(res.status, data) });
    } catch {
      setResult({ id: r.id, ok: false, msg: "Network error" });
    } finally {
      setApplying(null);
    }
  };

  if (recipes.length === 0) {
    return <div className="h-full flex items-center justify-center text-xs italic" style={{ color: "var(--muted-foreground)" }}>No recipes</div>;
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-2">
      {recipes.map((rec) => {
        const res = result?.id === rec.id ? result : null;
        return (
          <div key={rec.id} data-testid={`recipe-${rec.id}`} className="flex flex-col gap-1.5 p-2"
            style={{ border: "var(--line-width, 1px) solid var(--border)", borderRadius: "var(--radius)" }}>
            <div className="text-sm font-medium">{t(rec.name)}</div>
            {rec.description && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t(rec.description)}</div>}
            {showEntries && (
              <table className="w-full text-xs border-collapse" data-testid={`recipe-table-${rec.id}`}>
                <thead>
                  <tr style={{ color: "var(--muted-foreground)" }}>
                    <th className="text-left font-medium px-1 py-0.5 w-6">#</th>
                    <th className="text-left font-medium px-1 py-0.5">{t("Variable")}</th>
                    <th className="text-right font-medium px-1 py-0.5">{t("Recipe value")}</th>
                    <th className="text-right font-medium px-1 py-0.5">{t("Now")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.entries.map((e, i) => {
                    const st = live[e.binding];
                    const known = st !== undefined && st.quality !== "Unknown" && st.quality !== "Bad" && st.value !== null && st.value !== undefined;
                    const same = known && String(st.value) === String(e.value);
                    return (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-1 py-0.5 tabular-nums" style={{ color: "var(--muted-foreground)" }}>{i + 1}</td>
                        <td className="px-1 py-0.5 font-mono">{e.binding.replace(/^(ns|[^:]+):/, "") || "—"}</td>
                        <td className="px-1 py-0.5 text-right font-mono tabular-nums">{String(e.value)}</td>
                        <td className="px-1 py-0.5 text-right font-mono tabular-nums" style={{ color: same ? "#16a34a" : undefined }}>
                          {known ? String(st.value) : "—"}{same ? " ✓" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {res && (
              <div role="status" className="text-xs font-medium" style={{ color: res.ok ? "#16a34a" : "var(--alarm-critical)" }}>
                {res.ok ? "✓ " : "✗ "}{res.msg}
              </div>
            )}
            <button onClick={() => void apply(rec)} disabled={applying === rec.id}
              className="self-start px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{ minHeight: "var(--control-height, 2rem)", background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "var(--radius)" }}>
              {applying === rec.id ? t("Applying…") : t("Apply recipe")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
