// The preview's session variables ({session:name}): the tag client and the
// IDE's writes answer session paths from here; nothing reaches the runtime.
import { SessionStore } from "@speths-screens/script-api";
import type { SessionVarSpec } from "@speths-screens/script-api";
import { useProject } from "./projectStore";

export const sessionStore = new SessionStore();

/** Keeps the store's variables in step with the open project. */
export function bindSessionVars(): () => void {
  let last: SessionVarSpec[] | undefined;
  const sync = () => {
    const vars = useProject.getState().project.sessionVars;
    if (vars === last) return;
    last = vars;
    sessionStore.define(vars ?? []);
  };
  sync();
  return useProject.subscribe(sync);
}
