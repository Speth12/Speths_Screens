// TagStoreClient — single WebSocket connection to /ws/tags with a per-path
// subscriber registry. Caches the last value so re-mounts hydrate immediately.

export type TagState = {
  value: unknown;
  quality: "Good" | "Bad" | "Uncertain" | "Unknown";
  ts: number;
};

type Listener = (s: TagState) => void;

type Outgoing = { subscribe?: string[]; unsubscribe?: string[] };
type Incoming = { path: string; value: unknown; quality: TagState["quality"]; ts: number };

const RECONNECT_MS = 1500;

class Client {
  private ws: WebSocket | null = null;
  private cache = new Map<string, TagState>();
  private listeners = new Map<string, Set<Listener>>();
  private connected = false;
  private connecting = false;

  /** Subscribe a listener. Returns an unsubscribe function. */
  subscribe(path: string, fn: Listener): () => void {
    let set = this.listeners.get(path);
    const isFirst = !set;
    if (!set) {
      set = new Set();
      this.listeners.set(path, set);
    }
    set.add(fn);

    // immediately hydrate from cache if known
    const cached = this.cache.get(path);
    if (cached) fn(cached);

    if (isFirst) this.send({ subscribe: [path] });
    this.ensureConnected();

    return () => {
      const s = this.listeners.get(path);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) {
        this.listeners.delete(path);
        this.send({ unsubscribe: [path] });
      }
    };
  }

  /** Get the cached value (synchronous read). */
  get(path: string): TagState | undefined {
    return this.cache.get(path);
  }

  private ensureConnected(): void {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    const url =
      (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/ws/tags";

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.connecting = false;
      this.connected = true;
      const all = Array.from(this.listeners.keys());
      if (all.length) ws.send(JSON.stringify({ subscribe: all }));
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data) as Incoming;
        const state: TagState = {
          value: msg.value,
          quality: msg.quality ?? "Unknown",
          ts: msg.ts ?? Date.now() * 1e6,
        };
        this.cache.set(msg.path, state);
        const subs = this.listeners.get(msg.path);
        subs?.forEach((fn) => fn(state));
      } catch {
        // ignore malformed
      }
    });

    const reconnect = () => {
      this.connecting = false;
      this.connected = false;
      this.ws = null;
      if (this.listeners.size) setTimeout(() => this.ensureConnected(), RECONNECT_MS);
    };
    ws.addEventListener("close", reconnect);
    ws.addEventListener("error", reconnect);
  }

  private send(msg: Outgoing): void {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export const tagStoreClient = new Client();
