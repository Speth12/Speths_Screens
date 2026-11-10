// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { AlarmsTab } from "./AlarmsTab";
import { useProject } from "../store/projectStore";
import { useWorkspace } from "../store/workspace";
import { useDrafts } from "../store/drafts";

/** A stand-in for the WebSocket. The alarm feed's socket is kept so the test can push messages through it; the
 *  live-value socket the tag client opens is inert. */
class FakeSocket {
  static alarms: FakeSocket | null = null;
  readyState = 0;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { if (url.includes("/ws/alarms")) FakeSocket.alarms = this; }
  addEventListener() {}
  send() {}
  close() {}
  push(msg: unknown) { act(() => this.onmessage?.({ data: JSON.stringify(msg) })); }
}

const rules = [
  { id: "hi", name: "High pressure", expr: "{plc:P} > 64", severity: "warning", message: "Pressure is high" },
  { id: "lo", name: "Low level", expr: "{plc:L} < 10", severity: "critical", message: "" },
] as const;

const project = (alarmRules: readonly unknown[] = rules): Project => ({
  schemaVersion: 6, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets: [] }], alarmRules,
} as unknown as Project);

const stored = () => useProject.getState().project.alarmRules ?? [];
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", ruleId: "hi", ruleName: "High pressure", binding: "plc:P", severity: "warning", message: "Pressure is high",
  value: 70, active: true, acked: false, triggeredAt: "2026-11-10T10:00:00Z", ...over,
});

beforeEach(() => {
  useDrafts.setState({ entries: {} });
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
  useWorkspace.setState({ selection: {} });
  useProject.getState().loadProject(project());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const list = () => screen.getByRole("listbox", { name: "Alarm rules" });
const rows = () => within(list()).getAllByRole("option");

describe("the rule list", () => {
  it("shows each rule's severity, name and expression, the first one chosen", () => {
    render(<AlarmsTab />);
    expect(rows().map((r) => r.textContent)).toEqual(["warningHigh pressure{plc:P} > 64", "criticalLow level{plc:L} < 10"]);
    expect(rows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("2 rules · 0 active")).toBeTruthy();
  });

  it("says what a rule is when there are none", () => {
    useProject.getState().loadProject(project([]));
    render(<AlarmsTab />);
    expect(screen.getByText("No alarm rules yet")).toBeTruthy();
    expect(screen.getByText("0 rules · 0 active")).toBeTruthy();
  });

  it("narrows to the rules that match a search, and says when none do", () => {
    render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Search alarm rules"), { target: { value: "level" } });
    expect(rows().map((r) => r.textContent)).toEqual(["criticalLow level{plc:L} < 10"]);
    fireEvent.change(screen.getByLabelText("Search alarm rules"), { target: { value: "zzz" } });
    expect(screen.getByText("No rule matches “zzz”.")).toBeTruthy();
  });

  it("choosing a rule shows it in the editor", () => {
    render(<AlarmsTab />);
    fireEvent.click(rows()[1]!);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Low level");
    expect((screen.getByLabelText("Active while") as HTMLInputElement).value).toBe("{plc:L} < 10");
    expect(screen.getByRole("button", { name: "critical" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("editing a rule", () => {
  it("is a draft: nothing changes in the project until Save, and Revert goes back", () => {
    render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Very high pressure" } });
    fireEvent.click(screen.getByRole("button", { name: "critical" }));
    expect(stored()[0]).toMatchObject({ name: "High pressure", severity: "warning" });

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("High pressure");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Very high pressure" } });
    fireEvent.click(screen.getByRole("button", { name: "critical" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(stored()[0]).toEqual({ id: "hi", name: "Very high pressure", expr: "{plc:P} > 64", severity: "critical", message: "Pressure is high" });
  });

  it("Save and Revert wait for a change", () => {
    render(<AlarmsTab />);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Revert" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "x" } });
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["an expression that does not parse", "{plc:P} >", "Save changes"],
    ["no expression", "", "Save changes"],
  ])("refuses %s", (_, expr, button) => {
    render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Active while"), { target: { value: expr } });
    expect((screen.getByRole("button", { name: button }) as HTMLButtonElement).disabled).toBe(true);
    if (expr) expect(screen.getByRole("alert").textContent).toMatch(/./);
  });

  it("inserts a tag into the expression", () => {
    render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Tag to insert"), { target: { value: "plc:Q" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect((screen.getByLabelText("Active while") as HTMLInputElement).value).toBe("{plc:P} > 64{plc:Q}");
  });

  it("lists the tags the expression reads", () => {
    render(<AlarmsTab />);
    const reads = screen.getByLabelText("Tags the expression reads");
    expect(within(reads).getByText("plc:P")).toBeTruthy();
  });

  it("deletes a rule after asking", () => {
    render(<AlarmsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(stored()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(stored()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByText("Delete this rule?").parentElement!).getByRole("button", { name: "Delete" }));
    expect(stored().map((r) => r.id)).toEqual(["lo"]);
  });
});

describe("a new rule", () => {
  const fill = (name: string, expr: string) => {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Active while"), { target: { value: expr } });
  };

  it("is added when saved, and chosen", () => {
    render(<AlarmsTab />);
    fireEvent.click(screen.getAllByRole("button", { name: "New rule" })[0]!);
    expect(stored()).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Add rule" }) as HTMLButtonElement).disabled).toBe(true);
    fill("Tank full", "{plc:T} > 95");
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(stored()).toHaveLength(3);
    expect(stored()[2]).toMatchObject({ name: "Tank full", expr: "{plc:T} > 95", severity: "warning" });
    expect(useWorkspace.getState().selection.alarms).toBe(stored()[2]!.id);
  });

  it("can be cancelled", () => {
    render(<AlarmsTab />);
    fireEvent.click(screen.getAllByRole("button", { name: "New rule" })[0]!);
    fill("Half made", "{plc:T}");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(stored()).toHaveLength(2);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("High pressure");
  });
});

describe("the runtime's alarms", () => {
  it("marks a rule active in the list, and the Live view lists the event with Acknowledge", () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<AlarmsTab />);
    FakeSocket.alarms!.push(event());
    expect(rows()[0]!.textContent).toContain("active");
    expect(screen.getByText("2 rules · 1 active")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Live (1)" }));
    expect(screen.getByText("Pressure is high")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/alarms\/e1\/ack$/), expect.objectContaining({ method: "POST" }));
  });

  it("an acknowledged event is not counted as needing attention", () => {
    render(<AlarmsTab />);
    FakeSocket.alarms!.push(event({ acked: true }));
    expect(screen.getByText("2 rules · 0 active")).toBeTruthy();
    expect(rows()[0]!.textContent).toContain("acknowledged");
  });

  it("shows why an alarm is held", () => {
    render(<AlarmsTab />);
    FakeSocket.alarms!.push(event({ reason: "input {plc:P} is Bad" }));
    fireEvent.click(screen.getByRole("tab", { name: /^Live/ }));
    expect(screen.getByText("Held: input {plc:P} is Bad")).toBeTruthy();
  });

  it("the History view asks the runtime for the window and shows what comes back", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/alarms/history") ? [event({ id: "h1", ruleName: "Old alarm", active: false })] : [])));
    vi.stubGlobal("fetch", fetchMock);
    render(<AlarmsTab />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("Old alarm")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([u]) => /alarms\/history\?from=\d+&limit=200$/.test(String(u)))).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Severity" }), { target: { value: "critical" } });
    await screen.findByText("Old alarm");
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("&severity=critical"))).toBe(true);
  });

  it("keeps a draft while the events are looked at", () => {
    render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("tab", { name: "Live" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rule" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Edited");
  });
});

describe("unsaved edits", () => {
  it("survive the tab being closed and opened again, and show in the list", () => {
    const first = render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Edited" } });
    expect(rows()[0]!.textContent).toContain("unsaved");
    first.unmount();
    render(<AlarmsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Edited");
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false);
    expect(stored()[0]!.name).toBe("High pressure");
  });

  it("are given up when the rule changed somewhere else in the meantime", () => {
    const first = render(<AlarmsTab />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Edited" } });
    first.unmount();
    useProject.getState().updateAlarmRule("hi", { message: "Changed by an undo or a pull" });
    render(<AlarmsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("High pressure");
  });

  it("a new rule's draft survives too", () => {
    const first = render(<AlarmsTab />);
    fireEvent.click(screen.getAllByRole("button", { name: "New rule" })[0]!);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Half made" } });
    first.unmount();
    render(<AlarmsTab />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Half made");
    expect(screen.getByRole("button", { name: "Add rule" })).toBeTruthy();
  });
});
