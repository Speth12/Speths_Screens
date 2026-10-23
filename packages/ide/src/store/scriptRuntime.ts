// Page script execution engine.
// Each page may have a script string that runs when the page becomes active.
// The script receives a sandboxed API object; all timers and tag subscriptions
// are automatically cleaned up when the page is exited.

import { useProject } from "./projectStore";
import { tagStoreClient } from "./tagStoreClient";
import { virtualTagStore } from "./virtualTagStore";
import { eventBus } from "./eventBus";

export type ScriptCleanup = () => void;

function isVirtual(binding: string) {
  return virtualTagStore.isVirtual(binding);
}

export function runPageScript(script: string): ScriptCleanup {
  const timers: ReturnType<typeof setInterval>[] = [];
  const unsubs: (() => void)[] = [];

  const api = {
    /** Navigate to a page by name or id. */
    navigate(nameOrId: string) {
      const { project, setActivePage } = useProject.getState();
      const page = project.pages.find(
        (p) => p.id === nameOrId || p.name === nameOrId,
      );
      if (page) setActivePage(page.id);
      else console.warn(`[Script] navigate: page not found: "${nameOrId}"`);
    },

    /** Read the current value of any tag (virtual or live). */
    readTag(binding: string): unknown {
      return tagStoreClient.get(binding)?.value ?? null;
    },

    /** Write a value to any tag (virtual or live WS write). */
    writeTag(binding: string, value: unknown) {
      tagStoreClient.write(binding, value);
    },

    /** Run fn every ms milliseconds. Auto-cleared on page exit. */
    onTimer(ms: number, fn: () => void) {
      const id = setInterval(fn, ms);
      timers.push(id);
    },

    /** Run fn once after ms milliseconds. Auto-cleared on page exit. */
    afterDelay(ms: number, fn: () => void) {
      const id = setTimeout(fn, ms);
      timers.push(id as unknown as ReturnType<typeof setInterval>);
    },

    /** Subscribe to tag changes. Auto-unsubscribed on page exit. */
    onTagChange(binding: string, fn: (value: unknown) => void) {
      const store = isVirtual(binding) ? virtualTagStore : tagStoreClient;
      unsubs.push(store.subscribe(binding, (s) => fn(s.value)));
    },

    /** Print to browser console with [Script] prefix. */
    log(...args: unknown[]) {
      console.log("[Script]", ...args);
    },

    /** Emit a custom event on the event bus. */
    emit(type: string, payload?: unknown) {
      eventBus.emit(type, payload);
    },

    /** Subscribe to an event bus event. Auto-cleaned up on page exit. */
    on(type: string, fn: (payload: unknown) => void) {
      unsubs.push(eventBus.on(type, fn));
    },
  };

  try {
    // eslint-disable-next-line no-new-func
    new Function(
      "api",
      `"use strict";
const { navigate, readTag, writeTag, onTimer, afterDelay, onTagChange, log, emit, on } = api;
${script}`,
    )(api);
  } catch (err) {
    console.error("[Script] Runtime error:", err);
  }

  return () => {
    timers.forEach((id) => clearInterval(id));
    unsubs.forEach((u) => u());
  };
}
