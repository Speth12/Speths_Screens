/**
 * Client-side alarm evaluator.
 *
 * Watches project.alarmRules and subscribes to each rule's tag via
 * tagStoreClient. Evaluates conditions on every tag update and maintains
 * a list of client-side ActiveAlarm objects.
 *
 * Exposed via subscribeClientAlarms / getClientAlarms for useSyncExternalStore,
 * and the useClientAlarms() convenience hook.
 */
import { useSyncExternalStore } from "react";
import { useProject, type AlarmRule, type AlarmCondition } from "./projectStore";
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

// ── Condition evaluation ──────────────────────────────────────────────────

function evaluate(condition: AlarmCondition, value: number, threshold: number): boolean {
  switch (condition) {
    case "gt":  return value >  threshold;
    case "gte": return value >= threshold;
    case "lt":  return value <  threshold;
    case "lte": return value <= threshold;
    case "eq":  return value === threshold;
    case "ne":  return value !== threshold;
    default:    return false;
  }
}

// ── Engine ────────────────────────────────────────────────────────────────

// Map from ruleId → tag unsubscribe function
const _unsubs = new Map<string, () => void>();

function applyRules(rules: AlarmRule[]) {
  const ruleIds = new Set(rules.map((r) => r.id));

  // Unsubscribe stale rules
  for (const [id, unsub] of _unsubs) {
    if (!ruleIds.has(id)) {
      unsub();
      _unsubs.delete(id);
    }
  }

  // Subscribe new/changed rules
  for (const rule of rules) {
    if (!rule.binding) continue;

    // Re-subscribe if the binding changed
    const existing = _unsubs.get(rule.id);
    // We always unsub + resub to pick up binding changes
    existing?.();

    const binding = rule.binding;

    const unsub = tagStoreClient.subscribe(binding, (state) => {
      const numVal = typeof state.value === "number"
        ? state.value
        : typeof state.value === "string"
        ? parseFloat(state.value)
        : NaN;

      if (isNaN(numVal)) return;

      const triggered = evaluate(rule.condition, numVal, rule.threshold);
      const existing  = _alarms.find((a) => a.ruleId === rule.id);

      if (triggered && !existing) {
        const newAlarm: ActiveAlarm = {
          ruleId:   rule.id,
          name:     rule.name,
          severity: rule.severity,
          message:  rule.message || `${rule.name}: ${numVal} ${rule.condition} ${rule.threshold}`,
          binding,
          value:    numVal,
          since:    Date.now(),
        };
        _alarms = [..._alarms, newAlarm];
        eventBus.emit("alarm:triggered", { ruleId: rule.id, name: rule.name, severity: rule.severity, message: newAlarm.message });
        notify();
      } else if (!triggered && existing) {
        _alarms = _alarms.filter((a) => a.ruleId !== rule.id);
        eventBus.emit("alarm:cleared", { ruleId: rule.id, name: rule.name });
        notify();
      } else if (triggered && existing && existing.value !== numVal) {
        // Update live value
        _alarms = _alarms.map((a) => a.ruleId === rule.id ? { ...a, value: numVal } : a);
        notify();
      }
    });

    _unsubs.set(rule.id, unsub);
  }
}

// Watch the project store — re-evaluate whenever alarmRules change.
useProject.subscribe((state) => {
  applyRules(state.project.alarmRules ?? []);
});

// Boot with current rules.
applyRules(useProject.getState().project.alarmRules ?? []);

// ── React hook ────────────────────────────────────────────────────────────

export function useClientAlarms(): ActiveAlarm[] {
  return useSyncExternalStore(subscribeClientAlarms, getClientAlarms);
}
