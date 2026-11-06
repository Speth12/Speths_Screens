import { describe, expect, it } from "vitest";
import { defaultCustomWidgets, defaultFrame } from "@speths-screens/widgets";
import { openProject } from "./openProject";

describe("the default header and navigation, as a project's own custom chrome", () => {
  for (const nav of ["sidebar", "toolbar", "tabs"] as const) {
    it(`follow schema.json, compile, and refer to custom widgets that exist (${nav})`, () => {
      const o = openProject({
        schemaVersion: 6, version: "1", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }],
        customWidgets: defaultCustomWidgets(), shell: { chrome: "custom", frame: defaultFrame(nav) },
      });
      expect(o.ok ? [] : o.problems).toEqual([]);
    });
  }
});
