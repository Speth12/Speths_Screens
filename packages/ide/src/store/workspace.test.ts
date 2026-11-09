import { beforeEach, expect, it } from "vitest";
import { SCREEN_TAB, VARIABLES_TAB, useWorkspace } from "./workspace";

beforeEach(() => useWorkspace.setState({ tabs: [SCREEN_TAB], activeId: SCREEN_TAB.id }));

it("opens a tab and goes to it, once", () => {
  useWorkspace.getState().open(VARIABLES_TAB);
  useWorkspace.getState().open(VARIABLES_TAB);
  expect(useWorkspace.getState().tabs.map((t) => t.id)).toEqual(["screen", "variables"]);
  expect(useWorkspace.getState().activeId).toBe("variables");
});

it("closing the tab in front goes to the one on its left; the screen cannot be closed", () => {
  const w = useWorkspace.getState();
  w.open(VARIABLES_TAB);
  w.open({ id: "x", kind: "variables", title: "X" });
  useWorkspace.getState().close("x");
  expect(useWorkspace.getState().activeId).toBe("variables");
  useWorkspace.getState().close("variables");
  expect(useWorkspace.getState().activeId).toBe("screen");
  useWorkspace.getState().close("screen");
  expect(useWorkspace.getState().tabs).toHaveLength(1);
});

it("closing a tab behind the one in front leaves the front one", () => {
  const w = useWorkspace.getState();
  w.open(VARIABLES_TAB);
  w.open({ id: "x", kind: "variables", title: "X" });
  useWorkspace.getState().close("variables");
  expect(useWorkspace.getState().activeId).toBe("x");
});
