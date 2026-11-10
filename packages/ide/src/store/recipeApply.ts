// Applying a recipe on the runtime, and reading the value a person types for one of its writes.
import { apiFetch } from "./runtimeAuth";

/** Apply a deployed recipe on the active runtime. Never throws. */
export async function applyOnRuntime(id: string): Promise<{ errors: string[]; applied: number }> {
  try {
    const r = await apiFetch(`/api/v1/recipes/${encodeURIComponent(id)}/apply`, { method: "POST" });
    const body = (await r.json().catch(() => ({}))) as { applied?: number; errors?: string[] };
    const applied = body.applied ?? 0;
    if (r.status === 200) return { errors: [], applied };
    if (r.status === 207) return { errors: body.errors ?? [], applied };
    if (r.status === 404) return { errors: ["the runtime doesn't have this recipe; deploy the project first"], applied: 0 };
    if (r.status === 401 || r.status === 403) return { errors: ["not allowed: log in as a user who can apply recipes"], applied: 0 };
    return { errors: [`HTTP ${r.status}`], applied: 0 };
  } catch (e) {
    return { errors: [(e as Error).message], applied: 0 };
  }
}

/** The value a recipe writes, from what was typed: a number when the whole text is one ("12abc" is text), otherwise
 *  the text as it is. */
export function parseEntryValue(raw: string): number | string {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) ? n : raw;
}

/** A recipe value as the field shows it. */
export const entryValueText = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
