// The runtime's alarm events as the editor sees them: a live list that follows /ws/alarms while a
// screen that wants it is mounted, and the call that acknowledges one.
import { useEffect, useState } from "react";
import type { AlarmSeverity } from "./projectStore";
import { apiBase, wsOrigin } from "./runtimeTarget";
import { authHeader, getToken } from "./runtimeAuth";
import { applyAlarmMessage } from "./alarmMessages";

export type AlarmEvent = {
  id: string;
  ruleId: string;
  ruleName: string;
  binding: string;
  severity: AlarmSeverity;
  message: string;
  value: number;
  active: boolean;
  acked: boolean;
  /** The rule's expression (format 3 events). */
  expr?: string;
  /** Why the alarm cannot be evaluated right now, while an input is Bad. */
  reason?: string;
  triggeredAt: string;
  ackedAt?: string;
  normalAt?: string;
};

/** The events that need a person: active and not yet acknowledged. */
export const needsAttention = (e: AlarmEvent) => e.active && !e.acked;

/** Newest and most urgent first: unacknowledged active events, then the rest, each by time. */
export function byUrgency(events: readonly AlarmEvent[]): AlarmEvent[] {
  return [...events].sort((a, b) => {
    const urgent = Number(!needsAttention(a)) - Number(!needsAttention(b));
    return urgent || new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });
}

export async function ackAlarm(eventId: string): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase}/api/v1/alarms/${encodeURIComponent(eventId)}/ack`, { method: "POST", headers: authHeader(apiBase) });
    return r.ok;
  } catch {
    return false;
  }
}

/** The runtime's alarm events, kept current over the alarm WebSocket. Empty while no runtime answers. */
export function useAlarmFeed(): AlarmEvent[] {
  const [events, setEvents] = useState<AlarmEvent[]>([]);
  useEffect(() => {
    const wsBase = wsOrigin(apiBase);
    const token = getToken(apiBase); // needed with security.mode "login"
    const ws = new WebSocket(`${wsBase}/ws/alarms${token ? `?token=${encodeURIComponent(token)}` : ""}`);
    ws.onmessage = (e) => {
      try {
        const msg: unknown = JSON.parse(e.data);
        setEvents((prev) => applyAlarmMessage<AlarmEvent>(prev, msg));
      } catch { /* not a message we know */ }
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, []);
  return events;
}
