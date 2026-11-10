// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";
import { ScriptsTab } from "./ScriptsTab";

// The tab is tested with the text area the editor shows until Monaco loads.
vi.mock("../store/monaco", () => ({ loadMonaco: () => new Promise(() => {}), setScriptApi: () => {} }));

const original = useProject.getState().project;
const stateOnRuntime = (list: unknown[]) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(list))));

beforeEach(() => {
  stateOnRuntime([]);
  useWorkspace.setState({ selection: {} });
  useProject.setState({ project: { ...original, scripts: [], sessionVars: undefined, scriptRole: undefined, alarmRules: [{ id: "hi", name: "High", expr: "{plc:T} > 5", severity: "critical", message: "" }] } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useProject.setState({ project: original });
});

const script = () => useProject.getState().project.scripts![0]!;
const list = () => screen.getByRole("listbox", { name: "Scripts" });
const add = () => fireEvent.click(screen.getAllByRole("button", { name: "New script" })[0]!);

describe("the script list", () => {
  it("says what a script is when there are none, and makes one", () => {
    render(<ScriptsTab />);
    expect(screen.getByText("No scripts yet")).toBeTruthy();
    add();
    expect(script()).toMatchObject({ id: "script1", name: "Script 1", trigger: { every: 1000 } });
    expect(useWorkspace.getState().selection.scripts).toBe("script1");
    expect(within(list()).getByText("every 1 s")).toBeTruthy();
  });

  it("shows when each script runs, and the first one is chosen", () => {
    useProject.setState({ project: { ...original, scripts: [
      { id: "a", name: "Ticker", trigger: { every: 250, onStart: true }, source: "" },
      { id: "b", name: "Follower", trigger: { onChange: ["plc:A", "plc:B"], onAlarm: ["hi"] }, source: "" },
    ] } });
    render(<ScriptsTab />);
    const rows = within(list()).getAllByRole("option");
    expect(rows[0]!.textContent).toContain("every 250 ms · on start");
    expect(rows[1]!.textContent).toContain("on change (2) · on alarm (1)");
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ticker");
  });

  it("flags a script whose source does not parse, and says how many run", async () => {
    stateOnRuntime([{ id: "a", state: "running", runs: 4, interrupts: 0, dropped: 0 }]);
    useProject.setState({ project: { ...original, scripts: [
      { id: "a", name: "Good", trigger: { onStart: true }, source: "log(1)" },
      { id: "b", name: "Broken", trigger: { onStart: true }, source: "if (x {" },
    ] } });
    render(<ScriptsTab />);
    expect(within(list()).getAllByRole("option")[1]!.textContent).toContain("error");
    expect(await screen.findByText("2 scripts · 1 running")).toBeTruthy();
  });
});

describe("editing a script", () => {
  it("edits its triggers and source, and shows a syntax problem", () => {
    render(<ScriptsTab />);
    add();

    fireEvent.change(screen.getByLabelText("Every (ms)"), { target: { value: "" } });
    expect(screen.getByText("A script needs at least one trigger.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("High"));
    fireEvent.change(screen.getByLabelText("When one of these tags changes"), { target: { value: "plc:Run" } });
    expect(script().trigger).toEqual({ onAlarm: ["hi"], onChange: ["plc:Run"] });
    fireEvent.click(screen.getByLabelText("At start"));
    expect(script().trigger.onStart).toBe(true);

    fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "if (x {" } });
    expect(screen.getByRole("alert").textContent).toMatch(/^line 1, column 7: /);
    fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "await writeTag('plc:A', 1)" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when every is under 100 ms", () => {
    render(<ScriptsTab />);
    add();
    fireEvent.change(screen.getByLabelText("Every (ms)"), { target: { value: "50" } });
    expect(screen.getByText("Every must be at least 100 ms.")).toBeTruthy();
  });

  it("renames a script", () => {
    render(<ScriptsTab />);
    add();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Counter" } });
    expect(script().name).toBe("Counter");
    expect(within(list()).getByText("Counter")).toBeTruthy();
  });

  it("deletes a script after asking", () => {
    render(<ScriptsTab />);
    add();
    fireEvent.click(screen.getByRole("button", { name: "Delete script" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(useProject.getState().project.scripts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete script" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(useProject.getState().project.scripts ?? []).toHaveLength(0);
  });

  it("sets the role the scripts write as; operator is the default and is not stored", () => {
    render(<ScriptsTab />);
    fireEvent.change(screen.getByLabelText("Role the scripts write as"), { target: { value: "engineer" } });
    expect(useProject.getState().project.scriptRole).toBe("engineer");
    fireEvent.change(screen.getByLabelText("Role the scripts write as"), { target: { value: "operator" } });
    expect("scriptRole" in useProject.getState().project && useProject.getState().project.scriptRole !== undefined).toBe(false);
  });
});

describe("the writes list", () => {
  it("is edited in the tab, checked as you type, and a script that writes without one is warned about", () => {
    useProject.setState({ project: {
      ...original,
      datasources: [{ id: "mem", type: "memory", label: "Memory", config: { memoryTags: [] } }],
      scripts: [{ id: "s", name: "Setter", trigger: { onStart: true }, source: "await writeTag('mem:x', 1)" }],
    } });
    render(<ScriptsTab />);
    const input = () => screen.getByLabelText("May write these tags") as HTMLInputElement;

    expect(screen.getByText("The script calls writeTag but has no writes list: every write is refused.")).toBeTruthy();

    fireEvent.change(input(), { target: { value: "mem:*" } });
    expect(script().writes).toEqual(["mem:*"]);
    expect(screen.queryByText(/has no writes list/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(input(), { target: { value: "other:X, mem:a*b, mem:*, mem:*" } });
    const problems = screen.getByRole("alert").textContent!;
    expect(problems).toContain("other:X names no datasource");
    expect(problems).toContain("mem:a*b: * is only allowed as the last character");
    expect(problems).toContain("mem:* is listed twice");

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

describe("a script's state on the runtime", () => {
  const one = [{ id: "s", name: "Setter", trigger: { onStart: true }, source: "log(1)" }];

  it.each([
    ["running", { id: "s", state: "running", runs: 1, interrupts: 0, dropped: 0 }, "Running, 1 run"],
    ["with dropped runs", { id: "s", state: "running", runs: 40, interrupts: 0, dropped: 3 }, "Running, 40 runs, 3 dropped"],
    ["stopped", { id: "s", state: "stopped", reason: "5 interrupts in a minute", runs: 9, interrupts: 5, dropped: 0 }, "Stopped: 5 interrupts in a minute"],
  ])("%s", async (_, status, want) => {
    stateOnRuntime([status]);
    useProject.setState({ project: { ...original, scripts: one } });
    render(<ScriptsTab />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain(want));
  });

  it("shows its last error", async () => {
    stateOnRuntime([{ id: "s", state: "running", runs: 3, interrupts: 0, dropped: 0, lastError: "write refused" }]);
    useProject.setState({ project: { ...original, scripts: one } });
    render(<ScriptsTab />);
    expect(await screen.findByText("write refused")).toBeTruthy();
  });

  it("says when the runtime does not have it", () => {
    useProject.setState({ project: { ...original, scripts: one } });
    render(<ScriptsTab />);
    expect(screen.getByRole("status").textContent).toContain("Not on the runtime");
  });
});

describe("session variables", () => {
  const vars = () => JSON.parse(JSON.stringify(useProject.getState().project.sessionVars));

  it("declares typed initial values", () => {
    render(<ScriptsTab />);
    fireEvent.click(screen.getByRole("tab", { name: "Session variables (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    expect(vars()).toEqual([{ name: "var1", type: "int" }]);
    fireEvent.change(screen.getByLabelText("Session variable 1 name"), { target: { value: "shift" } });
    fireEvent.change(screen.getByLabelText("Session variable 1 initial value"), { target: { value: "2" } });
    expect(vars()).toEqual([{ name: "shift", type: "int", initial: 2 }]);
    fireEvent.change(screen.getByLabelText("Session variable 1 initial value"), { target: { value: "2.5" } });
    expect(vars()).toEqual([{ name: "shift", type: "int" }]);
    expect((screen.getByLabelText("Session variable 1 initial value") as HTMLInputElement).value).toBe("2.5");
    fireEvent.change(screen.getByLabelText("Session variable 1 type"), { target: { value: "real" } });
    expect(vars()).toEqual([{ name: "shift", type: "real", initial: 2.5 }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove session variable 1" }));
    expect(useProject.getState().project.sessionVars).toBeUndefined();
  });

  it("says when there are none", () => {
    render(<ScriptsTab />);
    fireEvent.click(screen.getByRole("tab", { name: "Session variables (0)" }));
    expect(screen.getByText("No session variables yet.")).toBeTruthy();
  });
});
