// Applies one /ws/alarms message to an alarm list. Messages are alarm
// events, merged by id, or {"resync": true}: the client fell behind, so it
// drops its list and the full current state follows. (Same rule as the
// operator app's alarmMessages.ts.)
export function applyAlarmMessage<T extends { id: string }>(prev: T[], msg: unknown): T[] {
  if (!msg || typeof msg !== "object") return prev;
  if ((msg as { resync?: unknown }).resync === true) return [];
  const ev = msg as T;
  if (typeof ev.id !== "string") return prev;
  const idx = prev.findIndex((x) => x.id === ev.id);
  if (idx < 0) return [...prev, ev];
  const next = [...prev];
  next[idx] = ev;
  return next;
}
