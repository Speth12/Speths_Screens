import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { TagBrowser } from "./TagBrowser";
import { useProject } from "../store/projectStore";
import type { Project } from "@speths-screens/shared-types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const projectWith = (dsId: string): Project => ({
  schemaVersion: 2,
  version: "0.1.0",
  datasources: [{ id: dsId, name: dsId, type: "rest", config: {} } as unknown as Project["datasources"][number]],
  pages: [{ id: "p1", name: "Main", widgets: [] }],
});

it("reloads the tag list when another project with as many datasources opens", async () => {
  const f = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", f);
  const tagCalls = () => (f.mock.calls as unknown as [string][]).map(([u]) => u).filter((u) => u.endsWith("/tags"));

  useProject.getState().loadProject(projectWith("plc-a"));
  render(<TagBrowser />);
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/plc-a/tags"));

  act(() => useProject.getState().loadProject(projectWith("plc-b")));
  await waitFor(() => expect(tagCalls()).toContain("/api/v1/datasources/plc-b/tags"));
});
