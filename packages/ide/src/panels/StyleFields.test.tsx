import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject } from "../store/projectStore";
import { validateProject } from "../store/validateProject";
import { StyleFields, StyleLibrary, styleId, styleUses } from "./StyleFields";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => useProject.getState().newProject());

type Props = Record<string, unknown>;

describe("a widget's named style", () => {
  it("a new style keeps the widget's look under a name, and the widget then follows it", () => {
    vi.spyOn(window, "prompt").mockReturnValue("KPI card");
    let props: Props | undefined = { label: "Flow", bgColor: "#102030", fontWeight: 700 };
    render(<StyleFields props={props} onChange={(p) => { props = p; }} />);
    fireEvent.click(screen.getByRole("button", { name: "New style from this look…" }));
    expect(useProject.getState().project.styles).toEqual([{ id: "kpi-card", name: "KPI card", props: { bgColor: "#102030", fontWeight: 700 } }]);
    expect(props).toEqual({ label: "Flow", styleId: "kpi-card" });
  });

  it("choosing a style gives it to the widget; choosing none keeps its look in the widget", () => {
    useProject.getState().setStyles([{ id: "kpi", name: "KPI card", props: { bgColor: "#102030" } }]);
    let props: Props | undefined = { label: "Flow", bgColor: "transparent" };
    const { rerender } = render(<StyleFields props={props} onChange={(p) => { props = p; }} />);
    fireEvent.change(screen.getByLabelText("Named style"), { target: { value: "kpi" } });
    expect(props).toEqual({ label: "Flow", styleId: "kpi" });
    rerender(<StyleFields props={props} onChange={(p) => { props = p; }} />);
    fireEvent.change(screen.getByLabelText("Named style"), { target: { value: "" } });
    expect(props).toEqual({ label: "Flow", bgColor: "#102030" });
  });

  it("a widget's own change can be written into the style", () => {
    useProject.getState().setStyles([{ id: "kpi", name: "KPI card", props: { bgColor: "#102030" } }]);
    let props: Props | undefined = { styleId: "kpi", textColor: "#ffffff" };
    render(<StyleFields props={props} onChange={(p) => { props = p; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Update the style" }));
    expect(useProject.getState().project.styles![0]!.props).toEqual({ bgColor: "#102030", textColor: "#ffffff" });
    expect(props).toEqual({ styleId: "kpi" });
  });

  it("ids are made from the name and never repeat", () => {
    expect(styleId("KPI card", [])).toBe("kpi-card");
    expect(styleId("KPI card", ["kpi-card"])).toBe("kpi-card-2");
    expect(styleId("!!!", [])).toBe("style");
  });
});

describe("the project's styles", () => {
  it("counts the widgets that use a style, renames it and removes it", () => {
    const s = useProject.getState();
    s.setStyles([{ id: "kpi", name: "KPI card", props: { bgColor: "#102030" } }]);
    const page = useProject.getState().project.pages[0]!;
    s.addWidget(page.id, { id: "a", type: "numericDisplay", x: 0, y: 0, w: 100, h: 60, props: { styleId: "kpi" } } as never);
    expect(styleUses(useProject.getState().project, "kpi")).toBe(1);
    expect(validateProject(useProject.getState().project)).toEqual([]);
    render(<StyleLibrary />);
    expect(screen.getByText("1 use")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name of kpi"), { target: { value: "Big number" } });
    expect(useProject.getState().project.styles![0]!.name).toBe("Big number");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("Remove Big number"));
    expect(useProject.getState().project.styles).toBeUndefined();
  });
});
