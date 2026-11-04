import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A WebSocket we drive by hand: open, message and close happen when the test says.
class FakeSocket extends EventTarget {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  constructor(public url: string) { super(); FakeSocket.all.push(this); }
  send(s: string) { this.sent.push(s); }
  close() { this.readyState = 3; } // the close event comes later, like a real socket
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  closed() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  push(msg: object) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(msg) })); }
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("tagStoreClient.reconnectTo", () => {
  it("stays connected when the old socket's close arrives after the new one opened (IDE start-up)", async () => {
    const { tagStoreClient } = await import("./tagStoreClient");
    const seen: unknown[] = [];
    tagStoreClient.subscribe("plc:A", (s) => seen.push(s.value));
    const first = FakeSocket.all[0]!;
    first.open();

    tagStoreClient.reconnectTo("");      // the Header does this on mount
    const second = FakeSocket.all[1]!;
    second.open();
    first.closed();                      // late close of the replaced socket
    vi.advanceTimersByTime(5000);

    expect(tagStoreClient.isConnected()).toBe(true);
    expect(FakeSocket.all).toHaveLength(2); // no extra reconnect
    second.push({ path: "plc:A", value: 5, quality: "Good", ts: 1 });
    expect(seen).toEqual([5]);
  });

  it("ignores values still arriving on the replaced socket", async () => {
    const { tagStoreClient } = await import("./tagStoreClient");
    const seen: unknown[] = [];
    tagStoreClient.subscribe("plc:A", (s) => seen.push(s.value));
    const first = FakeSocket.all[0]!;
    first.open();
    tagStoreClient.reconnectTo("");
    first.push({ path: "plc:A", value: 99, quality: "Good", ts: 1 });
    expect(seen).toEqual([]);
    expect(tagStoreClient.get("plc:A")).toBeUndefined();
  });

  it("still reconnects when the current socket drops", async () => {
    const { tagStoreClient } = await import("./tagStoreClient");
    tagStoreClient.subscribe("plc:A", () => {});
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.closed();
    expect(tagStoreClient.isConnected()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(2);
  });
});
