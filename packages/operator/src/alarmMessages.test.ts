import { describe, expect, it } from "vitest";
import type { AlarmEvent } from "./alarmContext";
import { applyAlarmMessage } from "./alarmMessages";

const ev = (id: string, active: boolean) => ({ id, active, acked: false, severity: "warning" }) as unknown as AlarmEvent;

describe("applyAlarmMessage", () => {
  it("adds a new event", () => {
    expect(applyAlarmMessage([], ev("a", true))).toEqual([ev("a", true)]);
  });

  it("replaces an event with the same id", () => {
    expect(applyAlarmMessage([ev("a", true), ev("b", true)], ev("a", false))).toEqual([ev("a", false), ev("b", true)]);
  });

  it("resync drops the list; the snapshot that follows rebuilds it", () => {
    let list = [ev("a", true), ev("gone", true)];
    for (const msg of [{ resync: true }, ev("a", false), ev("b", true)]) list = applyAlarmMessage(list, msg);
    expect(list).toEqual([ev("a", false), ev("b", true)]);
  });

  it.each([[null], ["text"], [{ nothing: 1 }]])("ignores %j", (msg) => {
    const list = [ev("a", true)];
    expect(applyAlarmMessage(list, msg)).toBe(list);
  });
});
