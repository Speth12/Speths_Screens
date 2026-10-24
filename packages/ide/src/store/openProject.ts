// The one way a project from outside the IDE (a file, an import, a runtime,
// the autosave) gets in: upgraded to the current format, then checked.
import { UpgradeError, upgradeProject } from "@speths-screens/shared-types/upgrade";
import type { Project } from "./projectStore";
import { validateProject } from "./validateProject";

export type Opened =
  | { ok: true; project: Project; notes: string[] }
  | { ok: false; problems: string[] };

/** Upgrades and checks a parsed project. Never throws. */
export function openProject(raw: unknown): Opened {
  let upgraded: { project: unknown; notes: string[] };
  try {
    upgraded = upgradeProject(raw);
  } catch (e) {
    return { ok: false, problems: [e instanceof UpgradeError ? e.message : `cannot read the project: ${(e as Error).message}`] };
  }
  const problems = validateProject(upgraded.project);
  if (problems.length) return { ok: false, problems };
  return { ok: true, project: upgraded.project as Project, notes: upgraded.notes };
}

/** A one-line summary of an open, for the IDE's status messages. */
export function openSummary(name: string, o: Opened): string {
  if (!o.ok) return `could not open ${name}: ${o.problems[0]}${o.problems.length > 1 ? ` (and ${o.problems.length - 1} more)` : ""}`;
  return o.notes.length ? `opened ${name}, upgraded (${o.notes.length} change${o.notes.length === 1 ? "" : "s"}: ${o.notes.join("; ")})` : `opened ${name}`;
}
