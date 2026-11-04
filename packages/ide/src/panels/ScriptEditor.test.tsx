import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// A fake Monaco: one editor whose content the test sets.
const fake = vi.hoisted(() => {
  const state = { value: "", listeners: [] as (() => void)[], libs: "" , disposed: false };
  const editor = {
    getValue: () => state.value,
    setValue: (v: string) => { state.value = v; },
    onDidChangeModelContent: (fn: () => void) => { state.listeners.push(fn); },
    dispose: () => { state.disposed = true; },
  };
  const monaco = { editor: { create: (_el: HTMLElement, o: { value: string }) => { state.value = o.value; return editor; } } };
  return { state, monaco, load: { current: (() => Promise.resolve(monaco)) as () => Promise<unknown> } };
});
vi.mock("../store/monaco", async (orig) => ({
  ...(await orig<typeof import("../store/monaco")>()),
  loadMonaco: () => fake.load.current(),
  setScriptApi: (_m: unknown, kind: string) => { fake.state.libs = kind; },
}));

import { ScriptEditor } from "./ScriptEditor";
import { ambientApi } from "../store/monaco";

afterEach(cleanup);

describe("ambientApi", () => {
  const dts = "export interface CommonApi {\n  readTag(path: string): unknown;\n}\nexport interface RuntimeScriptApi {\n  state: Record<string, unknown>;\n}\n";
  it("makes the definition global, with the kind's names", () => {
    const rt = ambientApi("runtime", dts);
    expect(rt).not.toMatch(/^export /m);
    expect(rt).toContain('declare const readTag: CommonApi["readTag"];');
    expect(rt).toContain('declare const state: RuntimeScriptApi["state"];');
    expect(rt).not.toContain("navigate");
    const page = ambientApi("page", dts);
    expect(page).toContain('declare const navigate: PageScriptApi["navigate"];');
    expect(page).not.toContain("declare const state");
  });
});

it("edits in Monaco once it loads, with the kind's API", async () => {
  const onChange = vi.fn();
  render(<ScriptEditor kind="page" label="src" value="log(1)" onChange={onChange} />);
  await act(async () => {});
  expect(screen.queryByLabelText("src")).toBeNull(); // the text area is gone
  expect(fake.state.libs).toBe("page");
  fake.state.value = "log(2)";
  fake.state.listeners.forEach((fn) => fn());
  expect(onChange).toHaveBeenCalledWith("log(2)");
  cleanup();
  expect(fake.state.disposed).toBe(true);
});

it("stays a text area when Monaco cannot load", async () => {
  fake.load.current = () => Promise.reject(new Error("offline"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const onChange = vi.fn();
  render(<ScriptEditor kind="runtime" label="src" value="" onChange={onChange} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("src"), { target: { value: "log(3)" } });
  expect(onChange).toHaveBeenCalledWith("log(3)");
  warn.mockRestore();
});
