// What the Scripts tab edits, apart from the screen so it can be tested: a script's triggers and its
// writes list as the form shows them, a one-line summary of when a script runs, and the state of each
// script on the runtime.
import { useEffect, useState } from "react";
import type { RuntimeScript, ScriptTrigger } from "@speths-screens/shared-types";
import { apiFetch } from "./runtimeAuth";

/** One script's state on the runtime, from GET /api/v1/scripts. */
export interface ScriptStatus {
  id: string;
  state: "running" | "stopped";
  reason?: string;
  runs: number;
  lastError?: string;
  interrupts: number;
  dropped: number;
}

/** The triggers as the form edits them. */
export function triggerText(t: ScriptTrigger): { every: string; onChange: string } {
  return { every: t.every ? String(t.every) : "", onChange: (t.onChange ?? []).join(", ") };
}

/** A script's writes list as the form edits it: entries separated by commas. */
export function writesText(s: RuntimeScript): string {
  return (s.writes ?? []).join(", ");
}

/** The writes list from the form's text: entries split on commas, empty ones left out;
 *  undefined when there are none (a script without the list writes nothing). */
export function withWrites(text: string): string[] | undefined {
  const list = text.split(",").map((w) => w.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

/** Applies a form change to a trigger, leaving out empty parts. */
export function withTrigger(t: ScriptTrigger, patch: { every?: string; onChange?: string; onStart?: boolean; onAlarm?: string[] }): ScriptTrigger {
  const next: ScriptTrigger = { ...t };
  if (patch.every !== undefined) {
    const n = Number(patch.every);
    if (patch.every.trim() === "" || !Number.isFinite(n)) delete next.every;
    else next.every = Math.round(n);
  }
  if (patch.onChange !== undefined) {
    const paths = patch.onChange.split(",").map((p) => p.trim()).filter(Boolean);
    if (paths.length) next.onChange = paths;
    else delete next.onChange;
  }
  if (patch.onStart !== undefined) {
    if (patch.onStart) next.onStart = true;
    else delete next.onStart;
  }
  if (patch.onAlarm !== undefined) {
    if (patch.onAlarm.length) next.onAlarm = patch.onAlarm;
    else delete next.onAlarm;
  }
  return next;
}

/** When a script runs, in a few words: "every 1 s · on start · on change (2)". */
export function triggerSummary(t: ScriptTrigger): string {
  const parts: string[] = [];
  if (t.every) parts.push(t.every % 1000 === 0 ? `every ${t.every / 1000} s` : `every ${t.every} ms`);
  if (t.onStart) parts.push("on start");
  if (t.onChange?.length) parts.push(`on change (${t.onChange.length})`);
  if (t.onAlarm?.length) parts.push(`on alarm (${t.onAlarm.length})`);
  return parts.join(" · ") || "no trigger";
}

/** A script with no way to start: it would never run. */
export const hasNoTrigger = (t: ScriptTrigger): boolean => !t.every && !t.onStart && !t.onChange?.length && !t.onAlarm?.length;

/** The scripts' states on the runtime, polled while a screen that shows them is mounted. */
export function useScriptStatus(): Map<string, ScriptStatus> {
  const [status, setStatus] = useState(new Map<string, ScriptStatus>());
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await apiFetch("/api/v1/scripts");
        if (res.ok && !stop) {
          const list = (await res.json()) as ScriptStatus[];
          setStatus(new Map(list.map((s) => [s.id, s])));
        }
      } catch {
        // No runtime reachable: no status to show.
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return status;
}
