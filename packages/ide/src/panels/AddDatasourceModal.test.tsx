import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddDatasourceModal } from "./LeftPanel";

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
