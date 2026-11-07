// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "../store/projectStore";
import { defaultCustomWidgets } from "@speths-screens/widgets";
import { ChromeSettings, withDevice, withOverride } from "./ChromeSettings";
import { NewProjectDialog } from "./NewProjectDialog";

afterEach(cleanup);
beforeEach(() => useProject.getState().newProject());

describe("new project dialog", () => {
  it("offers built-in first and creates what is chosen", () => {
    const onCreate = vi.fn();
    render(<NewProjectDialog onCreate={onCreate} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenLastCalledWith("builtin");
    fireEvent.click(screen.getByLabelText(/Custom, from widgets/));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenLastCalledWith("custom");
  });
});

describe("new project in the store", () => {
  it("a built-in project has no frame", () => {
    useProject.getState().newProject({ chrome: "builtin" });
    expect(useProject.getState().project.shell).toBeUndefined();
    expect(useProject.getState().project.customWidgets).toBeUndefined();
  });

  it("a custom project starts with the default header and navigation", () => {
    useProject.getState().newProject({ chrome: "custom" });
    const p = useProject.getState().project;
    expect(p.shell?.chrome).toBe("custom");
    expect(p.shell?.frame?.map((s) => s.id)).toEqual(["header", "nav", "bottom-nav"]);
    expect(p.customWidgets?.map((c) => c.name)).toContain("Project header");
  });

  it("adding the defaults to an existing project switches it to custom, once", () => {
    useProject.getState().addDefaultChrome();
    useProject.getState().addDefaultChrome();
    const p = useProject.getState().project;
    expect(p.shell?.chrome).toBe("custom");
    expect(p.shell?.frame).toHaveLength(3);
    expect(p.customWidgets).toHaveLength(defaultCustomWidgets().length);
  });
});

describe("ChromeSettings", () => {
  it("built-in shows no slots; choosing custom shows the slot list and the defaults button", () => {
    render(<ChromeSettings />);
    expect(screen.queryByText("+ Add slot")).toBeNull();
    fireEvent.click(screen.getByLabelText(/^Custom/));
    expect(useProject.getState().project.shell?.chrome).toBe("custom");
    expect(screen.getByText("No slots yet: the screen shows only the page.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add the default header and navigation" }));
    expect(screen.getByTestId("slot-header")).toBeTruthy();
    expect(screen.getByTestId("slot-bottom-nav")).toBeTruthy();
  });

  it("edits a slot's edge, size and the sizes it is drawn on", () => {
    useProject.getState().newProject({ chrome: "custom" });
    render(<ChromeSettings />);
    fireEvent.change(screen.getByLabelText("nav edge"), { target: { value: "right" } });
    fireEvent.change(screen.getByLabelText("nav size"), { target: { value: "240" } });
    fireEvent.click(screen.getByLabelText("nav on phone"));
    fireEvent.change(screen.getByLabelText("nav tablet size"), { target: { value: "120" } });
    const nav = useProject.getState().project.shell!.frame!.find((s) => s.id === "nav")!;
    expect(nav).toMatchObject({ edge: "right", size: 240, tablet: { size: 120 } });
    expect(nav.devices).toBeUndefined(); // desktop, tablet and phone: all of them
  });

  it("removes a slot", () => {
    useProject.getState().newProject({ chrome: "custom" });
    render(<ChromeSettings />);
    fireEvent.click(screen.getByLabelText("Remove header"));
    expect(useProject.getState().project.shell!.frame!.map((s) => s.id)).toEqual(["nav", "bottom-nav"]);
  });
});

describe("slot edits", () => {
  const slot = { id: "s", customWidgetId: "c", edge: "top" as const, size: 60 };

  it("an override with nothing left is removed", () => {
    const withIt = withOverride(slot, "phone", { size: 52 });
    expect(withIt.phone).toEqual({ size: 52 });
    expect(withOverride(withIt, "phone", { size: undefined })).toEqual(slot);
  });

  it("all sizes listed means all, so the list is dropped", () => {
    const some = withDevice(slot, "phone", false);
    expect(some.devices).toEqual(["desktop", "tablet"]);
    expect(withDevice(some, "phone", true)).toEqual(slot);
  });
});
