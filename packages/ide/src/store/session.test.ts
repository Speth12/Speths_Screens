import { afterEach, expect, it, vi } from "vitest";
import { useProject } from "./projectStore";
import { bindSessionVars } from "./session";
import { tagStoreClient } from "./tagStoreClient";
import { previewWrite } from "./scriptRuntime";

afterEach(() => vi.unstubAllGlobals());

it("session variables follow the open project and are written in the tab", async () => {
  const net = vi.fn();
  vi.stubGlobal("fetch", net);
  const stop = bindSessionVars();
  const project = useProject.getState().project;
  useProject.setState({ project: { ...project, sessionVars: [{ name: "shift", type: "int", initial: 1 }] } });
  expect(tagStoreClient.get("session:shift")).toMatchObject({ value: 1, quality: "Good" });
  expect(await previewWrite("session:shift", 2)).toEqual({ status: "confirmed" });
  expect(await previewWrite("session:shift", "two")).toEqual({ status: "failed", reason: 'session variable shift is an int, not the text "two"' });
  expect(tagStoreClient.get("session:shift")?.value).toBe(2);
  useProject.setState({ project: { ...project, sessionVars: [] } });
  expect(tagStoreClient.get("session:shift")?.quality).toBe("Bad");
  stop();
  useProject.setState({ project });
  expect(net).not.toHaveBeenCalled();
});
