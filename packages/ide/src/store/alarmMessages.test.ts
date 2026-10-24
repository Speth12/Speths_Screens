import { describe, expect, it } from "vitest";
import { applyAlarmMessage } from "./alarmMessages";

type Ev = { id: string; active: boolean };
const ev = (id: string, active: boolean): Ev => ({ id, active });

describe("applyAlarmMessage", () => {
  it("merges events by id", () => {
    let list: Ev[] = [];
    for (const msg of [ev("a", true), ev("b", true), ev("a", false)]) list = applyAlarmMessage(list, msg);
    expect(list).toEqual([ev("a", false), ev("b", true)]);
  });

  it("resync drops the list; the snapshot that follows rebuilds it", () => {
    let list = [ev("a", true), ev("gone", true)];
    for (const msg of [{ resync: true }, ev("a", false)]) list = applyAlarmMessage(list, msg);
    expect(list).toEqual([ev("a", false)]);
  });

  it("ignores messages that are not alarm events", () => {
    const list = [ev("a", true)];
    expect(applyAlarmMessage(list, { nothing: 1 })).toBe(list);
  });
});
