// writeTag is the operator app's one way to write a tag. Every widget, the
// confirmation dialog and momentary buttons go through it.
//
// The runtime answers each write with a status: "confirmed" (the PLC holds
// the value), "sent" (MQTT, no read-back), "not_confirmed" (the PLC
// accepted it but holds something else) or "failed" (with a reason).
// Writes to the same tag go out one after another, so a momentary
// button's release can never overtake its press.

export type WriteStatus = "confirmed" | "sent" | "not_confirmed" | "failed";

export type WriteResult = {
  binding: string;
  value: unknown;
  status: WriteStatus;
  reason?: string;
};

type Listener = (r: WriteResult) => void;

let authToken: string | null = null;
const listeners = new Set<Listener>();
const queues = new Map<string, Promise<unknown>>();

/** Sets the login token sent with writes (null for none). */
export function setWriteToken(token: string | null): void {
  authToken = token;
}

/** Calls fn with the result of every write; returns an unsubscribe function. */
export function onWriteResult(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Writes value to binding ("datasource:path" or "ns:path"). widgetId names
 * the writing widget so its min/max apply. Never throws.
 */
export function writeTag(binding: string, value: unknown, widgetId?: string): Promise<WriteResult> {
  const prev = queues.get(binding) ?? Promise.resolve();
  const next = prev.then(() => send(binding, value, widgetId));
  queues.set(binding, next);
  void next.then(() => {
    if (queues.get(binding) === next) queues.delete(binding);
  });
  return next;
}

async function send(binding: string, value: unknown, widgetId?: string): Promise<WriteResult> {
  const result = await post(binding, value, widgetId);
  listeners.forEach((fn) => fn(result));
  return result;
}

async function post(binding: string, value: unknown, widgetId?: string): Promise<WriteResult> {
  const sep = binding.indexOf(":");
  if (sep < 0) return { binding, value, status: "failed", reason: `${binding} does not name a tag` };
  const datasource = binding.slice(0, sep);
  const path = binding.slice(sep + 1);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  try {
    // eslint-disable-next-line local/api-token -- token set on headers above (auth.ts pushes it in via setWriteToken)
    const resp = await fetch(`/api/v1/tag/${encodeURIComponent(path)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ datasource, value, widgetId }),
    });
    let body: { status?: WriteStatus; reason?: string; error?: string } = {};
    try {
      body = await resp.json();
    } catch {
      /* not JSON: use the HTTP status */
    }
    const status: WriteStatus = body.status ?? (resp.ok ? "confirmed" : "failed");
    const reason = body.reason ?? body.error ?? (resp.ok ? undefined : `HTTP ${resp.status}`);
    return { binding, value, status, reason };
  } catch {
    return { binding, value, status: "failed", reason: "the runtime is not reachable" };
  }
}
