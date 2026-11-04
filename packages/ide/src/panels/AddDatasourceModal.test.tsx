import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddDatasourceModal, memoryTag } from "./LeftPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Test-only values, not real credentials.
const USER = "hmi-user";
const PASS = "fake-pass-7Qz";

function setup(type?: string) {
  const f = vi.fn(async () => new Response(JSON.stringify({ connected: true })));
  vi.stubGlobal("fetch", f);
  const onAdd = vi.fn();
  render(<AddDatasourceModal onClose={() => {}} onAdd={onAdd} />);
  if (type) fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: type } });
  const added = () => onAdd.mock.calls[0]![0].config as Record<string, unknown>;
  const tested = () => JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).config;
  return { added, tested };
}

for (const type of ["rest", "opcua", "mqtt"]) {
  it(`${type}: sends the username and password on Test and saves them on Add`, async () => {
    const { added, tested } = setup(type);
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: USER } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: PASS } });
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(tested()).toMatchObject({ username: USER, password: PASS }));
    fireEvent.click(screen.getByText("Add"));
    expect(added()).toMatchObject({ username: USER, password: PASS });
  });
}

it("no username: no credentials in the config", () => {
  const { added } = setup("rest");
  expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Add"));
  expect(added()).not.toHaveProperty("username");
  expect(added()).not.toHaveProperty("password");
});

it("Modbus has no login fields", () => {
  setup("mbtcp");
  expect(screen.queryByLabelText(/Username/)).toBeNull();
});

it("memory: saves the typed tags, with initial values read as their type", () => {
  const { added } = setup("memory");
  expect(screen.queryByText(/IP Address/)).toBeNull();
  fireEvent.click(screen.getByText("+ add tag"));
  fireEvent.change(screen.getByLabelText("memory tag 2 path"), { target: { value: "Mode" } });
  fireEvent.change(screen.getByLabelText("memory tag 2 type"), { target: { value: "string" } });
  fireEvent.change(screen.getByLabelText("memory tag 2 initial"), { target: { value: "auto" } });
  fireEvent.click(screen.getByText("Add"));
  expect(added()).toEqual({ memoryTags: [
    { path: "Count", type: "int", initial: 0, retain: true },
    { path: "Mode", type: "string", initial: "auto" },
  ] });
});

describe("memoryTag", () => {
  const row = (type: "bool" | "int" | "real" | "string", initial: string) => ({ path: " T ", type, initial, retain: false });
  it.each([
    [row("int", "3"), { path: "T", type: "int", initial: 3 }],
    [row("int", "3.5"), { path: "T", type: "int" }],
    [row("real", "3.5"), { path: "T", type: "real", initial: 3.5 }],
    [row("real", "x"), { path: "T", type: "real" }],
    [row("bool", "1"), { path: "T", type: "bool", initial: true }],
    [row("bool", "false"), { path: "T", type: "bool", initial: false }],
    [row("bool", "maybe"), { path: "T", type: "bool" }],
    [row("string", " hi "), { path: "T", type: "string", initial: " hi " }],
    [row("string", ""), { path: "T", type: "string" }],
  ])("%j", (r, want) => expect(memoryTag(r)).toEqual(want));
});
