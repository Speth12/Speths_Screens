// Format 4 to 5 (internal/project/upgrade_v5.go does the same).
type Obj = Record<string, unknown>;

/** Turns the theme from one id into the object format 5 has. Every format-4 project had the one
 *  theme, high-performance, which is the calm preset in light mode. A project with no theme
 *  keeps none: the runtime and the IDE then use the calm preset. */
export function v4ToV5(doc: Obj): void {
  if (typeof doc.theme === "string") doc.theme = { preset: "calm", mode: "light" };
}
