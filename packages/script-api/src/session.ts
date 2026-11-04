// Session variables (Phase 4, decision 7): typed values kept per browser
// tab, read as {session:name} in expressions and readTag("session:name") in
// page scripts, written like a tag. They never reach the runtime and are gone
// when the tab closes. Types follow the memory datasource: a whole number
// fits an int, 0 and 1 fit a bool, a flag is never a number.

import type { WriteResult } from "./protocol";

export type VarType = "bool" | "int" | "real" | "string";
export interface SessionVarSpec {
  name: string;
  type: VarType;
  initial?: unknown;
}
export interface SessionState {
  value: unknown;
  quality: "Good" | "Bad";
  ts: number;
  reason?: string;
}

export const SESSION_PREFIX = "session:";

/** The variable name of a session path, or undefined for any other path. */
export function sessionName(path: string): string | undefined {
  return path.startsWith(SESSION_PREFIX) ? path.slice(SESSION_PREFIX.length) : undefined;
}

/** Reads v as type t, or says why it does not fit. */
export function convertTyped(t: VarType, v: unknown): { value: unknown } | { reason: string } {
  const describe = typeof v === "string" ? `the text ${JSON.stringify(v)}` : typeof v === "boolean" ? `the flag ${v}` : v == null ? "nothing" : String(v);
  const isNum = typeof v === "number" && Number.isFinite(v);
  switch (t) {
    case "bool":
      if (typeof v === "boolean") return { value: v };
      if (isNum && (v === 0 || v === 1)) return { value: v === 1 };
      return { reason: `is a bool, not ${describe}` };
    case "int":
      if (isNum && Number.isInteger(v)) return { value: v };
      return { reason: `is an int, not ${describe}` };
    case "real":
      if (isNum) return { value: v };
      return { reason: `is a real, not ${describe}` };
    case "string":
      if (typeof v === "string") return { value: v };
      return { reason: `is a string, not ${describe}` };
  }
}

const ZERO: Record<VarType, unknown> = { bool: false, int: 0, real: 0, string: "" };

type Listener = (s: SessionState) => void;

export class SessionStore {
  private specs = new Map<string, SessionVarSpec>();
  private states = new Map<string, SessionState>();
  private listeners = new Map<string, Set<Listener>>();

  /** Sets the project's variables. One that keeps its name and type keeps
   *  its value; a new one starts at its initial value (else false, 0 or
   *  empty text); one no longer declared reads Bad. */
  define(vars: SessionVarSpec[]): void {
    const old = this.specs;
    this.specs = new Map(vars.map((v) => [v.name, v]));
    for (const v of vars) {
      const prev = old.get(v.name);
      if (prev && prev.type === v.type && this.states.has(v.name)) continue;
      const init = v.initial === undefined ? undefined : convertTyped(v.type, v.initial);
      this.put(v.name, init && "value" in init ? init.value : ZERO[v.type]);
    }
    for (const name of old.keys()) {
      if (!this.specs.has(name)) this.publish(name, { value: null, quality: "Bad", ts: Date.now() * 1e6, reason: `no session variable ${name}` });
    }
  }

  get(name: string): SessionState {
    return this.states.get(name) ?? { value: null, quality: "Bad", ts: Date.now() * 1e6, reason: `no session variable ${name}` };
  }

  /** Sets a variable after checking its type. */
  set(name: string, value: unknown): WriteResult {
    const spec = this.specs.get(name);
    if (!spec) return { status: "failed", reason: `no session variable ${name}` };
    const c = convertTyped(spec.type, value);
    if ("reason" in c) return { status: "failed", reason: `session variable ${name} ${c.reason}` };
    this.put(name, c.value);
    return { status: "confirmed" };
  }

  /** Calls fn now and on each change; returns the way to stop. */
  subscribe(name: string, fn: Listener): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(name, set);
    fn(this.get(name));
    return () => set.delete(fn);
  }

  private put(name: string, value: unknown) {
    this.publish(name, { value, quality: "Good", ts: Date.now() * 1e6 });
  }

  private publish(name: string, s: SessionState) {
    if (s.quality === "Good") this.states.set(name, s);
    else this.states.delete(name);
    this.listeners.get(name)?.forEach((fn) => fn(s));
  }
}
