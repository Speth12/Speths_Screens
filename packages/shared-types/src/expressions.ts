// Compiles every expression in a project, as internal/project/expressions.go
// does: the same problems, in the same order, with the same words.
import { compile } from "@speths-screens/expr";
import type { Drive, Project } from "./project";
import { scriptProblems, stateProblems } from "./scripts";

/** Every expression that does not compile, in a project that follows
 *  schema.json: calculated tags, alarm rules, then the driven properties of page,
 *  faceplate and preset widgets (by property name). A faceplate widget's
 *  expressions are templates, and may read only the faceplate's parameters. */
export function expressionProblems(p: Project): string[] {
  const out: string[] = [];
  for (const ds of p.datasources ?? []) {
    for (const t of ds.config?.tags ?? []) {
      const c = compile(t.expr);
      if (!c.ok) out.push(`datasource ${JSON.stringify(ds.id)}, calculated tag ${t.path}: ${c.error}`);
    }
  }
  for (const r of p.alarmRules ?? []) {
    const c = compile(r.expr);
    if (!c.ok) out.push(`alarm rule ${JSON.stringify(r.id)}: ${c.error}`);
  }
  out.push(...stateProblems(p), ...scriptProblems(p));
  const drives = (where: string, dynamics: Record<string, Drive> | undefined, params?: string[]) => {
    for (const name of Object.keys(dynamics ?? {}).sort()) {
      const problem = driveProblem(dynamics![name]!.expr, params);
      if (problem) out.push(`${where}: dynamics.${name}: ${problem}`);
    }
  };
  for (const pg of p.pages ?? []) {
    for (const w of pg.widgets ?? []) drives(`page ${JSON.stringify(pg.name)}, widget ${w.id} (${w.type})`, w.dynamics);
  }
  for (const fp of p.faceplates ?? []) {
    const params = (fp.params ?? []).map((prm) => prm.name);
    for (const w of fp.widgets ?? []) drives(`faceplate ${JSON.stringify(fp.name)}, widget ${w.localId} (${w.type})`, w.dynamics, params);
  }
  for (const ps of p.presets ?? []) {
    for (const w of ps.widgets ?? []) drives(`preset ${JSON.stringify(ps.name)}, widget ${w.id} (${w.type})`, w.dynamics);
  }
  return out;
}

// driveProblem compiles one driven property's expression; params is
// undefined outside a faceplate, and inside one the expression is a template.
function driveProblem(src: string, params?: string[]): string {
  const c = compile(src, { template: params !== undefined });
  if (!c.ok) return c.error;
  for (const name of c.expr.params) {
    if (!params!.includes(name)) return `{${name}} is not a parameter of this faceplate`;
  }
  return "";
}
