// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Page } from "@speths-screens/shared-types";
import { PHONE_WIDTH, PageNav, groupPages, navMode } from "./Nav";

afterEach(cleanup);

const pages: Page[] = [
  { id: "a", name: "Overview", widgets: [], icon: "home" },
  { id: "b", name: "Pumps", widgets: [], group: "Process", icon: "pump" },
  { id: "c", name: "Alarms", widgets: [] },
  { id: "d", name: "Tanks", widgets: [], group: "Process" },
];

describe("navMode", () => {
  it.each([
    [undefined, 1200, "tabs"],
    ["sidebar", 1200, "sidebar"],
    ["toolbar", 800, "toolbar"],
    ["tabs", 800, "tabs"],
    ["sidebar", PHONE_WIDTH - 1, "bottom"],
    [undefined, 390, "bottom"],
    ["toolbar", PHONE_WIDTH, "toolbar"],
  ] as const)("%s at %i px is %s", (nav, width, want) => expect(navMode(nav, width)).toBe(want));
});

describe("groupPages", () => {
  it("keeps a group's pages together at its first page and keeps each page's own index", () => {
    const g = groupPages(pages);
    expect(g.map((x) => x.group)).toEqual([null, "Process", null]);
    expect(g[1]!.items.map((i) => [i.page.id, i.index])).toEqual([["b", 1], ["d", 3]]);
  });
});

describe("PageNav", () => {
  it.each(["tabs", "toolbar", "sidebar", "bottom"] as const)("%s: shows every page and selects by index", (mode) => {
    const onSelect = vi.fn();
    render(<PageNav mode={mode} pages={pages} active={0} onSelect={onSelect} />);
    for (const p of pages) expect(screen.getByText(p.name)).toBeTruthy();
    fireEvent.click(screen.getByText("Tanks"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("marks the current page", () => {
    render(<PageNav mode="sidebar" pages={pages} active={1} onSelect={() => {}} />);
    expect(screen.getByText("Pumps").closest("button")!.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Overview").closest("button")!.getAttribute("aria-current")).toBeNull();
  });

  it("the sidebar shows group headings", () => {
    render(<PageNav mode="sidebar" pages={pages} active={0} onSelect={() => {}} />);
    expect(screen.getByText("Process")).toBeTruthy();
  });

  it("a page with no icon shows its first letter", () => {
    render(<PageNav mode="toolbar" pages={pages} active={0} onSelect={() => {}} />);
    expect(screen.getByText("A")).toBeTruthy(); // Alarms
  });

  it("one page needs no tabs, toolbar or bottom bar", () => {
    for (const mode of ["tabs", "toolbar", "bottom"] as const) {
      const { container } = render(<PageNav mode={mode} pages={[pages[0]!]} active={0} onSelect={() => {}} />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });
});
