import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Access, CustomWidget, Widget } from "@speths-screens/shared-types";
import { WidgetRenderer } from "./widgets";
import { WidgetHostProvider, inertHost, type UserInfo, type WidgetHost } from "./host";
import { PageAccess, canView, needInside, roleRank, userRank } from "./access";

afterEach(cleanup);

const button = (access?: Access, id = "b1", label = "Start"): Widget =>
  ({ id, type: "button", x: 0, y: 0, w: 2, h: 1, props: { label }, access, events: { onClick: [{ type: "write", tag: "plc:Run", value: 1 }] } }) as Widget;

function draw(w: Widget, user: UserInfo, pageAccess?: Access, extra: Partial<WidgetHost> = {}) {
  const host: WidgetHost = { ...inertHost, requestWrite: vi.fn(), write: vi.fn(), useUser: () => user, ...extra };
  render(<WidgetHostProvider value={host}><PageAccess access={pageAccess}><WidgetRenderer w={w} /></PageAccess></WidgetHostProvider>);
  return host;
}
const as = (role?: string): UserInfo => ({ loginRequired: true, name: role ? "x" : undefined, role });

describe("who may see and use a widget", () => {
  it("with security off everyone is an administrator: nothing is hidden or locked", () => {
    const host = draw(button({ view: "admin", operate: "admin" }), { loginRequired: false });
    fireEvent.click(screen.getByText("Start"));
    expect(host.requestWrite).toHaveBeenCalled();
    expect(document.querySelector("[data-access]")).toBeNull();
  });

  it("below its view role it is not drawn at all", () => {
    draw(button({ view: "supervisor" }), as("operator"));
    expect(screen.queryByText("Start")).toBeNull();
  });

  it("below its operate role it is drawn greyed out, says who can use it, and does nothing", () => {
    const host = draw(button({ operate: "engineer" }), as("supervisor"));
    const locked = document.querySelector<HTMLElement>("[data-access='locked']")!;
    expect(locked.title).toBe("Only engineer and above can use this");
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Start")).toBeTruthy();
    expect((locked.firstElementChild as HTMLElement).style.pointerEvents).toBe("none");
    expect(host.requestWrite).not.toHaveBeenCalled();
  });

  it("at or above its role it works", () => {
    const host = draw(button({ operate: "engineer" }), as("admin"));
    fireEvent.click(screen.getByText("Start"));
    expect(host.requestWrite).toHaveBeenCalled();
  });

  it("not signed in, with logins on: only what asks for no role", () => {
    draw(button({ view: "operator" }), as(undefined));
    expect(screen.queryByText("Start")).toBeNull();
    cleanup();
    draw(button(), as(undefined));
    expect(screen.getByText("Start")).toBeTruthy();
  });

  it("a page's access counts for every widget on it", () => {
    draw(button(), as("operator"), { operate: "supervisor" });
    expect(document.querySelector("[data-access='locked']")).toBeTruthy();
    cleanup();
    draw(button(), as("operator"), { view: "supervisor" });
    expect(screen.queryByText("Start")).toBeNull();
  });

  it("a custom widget's access counts for its parts, and a part's own too", () => {
    const pump: CustomWidget = { id: "pump", name: "Pump", params: [], widgets: [
      { localId: "go", type: "button", x: 0, y: 0, w: 2, h: 1, props: { label: "Go" } },
      { localId: "admin", type: "button", x: 2, y: 0, w: 2, h: 1, props: { label: "Reset" }, access: { view: "admin" } },
    ] };
    const placed = { id: "i1", type: "customWidget", x: 0, y: 0, w: 4, h: 1, props: { customWidgetId: "pump" }, access: { operate: "supervisor" } } as Widget;
    draw(placed, as("operator"), undefined, { useCustomWidget: () => pump });
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.queryByText("Reset")).toBeNull();
    expect(document.querySelectorAll("[data-access='locked']").length).toBeGreaterThan(0);
  });
});

describe("the rules", () => {
  it.each([
    ["operator", 1], ["supervisor", 2], ["engineer", 3], ["admin", 4], [undefined, 0], ["guest", 0],
  ] as const)("%s has rank %d", (role, rank) => expect(roleRank(role)).toBe(rank));

  it("security off is an administrator; logins on is the token's role", () => {
    expect(userRank({ loginRequired: false })).toBe(4);
    expect(userRank({ loginRequired: true, role: "supervisor" })).toBe(2);
    expect(userRank({ loginRequired: true })).toBe(0);
  });

  it("operate is never below view, and the outer access counts", () => {
    expect(needInside({ view: 0, operate: 0 }, { view: "engineer" })).toEqual({ view: 3, operate: 3 });
    expect(needInside({ view: 2, operate: 2 }, { operate: "operator" })).toEqual({ view: 2, operate: 2 });
    expect(needInside({ view: 1, operate: 3 }, undefined)).toEqual({ view: 1, operate: 3 });
  });

  it("a page in the navigation", () => {
    expect(canView(as("operator"), { view: "supervisor" })).toBe(false);
    expect(canView(as("supervisor"), { view: "supervisor" })).toBe(true);
    expect(canView({ loginRequired: false }, { view: "admin" })).toBe(true);
  });
});
