// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { Properties, usePropertyTab } from "./Properties";
import { withRole } from "./AccessFields";

beforeEach(() => {
  vi.stubGlobal("WebSocket", class { readyState = 0; addEventListener() {} send() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); usePropertyTab.setState({ tab: "settings" }); });
const openAccess = () => fireEvent.click(screen.getByRole("tab", { name: /^Access/ }));

const load = (mode?: "login") => useProject.getState().loadProject({
  schemaVersion: 7, version: "1", datasources: [], ...(mode ? { security: { mode } } : {}),
  pages: [{ id: "p1", name: "Main", widgets: [{ id: "b1", type: "button", x: 0, y: 0, w: 2, h: 1 }] }],
} as unknown as Project);
const page = () => useProject.getState().project.pages[0]!;

describe("access in the properties", () => {
  it("a widget: who can see it and who can use it, blank is everyone", () => {
    load("login");
    useProject.getState().selectWidget("b1");
    render(<Properties />);
    openAccess();
    const group = within(screen.getByRole("group", { name: "Who can use this widget" }));
    fireEvent.change(group.getByLabelText("Who can use it"), { target: { value: "supervisor" } });
    expect(page().widgets[0]).toMatchObject({ access: { operate: "supervisor" } });
    fireEvent.change(group.getByLabelText("Who can see it"), { target: { value: "operator" } });
    expect(page().widgets[0]!.access).toEqual({ operate: "supervisor", view: "operator" });
    fireEvent.change(group.getByLabelText("Who can use it"), { target: { value: "" } });
    fireEvent.change(group.getByLabelText("Who can see it"), { target: { value: "" } });
    expect(page().widgets[0]!.access).toBeUndefined();
    expect(screen.queryByText(/Security is off/)).toBeNull();
  });

  it("a page", () => {
    load("login");
    useProject.getState().selectWidget(null);
    render(<Properties />);
    const group = within(screen.getByRole("group", { name: "Who can use this page" }));
    fireEvent.change(group.getByLabelText("Who can see it"), { target: { value: "engineer" } });
    expect(page().access).toEqual({ view: "engineer" });
  });

  it("with security off it says the roles do nothing yet", () => {
    load();
    useProject.getState().selectWidget("b1");
    render(<Properties />);
    openAccess();
    fireEvent.change(screen.getByLabelText("Who can use it"), { target: { value: "admin" } });
    expect(screen.getByText(/Security is off, so everyone is an administrator/)).toBeTruthy();
  });
});

describe("withRole", () => {
  it.each([
    [undefined, "view", "admin", { view: "admin" }],
    [{ view: "admin" }, "view", undefined, undefined],
    [{ view: "admin", operate: "admin" }, "view", undefined, { operate: "admin" }],
  ] as const)("%j, %s = %s", (from, key, role, want) => {
    expect(withRole(from as never, key, role)).toEqual(want);
  });
});
