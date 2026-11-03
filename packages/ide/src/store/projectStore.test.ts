import { expect, it } from "vitest";
import { useProject } from "./projectStore";
import type { Project } from "@speths-screens/shared-types";

it("updateDatasource changes one datasource and can be undone", () => {
  const p: Project = {
    version: "0.1.0",
    datasources: [
      { id: "rest", label: "REST", type: "rest", config: { endpoint: "https://10.0.0.210" } },
      { id: "opcua", label: "OPC UA", type: "opcua", config: { endpoint: "opc.tcp://10.0.0.210:4840" } },
    ],
    pages: [{ id: "p1", name: "Main", widgets: [] }],
  };
  const s = useProject.getState();
  s.loadProject(p);
  s.updateDatasource("rest", { config: { endpoint: "https://10.0.0.210", certCheck: "pinned", certFingerprint: "AB:CD" } });

  const [rest, opcua] = useProject.getState().project.datasources as [Project["datasources"][number], Project["datasources"][number]];
  expect(rest.config).toEqual({ endpoint: "https://10.0.0.210", certCheck: "pinned", certFingerprint: "AB:CD" });
  expect(opcua).toEqual(p.datasources[1]);

  useProject.getState().undo();
  expect(useProject.getState().project.datasources[0]!.config).toEqual({ endpoint: "https://10.0.0.210" });
});
