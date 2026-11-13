// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@speths-screens/shared-types";
import { DEFAULT_IDS } from "@speths-screens/widgets";
import { useProject } from "../store/projectStore";
import { ChromeSettings } from "./ChromeSettings";
import { Properties } from "./Properties";

afterEach(cleanup);
beforeEach(() => useProject.getState().loadProject({
  schemaVersion: 7, version: "1", datasources: [],
  images: [{ id: "img1", name: "Company logo", mimeType: "image/png", width: 1, height: 1, size: 3, dataUrl: "data:image/png;base64,AAAA" }],
  pages: [{ id: "p1", name: "Main", widgets: [] }, { id: "p2", name: "Alarms", widgets: [] }],
} as unknown as Project));

const shell = () => useProject.getState().project.shell;
const check = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the built-in header's choices", () => {
  it("shows them for a built-in project and for custom chrome alike", () => {
    render(<ChromeSettings />);
    expect(screen.getByTestId("chrome-options")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Custom/ }));
    expect(screen.getByTestId("chrome-options")).toBeTruthy();
  });

  it("on a header held as custom widgets, a choice changes them and keeps what was added by hand", () => {
    useProject.getState().newProject({ chrome: "custom" });
    const headerOf = () => useProject.getState().project.customWidgets!.find((c) => c.id === "cw-header")!;
    const mine = { localId: "my-logo", type: "image", x: 500, y: 8, w: 96, h: 44, props: {} } as (ReturnType<typeof headerOf>)["widgets"][number];
    useProject.setState((s) => ({ project: { ...s.project, customWidgets: s.project.customWidgets!.map((c) => (c.id === "cw-header" ? { ...c, widgets: [...c.widgets, mine] } : c)) } }));
    render(<ChromeSettings />);
    expect(screen.getByRole("button", { name: "Edit the header on the canvas" })).toBeTruthy();
    choose("Clock", "none");
    fireEvent.click(check("Active alarm count"));
    const ids = headerOf().widgets.map((w) => w.localId);
    expect(ids).not.toContain("clock");
    expect(ids).toContain("alarms");
    expect(headerOf().widgets.find((w) => w.localId === "my-logo")).toEqual(mine);
    choose("Header preset", "minimal");
    expect(headerOf().widgets.map((w) => w.localId).sort()).toEqual(["my-logo", "page", "user"]);
  });

  it("starts as the header always was, and stores nothing until something changes", () => {
    render(<ChromeSettings />);
    for (const on of ["Project name", "Page name", "User menu", "Weekday", "Page icons", "Settings entry"]) expect(check(on).checked).toBe(true);
    for (const off of ["Page icon", "Names centered", "Active alarm count"]) expect(check(off).checked).toBe(false);
    expect(shell()).toBeUndefined();
  });

  it("each switch stores only what differs from the default, and switching back removes it", () => {
    render(<ChromeSettings />);
    fireEvent.click(check("Project name"));
    fireEvent.click(check("Page icon"));
    fireEvent.click(check("Names centered"));
    choose("Datasource connections", "none");
    choose("Clock", "none");
    expect(shell()).toEqual({ header: { showProjectName: false, pageIcon: true, titleAlign: "center", drivers: "none", clock: "none" } });
    expect(screen.queryByRole("checkbox", { name: "Weekday" })).toBeNull(); // no clock, no weekday
    fireEvent.click(check("Project name"));
    fireEvent.click(check("Page icon"));
    fireEvent.click(check("Names centered"));
    choose("Datasource connections", "full");
    choose("Clock", "timeSeconds");
    expect(shell()).toBeUndefined();
  });

  it("the logo: letters, a picture from the project, or none", () => {
    render(<ChromeSettings />);
    fireEvent.change(screen.getByLabelText("Letters"), { target: { value: "PX" } });
    expect(shell()).toEqual({ header: { logoText: "PX" } });
    choose("Logo", "image");
    expect(screen.getByRole("status").textContent).toMatch(/Choose a picture/);
    choose("Picture", "img1");
    expect(shell()?.header).toMatchObject({ logo: "image", logoImage: "img1" });
    expect(screen.queryByRole("status")).toBeNull();
    choose("Logo", "none");
    expect(shell()?.header?.logo).toBe("none");
  });

  it("the alarm count asks which page it opens", () => {
    render(<ChromeSettings />);
    expect(screen.queryByLabelText("A click on the alarm count opens")).toBeNull();
    fireEvent.click(check("Active alarm count"));
    expect(screen.getByRole("status").textContent).toMatch(/does nothing when clicked/);
    choose("A click on the alarm count opens", "p2");
    expect(shell()).toEqual({ header: { alarms: true, alarmsPage: "p2" } });
  });

  it("the height is held between 32 and 200, and blank is the default", () => {
    render(<ChromeSettings />);
    const height = screen.getByLabelText("Height (px)");
    fireEvent.change(height, { target: { value: "80" } });
    expect(shell()?.header?.height).toBe(80);
    fireEvent.change(height, { target: { value: "5" } });
    expect(shell()?.header?.height).toBe(32);
    fireEvent.change(height, { target: { value: "" } });
    expect(shell()).toBeUndefined();
  });

  it("the look: colors, font, size and bold, with a warning for text that is hard to read", () => {
    render(<ChromeSettings />);
    const look = within(screen.getByRole("group", { name: "Header look" }));
    fireEvent.change(look.getByLabelText("Background"), { target: { value: "#ffffff" } });
    fireEvent.change(look.getByLabelText("Text"), { target: { value: "#aaaaaa" } });
    fireEvent.change(look.getByLabelText("Font"), { target: { value: "roboto" } });
    fireEvent.change(look.getByLabelText("Text size"), { target: { value: "large" } });
    fireEvent.click(look.getByRole("checkbox", { name: "Bold" }));
    expect(shell()).toEqual({ header: { style: { background: "#ffffff", textColor: "#aaaaaa", font: "roboto", fontSize: "large", bold: true } } });
    expect(screen.getByRole("status").textContent).toMatch(/header text is hard to read/);
    fireEvent.change(look.getByLabelText("Text"), { target: { value: "#111111" } });
    expect(screen.queryByRole("status")).toBeNull();
    // A theme token is taken as written.
    fireEvent.change(look.getByLabelText("Background"), { target: { value: "token:alarm-info" } });
    expect(shell()?.header?.style?.background).toBe("token:alarm-info");
  });
});

describe("the built-in navigation's choices", () => {
  it("the style, with a sidebar's own choices only for a sidebar", () => {
    render(<ChromeSettings />);
    expect(screen.queryByLabelText("Sidebar width (px)")).toBeNull();
    choose("Pages are offered as", "sidebar");
    expect(shell()).toEqual({ nav: "sidebar" });
    fireEvent.change(screen.getByLabelText("Sidebar width (px)"), { target: { value: "260" } });
    fireEvent.click(check("Icons only on a tablet"));
    expect(shell()).toEqual({ nav: "sidebar", navOptions: { width: 260, tabletIcons: true } });
    choose("Pages are offered as", "tabs");
    expect(shell()?.nav).toBeUndefined();
  });

  it("none hides the navigation's other choices and says what that means", () => {
    render(<ChromeSettings />);
    choose("Pages are offered as", "none");
    expect(screen.queryByRole("checkbox", { name: "Page icons" })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/every page needs a button/);
  });

  it("hiding the Settings entry warns what operators lose", () => {
    render(<ChromeSettings />);
    fireEvent.click(check("Settings entry"));
    expect(shell()).toEqual({ navOptions: { showSettings: false } });
    expect(screen.getByRole("status").textContent).toMatch(/cannot change the language/);
  });

  it("the current page's colors", () => {
    render(<ChromeSettings />);
    const look = within(screen.getByRole("group", { name: "Navigation look" }));
    fireEvent.change(look.getByLabelText("Current page background"), { target: { value: "#f59e0b" } });
    expect(shell()).toEqual({ navOptions: { style: { activeBackground: "#f59e0b" } } });
    // The header's look has no such colors.
    expect(within(screen.getByRole("group", { name: "Header look" })).queryByLabelText("Current page background")).toBeNull();
  });
});

describe("turning the built-in ones into custom chrome", () => {
  it("copies the header as the choices made it", () => {
    render(<ChromeSettings />);
    choose("Clock", "none");
    fireEvent.click(screen.getByRole("radio", { name: /Custom/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add the default header and navigation" }));
    const header = useProject.getState().project.customWidgets!.find((c) => c.id === DEFAULT_IDS.header)!;
    expect(header.widgets.map((w) => w.localId)).toEqual(["logo", "titles", "drivers", "user"]);
  });
});

describe("a page kept out of the navigation", () => {
  it("is a switch in the page's properties", () => {
    useProject.getState().selectWidget(null);
    render(<Properties />);
    const box = screen.getByRole("checkbox", { name: /Leave out of the navigation/ });
    fireEvent.click(box);
    expect(useProject.getState().project.pages[0]!.hideInNav).toBe(true);
    fireEvent.click(box);
    expect(useProject.getState().project.pages[0]!.hideInNav).toBeUndefined();
  });
});

describe("editing the built-in header and navigation as custom widgets", () => {
  it("turns them into designed custom widgets with the choices, switches to custom, and opens the header on the canvas", () => {
    render(<ChromeSettings />);
    choose("Clock", "none");
    fireEvent.click(screen.getByRole("button", { name: "Edit as custom widgets on the canvas" }));
    const p = useProject.getState().project;
    expect(p.shell?.chrome).toBe("custom");
    expect(p.shell?.frame?.map((s) => s.id)).toEqual(["header", "nav", "bottom-nav"]);
    const header = p.customWidgets!.find((c) => c.id === DEFAULT_IDS.header)!;
    expect([header.width, header.height]).toEqual([1280, 60]);
    expect(header.widgets.map((w) => w.localId)).not.toContain("clock");
    expect(useProject.getState().activePageId).toBe(`cw:${DEFAULT_IDS.header}`);
    // One step back undoes it.
    useProject.getState().undo();
    expect(useProject.getState().project.shell?.chrome).toBeUndefined();
  });

  it("each slot of custom chrome can be edited on the canvas and laid over the page", () => {
    useProject.getState().editChromeAsCustom();
    useProject.getState().closeCustomWidgetCanvas();
    render(<ChromeSettings />);
    fireEvent.click(screen.getByRole("checkbox", { name: "header over the page" }));
    expect(useProject.getState().project.shell?.frame?.find((s) => s.id === "header")?.overlay).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "header over the page" }));
    expect(useProject.getState().project.shell?.frame?.find((s) => s.id === "header")).not.toHaveProperty("overlay");
    fireEvent.click(screen.getByRole("button", { name: "Edit nav on the canvas" }));
    expect(useProject.getState().activePageId).toBe(`cw:${DEFAULT_IDS.tabNav}`);
  });
});
