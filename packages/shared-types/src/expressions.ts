// Compiles every expression in a project, as internal/project/expressions.go
// does: the same problems, in the same order, with the same words.
import { compile } from "@speths-screens/expr";
import type { Drive, Project } from "./project";
import { scriptProblems, stateProblems, SESSION_PREFIX } from "./scripts";
import { customWidgetProblems } from "./customWidgets";

/** Every expression that does not compile, in a project that follows
 *  schema.json: calculated tags, alarm rules, then the driven properties of page,
 *  custom widget and preset widgets (by property name). A custom widget part's
 *  expressions are templates, and may read only the custom widget's parameters. */
export function expressionProblems(p: Project): string[] {
  const out: string[] = [];
  for (const ds of p.datasources ?? []) {
    for (const t of ds.config?.tags ?? []) {
      const problem = runtimeExprProblem(t.expr);
      if (problem) out.push(`datasource ${JSON.stringify(ds.id)}, calculated tag ${t.path}: ${problem}`);
    }
  }
  for (const r of p.alarmRules ?? []) {
    const problem = runtimeExprProblem(r.expr);
    if (problem) out.push(`alarm rule ${JSON.stringify(r.id)}: ${problem}`);
  }
  out.push(...stateProblems(p), ...scriptProblems(p), ...customWidgetProblems(p));
  const session = new Set((p.sessionVars ?? []).map((v) => v.name));
  const drives = (where: string, dynamics: Record<string, Drive> | undefined, params?: string[]) => {
    for (const name of Object.keys(dynamics ?? {}).sort()) {
      const problem = driveProblem(dynamics![name]!.expr, session, params);
      if (problem) out.push(`${where}: dynamics.${name}: ${problem}`);
    }
  };
  for (const pg of p.pages ?? []) {
    for (const w of pg.widgets ?? []) drives(`page ${JSON.stringify(pg.name)}, widget ${w.id} (${w.type})`, w.dynamics);
  }
  for (const fp of p.customWidgets ?? []) {
    const params = (fp.params ?? []).map((prm) => prm.name);
    for (const w of fp.widgets ?? []) drives(`custom widget ${JSON.stringify(fp.name)}, widget ${w.localId} (${w.type})`, w.dynamics, params);
  }
  for (const ps of p.presets ?? []) {
    for (const w of ps.widgets ?? []) drives(`preset ${JSON.stringify(ps.name)}, widget ${w.id} (${w.type})`, w.dynamics);
  }
  return out;
}

// driveProblem compiles one driven property's expression; params is
// undefined outside a custom widget, and inside one the expression is a template.
function driveProblem(src: string, session: Set<string>, params?: string[]): string {
  const c = compile(src, { template: params !== undefined });
  if (!c.ok) return c.error;
  for (const ref of c.expr.refs) {
    if (ref.startsWith(SESSION_PREFIX) && !session.has(ref.slice(SESSION_PREFIX.length))) return `{${ref}} names no session variable`;
  }
  for (const name of c.expr.params) {
    if (!params!.includes(name)) return `{${name}} is not a parameter of this custom widget`;
  }
  return "";
}

/** Compiles an expression the runtime evaluates (a calculated tag or an
 *  alarm rule), which cannot read session variables. */
function runtimeExprProblem(src: string): string {
  const c = compile(src);
  if (!c.ok) return c.error;
  const ref = c.expr.refs.find((r) => r.startsWith(SESSION_PREFIX));
  return ref ? `{${ref}} is a session variable, which only screens have` : "";
}
