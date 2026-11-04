// The format 4 checks (Phase 4): memory tags, session variables and runtime
// scripts, as internal/project/scripts.go does, with the same lines, except
// for syntax errors, whose wording comes from each side's parser (goja there,
// acorn here; the line and column agree).
import { parse } from "acorn";
import type { Project, Type } from "./project";

/** A text, number or flag value (schema TransformValue). */
type TransformValue = string | number | boolean;

const SESSION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Memory tags and session variables: unique names, initial values of their type. */
/** Starts the tag path of a session variable, {session:name}. Only screens
 *  hold session variables, so "session" is not a datasource id. */
export const SESSION_PREFIX = "session:";

export function stateProblems(p: Project): string[] {
  const out: string[] = [];
  for (const ds of p.datasources ?? []) {
    if (`${ds.id}:` === SESSION_PREFIX) out.push(`datasource ${JSON.stringify(ds.id)}: the id is kept for session variables`);
    const seen = new Set<string>();
    for (const t of ds.config?.memoryTags ?? []) {
      const where = `datasource ${JSON.stringify(ds.id)}, memory tag ${t.path}`;
      if (seen.has(t.path)) out.push(`${where}: the path is used twice`);
      seen.add(t.path);
      const problem = typeProblem(t.type, t.initial);
      if (problem) out.push(`${where}: ${problem}`);
    }
  }
  const seen = new Set<string>();
  for (const v of p.sessionVars ?? []) {
    const where = `session variable ${JSON.stringify(v.name)}`;
    if (!SESSION_NAME.test(v.name)) out.push(`${where}: a name is letters, digits and _, not starting with a digit`);
    else if (seen.has(v.name)) out.push(`${where}: the name is used twice`);
    seen.add(v.name);
    const problem = typeProblem(v.type, v.initial);
    if (problem) out.push(`${where}: ${problem}`);
  }
  return out;
}

/** Why an initial value is not of type t, or "". */
function typeProblem(t: Type, initial: TransformValue | undefined): string {
  if (initial === undefined) return "";
  const ok = t === "bool" ? typeof initial === "boolean"
    : t === "int" ? typeof initial === "number" && Number.isInteger(initial)
    : t === "real" ? typeof initial === "number"
    : typeof initial === "string";
  return ok ? "" : `initial ${typeof initial === "string" ? JSON.stringify(initial) : String(initial)} is not of type ${t}`;
}

/** Runtime scripts: unique ids, triggers naming known datasources and alarm
 *  rules, and source that parses. */
export function scriptProblems(p: Project): string[] {
  const out: string[] = [];
  const datasources = new Set(["ns", ...(p.datasources ?? []).map((d) => d.id)]);
  const rules = new Set((p.alarmRules ?? []).map((r) => r.id));
  const seen = new Set<string>();
  for (const s of p.scripts ?? []) {
    const where = `script ${JSON.stringify(s.id)}`;
    if (seen.has(s.id)) out.push(`${where}: the id is used twice`);
    seen.add(s.id);
    for (const path of s.trigger.onChange ?? []) {
      const k = path.indexOf(":");
      if (k < 0 || !datasources.has(path.slice(0, k))) out.push(`${where}: onChange: ${path} names no datasource`);
    }
    for (const id of s.trigger.onAlarm ?? []) {
      if (!rules.has(id)) out.push(`${where}: onAlarm: no alarm rule ${JSON.stringify(id)}`);
    }
    out.push(...writeListProblems(where, s.writes, datasources));
    const problem = syntaxProblem(s.source);
    if (problem) out.push(`${where}: ${problem}`);
  }
  return out;
}

/** A script's writes list. An entry is a tag path "datasource:path" (or "ns:path"), or a
 *  prefix of one with a * as its last character ("mem:*", "ns:Line1/*"). Per entry, in this
 *  order: empty, listed twice, names no datasource, a * that is not last. */
export function writeListProblems(where: string, writes: string[] | undefined, datasources: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of writes ?? []) {
    if (w === "") {
      out.push(`${where}: writes: an entry is empty`);
      continue;
    }
    if (seen.has(w)) {
      out.push(`${where}: writes: ${w} is listed twice`);
      continue;
    }
    seen.add(w);
    const k = w.indexOf(":");
    if (k < 0 || !datasources.has(w.slice(0, k))) out.push(`${where}: writes: ${w} names no datasource`);
    else if ((w.endsWith("*") ? w.slice(0, -1) : w).includes("*")) out.push(`${where}: writes: ${w}: * is only allowed as the last character`);
  }
  return out;
}

/** Parses a runtime script as it runs, inside an async function (so
 *  top-level await and return work), and says where it fails:
 *  "line 1, column 7: Unexpected token". "" when it parses. */
export function syntaxProblem(source: string): string {
  try {
    parse(source, { ecmaVersion: "latest", sourceType: "script", allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
    return "";
  } catch (err) {
    const e = err as SyntaxError & { loc?: { line: number; column: number } };
    const text = e.message.replace(/ \(\d+:\d+\)$/, "");
    return e.loc ? `line ${e.loc.line}, column ${e.loc.column + 1}: ${text}` : text;
  }
}
