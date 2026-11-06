// The Speth's Screens expression language: a small, side-effect-free
// subset of JavaScript syntax used by driven properties, calculated tags
// and alarm conditions. An expression is parsed once by compile and
// evaluated on each tag update; nothing is handed to eval.
//
// internal/expr is the Go twin. Both are held to the golden cases in
// testdata/expr, so the IDE, the operator screen and the runtime give the
// same result for the same expression.
//
// Tags are written in braces ({ns:Tank1/Level}, {opcua:ns=6;s=X}); value is
// the widget's own tag. A result is a number, boolean or string, or unknown
// with a reason: a Bad or missing input, division by zero, or a type
// mismatch. && || and ?: evaluate only the side they need, so
// good({x}) && {x} > 5 is false, not unknown, while {x} is Bad.
import { Unknown, type Env, type Node, type Value } from "./nodes";
import { CompileError, parse } from "./parse";

export type { Env, Input, Value } from "./nodes";
export { MAX_DEPTH, MAX_LENGTH } from "./parse";

/** An evaluation result: a value, or unknown with the reason. */
export type Result = { ok: true; value: Value } | { ok: false; reason: string };

/** A compiled expression. */
export class Expr {
  /** @internal */
  constructor(
    private readonly root: Node,
    /** The tags the expression reads, in order of first use, as written between the braces. */
    readonly refs: readonly string[],
    /** Whether the expression reads value. */
    readonly usesValue: boolean,
    /** The custom widget parameters ({name}) a template reads, in order of first use. */
    readonly params: readonly string[] = [],
  ) {}

  eval(env: Env): Result {
    const v = this.root.eval(env);
    return v instanceof Unknown ? { ok: false, reason: v.reason } : { ok: true, value: v };
  }
}

/** Parses src. The error reads like `unexpected ")" at column 6`. With
 *  template, the expression is inside a custom widget and {name} (a name, no
 *  colon) is one of its parameters, which the custom widget fills in with tag
 *  paths before evaluating; evaluated as it is, a parameter has no value. */
export function compile(src: string, opts: { template?: boolean } = {}): { ok: true; expr: Expr } | { ok: false; error: string } {
  try {
    const p = parse(src, opts.template ?? false);
    return { ok: true, expr: new Expr(p.root, p.refs, p.usesValue, p.params) };
  } catch (err) {
    if (err instanceof CompileError) return { ok: false, error: err.message };
    throw err;
  }
}
