import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject } from "../store/projectStore";
import { Scripts, withTrigger } from "./Scripts";

const original = useProject.getState().project;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  useProject.setState({ project: { ...original, scripts: [], alarmRules: [{ id: "hi", name: "High", expr: "{plc:T} > 5", severity: "critical", message: "" }] } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useProject.setState({ project: original });
});

describe("withTrigger", () => {
  it.each([
    [{ every: 500 }, { every: "" }, {}],
    [{}, { every: "250" }, { every: 250 }],
    [{}, { onChange: " plc:A, ns:B ,, " }, { onChange: ["plc:A", "ns:B"] }],
    [{ onChange: ["x"] }, { onChange: "" }, {}],
    [{}, { onStart: true }, { onStart: true }],
    [{ onStart: true }, { onStart: false }, {}],
    [{ onAlarm: ["a"] }, { onAlarm: [] }, {}],
  ])("%j + %j", (t, patch, want) => expect(withTrigger(t, patch)).toEqual(want));
});

it("adds a script, edits its triggers and source, and shows a syntax problem", () => {
  render(<Scripts />);
  fireEvent.click(screen.getByText("+ add script"));
  const script = () => useProject.getState().project.scripts![0]!;
  expect(script()).toMatchObject({ id: "script1", name: "Script 1", trigger: { every: 1000 } });

  fireEvent.change(screen.getByLabelText("every ms"), { target: { value: "" } });
  expect(screen.getByText("A script needs at least one trigger.")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("High"));
  fireEvent.change(screen.getByLabelText("on change"), { target: { value: "plc:Run" } });
  expect(script().trigger).toEqual({ onAlarm: ["hi"], onChange: ["plc:Run"] });

  fireEvent.change(screen.getByLabelText("script source"), { target: { value: "if (x {" } });
  expect(screen.getByText(/^line 1, column 7: /)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("script source"), { target: { value: "await writeTag('plc:A', 1)" } });
  expect(screen.queryByText(/^line \d/)).toBeNull();

  fireEvent.change(screen.getByLabelText("script role"), { target: { value: "engineer" } });
  expect(useProject.getState().project.scriptRole).toBe("engineer");
  fireEvent.change(screen.getByLabelText("script role"), { target: { value: "operator" } });
  expect("scriptRole" in useProject.getState().project).toBe(false);
});
