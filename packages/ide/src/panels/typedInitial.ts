import type { Type } from "@speths-screens/shared-types";

/** An initial value typed into a form, read as its type: undefined when
 *  blank or not of the type, so the value starts at false, 0 or empty text. */
export function typedInitial(type: Type, raw: string): boolean | number | string | undefined {
  const text = raw.trim();
  if (text === "") return undefined;
  if (type === "string") return raw;
  if (type === "bool") return text === "true" || text === "1" ? true : text === "false" || text === "0" ? false : undefined;
  const n = Number(text);
  if (Number.isNaN(n) || (type === "int" && !Number.isInteger(n))) return undefined;
  return n;
}
