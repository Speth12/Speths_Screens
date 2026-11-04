import { afterEach, expect, it, vi } from "vitest";
import { sessionStore } from "./store/session";
import { tagStoreClient } from "./store/tagStoreClient";
import { writeTag } from "./writeTag";

afterEach(() => vi.unstubAllGlobals());

it("session variables are read and written in the tab, never over the network", async () => {
  const net = vi.fn();
  vi.stubGlobal("fetch", net);
  vi.stubGlobal("WebSocket", net);
  sessionStore.define([{ name: "mode", type: "string", initial: "auto" }, { name: "n", type: "int" }]);
  const seen: unknown[] = [];
  const stop = tagStoreClient.subscribe("session:mode", (s) => seen.push(s.value));
  expect(tagStoreClient.get("session:n")).toMatchObject({ value: 0, quality: "Good" });
  expect(await writeTag("session:mode", "manual")).toMatchObject({ status: "confirmed" });
  expect(await writeTag("session:n", 2.5)).toMatchObject({ status: "failed", reason: "session variable n is an int, not 2.5" });
  stop();
  expect(seen).toEqual(["auto", "manual"]);
  expect(net).not.toHaveBeenCalled();
});
