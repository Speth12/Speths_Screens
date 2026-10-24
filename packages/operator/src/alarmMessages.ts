// Applies one /ws/alarms message to the alarm list. Messages are alarm
// events, merged by id, or {"resync": true}: the client fell behind, so it
// drops its list and the full current state follows.
import type { AlarmEvent } from "./alarmContext";

export function applyAlarmMessage(prev: AlarmEvent[], msg: unknown): AlarmEvent[] {
  if (!msg || typeof msg !== "object") return prev;
  if ((msg as { resync?: unknown }).resync === true) return [];
  const ev = msg as AlarmEvent;
  if (typeof ev.id !== "string") return prev;
  const idx = prev.findIndex((x) => x.id === ev.id);
  if (idx < 0) return [...prev, ev];
  const next = [...prev];
  next[idx] = ev;
  return next;
}
