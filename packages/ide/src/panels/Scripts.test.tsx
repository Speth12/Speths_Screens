import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject } from "../store/projectStore";
import { Scripts, SessionVars, withTrigger, withWrites, writesText } from "./Scripts";

// The panel is tested with the text area the editor shows until Monaco loads.
vi.mock("../store/monaco", () => ({ loadMonaco: () => new Promise(() => {}), setScriptApi: () => {} }));

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

it("declares session variables with typed initial values", () => {
  render(<SessionVars />);
  fireEvent.click(screen.getByText("+ add variable"));
  const vars = () => JSON.parse(JSON.stringify(useProject.getState().project.sessionVars));
  expect(vars()).toEqual([{ name: "var1", type: "int" }]);
  fireEvent.change(screen.getByLabelText("session variable 1 name"), { target: { value: "shift" } });
  fireEvent.change(screen.getByLabelText("session variable 1 initial"), { target: { value: "2" } });
  expect(vars()).toEqual([{ name: "shift", type: "int", initial: 2 }]);
  fireEvent.change(screen.getByLabelText("session variable 1 initial"), { target: { value: "2.5" } });
  expect(vars()).toEqual([{ name: "shift", type: "int" }]);
  expect((screen.getByLabelText("session variable 1 initial") as HTMLInputElement).value).toBe("2.5");
  fireEvent.change(screen.getByLabelText("session variable 1 type"), { target: { value: "real" } });
  expect(vars()).toEqual([{ name: "shift", type: "real", initial: 2.5 }]);
  fireEvent.click(screen.getByTitle("Remove variable"));
  expect(useProject.getState().project.sessionVars).toBeUndefined();
});

describe("the writes list", () => {
  it.each([
    ["", undefined],
    [" , ,, ", undefined],
    ["mem:Count", ["mem:Count"]],
    [" mem:*, plc:Run ,, ns:Line1/* ", ["mem:*", "plc:Run", "ns:Line1/*"]],
  ])("withWrites(%j)", (text, want) => expect(withWrites(text)).toEqual(want));

  it("writesText joins the entries", () => {
    expect(writesText({ id: "s", name: "S", trigger: {}, source: "", writes: ["mem:*", "plc:Run"] })).toBe("mem:*, plc:Run");
    expect(writesText({ id: "s", name: "S", trigger: {}, source: "" })).toBe("");
  });

  it("is edited in the panel, checked as you type, and a script that writes without one is warned about", () => {
    useProject.setState({ project: {
      ...original,
      datasources: [{ id: "mem", type: "memory", label: "Memory", config: { memoryTags: [] } }],
      scripts: [{ id: "s", name: "Setter", trigger: { onStart: true }, source: "await writeTag('mem:x', 1)" }],
    } });
    render(<Scripts />);
    fireEvent.click(screen.getByText("Setter"));
    const script = () => useProject.getState().project.scripts![0]!;
    const input = () => screen.getByLabelText("writes") as HTMLInputElement;

    expect(screen.getByText("The script calls writeTag but has no writes list: every write is refused.")).toBeTruthy();

    fireEvent.change(input(), { target: { value: "mem:*" } });
    expect(script().writes).toEqual(["mem:*"]);
    expect(screen.queryByText(/has no writes list/)).toBeNull();
    expect(screen.queryByText(/^writes: /)).toBeNull();

    fireEvent.change(input(), { target: { value: "other:X, mem:a*b, mem:*, mem:*" } });
    expect(screen.getByText("writes: other:X names no datasource")).toBeTruthy();
    expect(screen.getByText("writes: mem:a*b: * is only allowed as the last character")).toBeTruthy();
    expect(screen.getByText("writes: mem:* is listed twice")).toBeTruthy();

    // A comma and a space typed last stay in the field while it has the focus.
    fireEvent.change(input(), { target: { value: "mem:*, " } });
    expect(input().value).toBe("mem:*, ");
    expect(script().writes).toEqual(["mem:*"]);
    fireEvent.blur(input());
    expect(input().value).toBe("mem:*");

    fireEvent.change(input(), { target: { value: "" } });
    expect(script().writes).toBeUndefined();
    expect(screen.getByText(/has no writes list/)).toBeTruthy();
  });
});
