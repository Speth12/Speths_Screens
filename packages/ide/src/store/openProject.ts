// The one way a project from outside the IDE (a file, an import, a runtime,
// the autosave) gets in: upgraded to the current format, then checked.
import { UpgradeError, upgradeProject } from "@speths-screens/shared-types/upgrade";
import type { Project } from "./projectStore";
import { expressionProblems } from "@speths-screens/shared-types/expressions";
import { schemaProblems } from "./validateProject";

export type Opened =
  | { ok: true; project: Project; notes: string[]; problems: string[] }
  | { ok: false; problems: string[] };

/** Upgrades and checks a parsed project. Never throws. A project that does
 *  not follow schema.json is refused; one whose expressions do not compile
 *  opens, with those problems listed, so they can be fixed (it cannot be
 *  deployed until they are). */
export function openProject(raw: unknown): Opened {
  let upgraded: { project: unknown; notes: string[] };
  try {
    upgraded = upgradeProject(raw);
  } catch (e) {
    return { ok: false, problems: [e instanceof UpgradeError ? e.message : `cannot read the project: ${(e as Error).message}`] };
  }
  const problems = schemaProblems(upgraded.project);
  if (problems.length) return { ok: false, problems };
  const project = upgraded.project as Project;
  return { ok: true, project, notes: upgraded.notes, problems: expressionProblems(project) };
}

/** A one-line summary of an open, for the IDE's status messages. */
export function openSummary(name: string, o: Opened): string {
  if (!o.ok) return `could not open ${name}: ${o.problems.join("; ")}`;
  let s = o.notes.length ? `opened ${name}, upgraded (${o.notes.length} note${o.notes.length === 1 ? "" : "s"}: ${o.notes.join("; ")})` : `opened ${name}`;
  if (o.problems.length) s += `; fix before deploying: ${o.problems.join("; ")}`;
  return s;
}
