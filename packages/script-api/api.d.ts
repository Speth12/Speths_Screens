// The script API: one definition for both kinds of script (Phase 4).
//
// Runtime scripts run in the runtime (goja, internal/script) and get
// CommonApi and RuntimeScriptApi. Page scripts run in a Web Worker on the
// operator screen and in the IDE preview and get CommonApi and
// PageScriptApi. Both engines are tested against the member names here
// (internal/script/api_test.go reads this file), so a name added here
// without an implementation fails a test. The script editor feeds this
// file to Monaco for autocomplete.
//
// Tag paths are "datasource:path", "ns:path", or "session:name" for a
// session variable (page scripts only).

/** What a write answered, as the runtime's write pipeline reports it. */
export interface WriteResult {
  /** confirmed: the device holds the value; sent: an MQTT publish nothing
   *  echoes; not_confirmed: the device holds something else; failed: refused,
   *  with the reason. */
  status: "confirmed" | "sent" | "not_confirmed" | "failed";
  reason?: string;
}

/** Tag quality: Bad when the tag is unknown or its source is offline. */
export type Quality = "Good" | "Uncertain" | "Bad";

/** The names every script has. */
export interface CommonApi {
  /** The tag's current value, or null when it has none. */
  readTag(path: string): unknown;
  /** The tag's quality; Bad for a tag nobody holds. */
  quality(path: string): Quality;
  /** Write through the runtime's write pipeline (its checks and limits apply)
   *  and wait for the answer. Never throws: a refused write resolves with
   *  status "failed" and the reason. A runtime script may write only the tags
   *  in its `writes` list (a script without the list writes nothing; a listed
   *  tag needs no widget); a page script writes what a widget could. */
  writeTag(path: string, value: unknown): Promise<WriteResult>;
  /** Write a line to the log ([SCRIPT] in the runtime, the console on a page). */
  log(...args: unknown[]): void;
  /** Publish an event: script.event on the runtime's event bus, the page's
   *  event bus in a page script. */
  emit(type: string, payload?: unknown): void;
}

/** What fired a runtime script's run. */
export type ScriptEvent =
  | { kind: "start" }
  | { kind: "every" }
  | { kind: "change"; path: string; value: unknown; quality: Quality }
  | { kind: "alarm"; rule: string; active: boolean };

/** The names only runtime scripts have. The source is the body of an async
 *  function run on each trigger, so top-level await and return work. */
export interface RuntimeScriptApi {
  /** Kept between runs of this script (lost when the project is deployed
   *  again or the runtime restarts; use a retained memory tag to keep more). */
  state: Record<string, unknown>;
  /** What fired this run. */
  event: ScriptEvent;
}

/** The names only page scripts have. The source runs once when the page
 *  opens; timers and subscriptions end when it closes. */
export interface PageScriptApi {
  /** Go to a page by name or id. */
  navigate(page: string): void;
  /** Run fn every ms milliseconds while the page is open. */
  every(ms: number, fn: () => void): void;
  /** Run fn once, ms milliseconds from now, if the page is still open. */
  after(ms: number, fn: () => void): void;
  /** Run fn with the new value each time the tag changes. */
  onTagChange(path: string, fn: (value: unknown) => void): void;
  /** Run fn on each event of this type from the page's event bus. */
  on(type: string, fn: (payload: unknown) => void): void;
  /** @deprecated Use every. */
  onTimer(ms: number, fn: () => void): void;
  /** @deprecated Use after. */
  afterDelay(ms: number, fn: () => void): void;
}
