// The operator polls GET /api/v1/project every 5 s. A poll that finds the
// same project must change nothing: a new project object re-renders the whole
// screen, gives every callback built from it a new identity and redefines the
// session variables, for no reason.
import type { Project } from "@speths-screens/shared-types";

export type ProjectPoll =
  | { kind: "changed"; project: Project }
  | { kind: "same" }
  | { kind: "none" }; // no project deployed (an answer without pages)

export interface ProjectSync {
  /** Takes the body of a project poll. */
  accept(text: string): ProjectPoll;
  /** Forgets the last project, so the next poll counts as a change (after a login or a missing project). */
  reset(): void;
}

export function createProjectSync(): ProjectSync {
  let last: string | null = null;
  return {
    accept(text) {
      if (text === last) return { kind: "same" };
      const p = JSON.parse(text) as Project | null;
      if (!p || !p.pages) {
        last = null;
        return { kind: "none" };
      }
      last = text;
      return { kind: "changed", project: p };
    },
    reset() {
      last = null;
    },
  };
}
