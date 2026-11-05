// Made-up tag values, for designing a screen with no PLC connected. Each path gets its own steady
// wave between 0 and 100, so gauges, bars and trends move and a bool widget flips now and then.
// The values depend only on the path and the time: the same tag shows the same value everywhere.
import type { TagState } from "./tagStoreClient";

function hash(path: string): number {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** The made-up value of a tag at a moment, from 0 to 100. */
export function dummyValue(path: string, nowMs: number): number {
  const h = hash(path);
  const periodMs = 12000 + h * 18000;
  const phase = h * Math.PI * 2;
  return Math.round((50 + 45 * Math.sin((nowMs / periodMs) * Math.PI * 2 + phase)) * 100) / 100;
}

/** A made-up tag state: a good number. */
export function dummyState(path: string, nowMs: number): TagState {
  return { value: dummyValue(path, nowMs), quality: "Good", ts: nowMs };
}
