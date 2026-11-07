// The IDE draws itself with the operator's look: the calm preset, light or dark, from the same
// tokens the screens use. The choice is the editor's own and is kept in this browser; the project's
// theme applies only inside the screen being designed.
import { applyTheme, resolveTheme } from "@speths-screens/widgets";
import { readStored } from "./storage";

export type IdeMode = "light" | "dark";
const KEY = "speths-screens-ide-mode";

export function storedIdeMode(): IdeMode {
  const v = readStored(KEY);
  return v === "dark" ? "dark" : "light";
}

export function setIdeMode(mode: IdeMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* the choice just is not kept */ }
  applyIdeTheme(mode);
}

export function applyIdeTheme(mode: IdeMode = storedIdeMode()): void {
  applyTheme(resolveTheme({ preset: "calm", mode }));
}
