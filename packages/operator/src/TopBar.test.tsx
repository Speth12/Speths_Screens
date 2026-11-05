// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TopBar, driverSummary, formatClock, tokenUser, type MenuProps } from "./TopBar";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const jwt = (claims: object) => `x.${btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;

describe("driverSummary", () => {
  const d = (connected: boolean) => ({ id: "x", connected });
  it.each([
    [[], "none", 0, 0],
    [[d(true), d(true)], "ok", 2, 2],
    [[d(true), d(false)], "partial", 1, 2],
    [[d(false), d(false)], "down", 0, 2],
  ] as const)("%j is %s", (list, state, online, total) => expect(driverSummary(list)).toEqual({ online, total, state }));
});

describe("formatClock", () => {
  it("is the weekday and the time with seconds", () => {
    expect(formatClock(new Date(2026, 10, 5, 7, 49, 12), "en-GB")).toBe("Thu 07:49:12");
  });
});

describe("tokenUser", () => {
  it("reads the name and role from a login token", () => expect(tokenUser(jwt({ sub: "dan", role: "admin" }))).toEqual({ name: "dan", role: "admin" }));
  it.each([null, "", "nonsense", "a.b", "a.%%%.c", jwt({ role: "admin" })])("%s is nobody", (t) => expect(tokenUser(t as string | null)).toBeNull());
});

const menu = (more: Partial<MenuProps> = {}): MenuProps => ({ token: null, loginRequired: false, onLogout: vi.fn(), ...more });
const bar = (more: Partial<Parameters<typeof TopBar>[0]> = {}) => render(
  <TopBar projectName="Pump Station 2" pageName="Overview" drivers={[{ id: "sim", label: "Simulation", connected: true, tagCount: 6 }, { id: "plc", label: "PLC", connected: false, lastError: "no answer from 10.0.0.210 (timed out)" }]}
    phone={false} menu={menu()} {...more} />);

describe("TopBar", () => {
  it("shows the logo, the project, and the page", () => {
    bar();
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.getByText("Speth's Screens")).toBeTruthy();
    expect(screen.getByTestId("project-name").textContent).toBe("Pump Station 2");
    expect(screen.getByText("Overview")).toBeTruthy();
  });

  it("shows each driver by name with its state, and why one is not connected", () => {
    bar();
    expect(screen.getByTestId("driver-sim").getAttribute("data-connected")).toBe("true");
    expect(screen.getByTestId("driver-plc").getAttribute("data-connected")).toBe("false");
    expect(screen.getByTestId("driver-plc").getAttribute("title")).toContain("no answer from 10.0.0.210");
    expect(screen.getByText("(not connected)")).toBeTruthy();
  });

  it("a phone shows one summary of the drivers instead, and no clock or wordmark", () => {
    bar({ phone: true });
    expect(screen.getByTestId("driver-summary").textContent).toBe("1/2");
    expect(screen.queryByTestId("clock")).toBeNull();
    expect(screen.queryByText("Speth's Screens")).toBeNull();
  });

  it("shows no driver chips when the project has no drivers", () => {
    bar({ drivers: [] });
    expect(screen.queryByRole("list", { name: "Drivers" })).toBeNull();
  });

  it("the clock ticks every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 7, 49, 12));
    bar();
    const before = screen.getByTestId("clock").textContent;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId("clock").textContent).not.toBe(before);
  });

  it("has no alarms in it: those belong to the alarm widgets", () => {
    bar();
    expect(screen.queryByRole("button", { name: /alarm/i })).toBeNull();
  });
});

describe("the user menu is only the account", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: /^User$|Signed in as/ }));

  it("with security off says nobody needs to sign in", () => {
    bar();
    open();
    expect(screen.getByTestId("account").textContent).toContain("Security is off");
    expect(screen.queryByText("Log out")).toBeNull();
  });

  it("signed in, it shows who and logs out", () => {
    const onLogout = vi.fn();
    bar({ menu: menu({ token: jwt({ sub: "dan", role: "admin" }), loginRequired: true, onLogout }) });
    open();
    expect(screen.getByText("dan")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    fireEvent.click(screen.getByText("Log out"));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("holds no view settings and no tools: those are on the Settings screen", () => {
    bar({ menu: menu({ token: jwt({ sub: "dan", role: "admin" }), loginRequired: true }) });
    open();
    for (const label of ["Light or dark", "Language", "Fit the page to the window"]) expect(screen.queryByLabelText(label)).toBeNull();
    for (const text of ["Recipes", "Lock screen"]) expect(screen.queryByText(text)).toBeNull();
  });

  it("Escape and a click outside close it", () => {
    bar();
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
