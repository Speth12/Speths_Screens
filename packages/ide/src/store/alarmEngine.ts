/**
 * Client-side alarm evaluator.
 *
 * Watches project.alarmRules and subscribes to the tags each rule's
 * expression reads via tagStoreClient. Evaluates the expression on every
 * update, as the runtime's alarm engine does: while an input it needs is
 * Bad or missing, the alarm keeps its state and carries the reason.
 *
 * Exposed via subscribeClientAlarms / getClientAlarms for useSyncExternalStore,
 * and the useClientAlarms() convenience hook.
 */
import { useSyncExternalStore } from "react";
import { compile, type Input, type Value } from "@speths-screens/expr";
import { useProject, type AlarmRule } from "./projectStore";
import { tagStoreClient } from "./tagStoreClient";
import { eventBus } from "./eventBus";

export type ActiveAlarm = {
  ruleId:   string;
  name:     string;
  severity: string;
  message:  string;
  binding:  string;
  value:    number;
  since:    number;  // ms epoch
  /** Why the alarm cannot be evaluated right now, while an input is Bad. */
  reason?:  string;
};

// ── Internal state ─────────────────────────────────────────────────────────

let _alarms: ActiveAlarm[] = [];
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

// ── External store API (for useSyncExternalStore) ─────────────────────────

export const subscribeClientAlarms = (fn: () => void) => {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
};

export const getClientAlarms = () => _alarms;

// ── Engine ────────────────────────────────────────────────────────────────

// Map from ruleId → unsubscribe function for all of the rule's tags
const _unsubs = new Map<string, () => void>();

/** Truth as the expression language has it. */
const truthy = (v: Value) => v !== false && v !== 0 && v !== "";

function applyRules(rules: AlarmRule[]) {
  // Every rule is subscribed again, so an edited expression takes effect.
  for (const unsub of _unsubs.values()) unsub();
  _unsubs.clear();
  const ids = new Set(rules.map((r) => r.id));
  if (_alarms.some((a) => !ids.has(a.ruleId))) {
    _alarms = _alarms.filter((a) => ids.has(a.ruleId));
    notify();
  }

  for (const rule of rules) {
    const c = compile(rule.expr ?? "");
    if (!c.ok) continue; // validation reports it; the project cannot be deployed
    const expr = c.expr;
    const inputs = new Map<string, Input>();
    const binding = expr.refs[0] ?? "";

    const evaluate = () => {
      const r = expr.eval({ tag: (ref) => inputs.get(ref) });
      const existing = _alarms.find((a) => a.ruleId === rule.id);
      const first = inputs.get(binding)?.value;
      const value = typeof first === "number" ? first : typeof first === "boolean" ? Number(first) : 0;
      if (!r.ok) {
        // Unknown: the alarm keeps its state and says why.
        if (existing && existing.reason !== r.reason) {
          _alarms = _alarms.map((a) => (a.ruleId === rule.id ? { ...a, reason: r.reason } : a));
          notify();
        }
        return;
      }
      const triggered = truthy(r.value);
      if (triggered && !existing) {
        const newAlarm: ActiveAlarm = {
          ruleId:   rule.id,
          name:     rule.name,
          severity: rule.severity,
          message:  rule.message || `${rule.name}: ${rule.expr}`,
          binding,
          value,
          since:    Date.now(),
        };
        _alarms = [..._alarms, newAlarm];
        eventBus.emit("alarm:triggered", { ruleId: rule.id, name: rule.name, severity: rule.severity, message: newAlarm.message });
        notify();
      } else if (!triggered && existing) {
        _alarms = _alarms.filter((a) => a.ruleId !== rule.id);
        eventBus.emit("alarm:cleared", { ruleId: rule.id, name: rule.name });
        notify();
      } else if (triggered && existing && (existing.value !== value || existing.reason)) {
        // Live value, and the input is back.
        _alarms = _alarms.map((a) => (a.ruleId === rule.id ? { ...a, value, reason: undefined } : a));
        notify();
      }
    };

    const unsubs = expr.refs.map((ref) => tagStoreClient.subscribe(ref, (state) => {
      inputs.set(ref, { value: state.value, quality: state.quality });
      evaluate();
    }));
    _unsubs.set(rule.id, () => unsubs.forEach((u) => u()));
  }
}

// Watch the project store — re-evaluate whenever alarmRules change.
let _lastRules: AlarmRule[] | undefined;
useProject.subscribe((state) => {
  const rules = state.project.alarmRules ?? [];
  if (rules === _lastRules) return;
  _lastRules = rules;
  applyRules(rules);
});

// Boot with current rules.
_lastRules = useProject.getState().project.alarmRules ?? [];
applyRules(_lastRules);

// ── React hook ────────────────────────────────────────────────────────────

export function useClientAlarms(): ActiveAlarm[] {
  return useSyncExternalStore(subscribeClientAlarms, getClientAlarms);
}
