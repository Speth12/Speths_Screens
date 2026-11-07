import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProject, type Project } from "../store/projectStore";
import { useEditorView } from "../store/editorView";
import { PositionEditor } from "../panels/Canvas";
import { DeviceSwitch } from "../panels/DeviceSwitch";

afterEach(cleanup);

const project = (): Project => ({
  schemaVersion: 6, version: "1", datasources: [],
  pages: [{ id: "p1", name: "Main", widgets: [
    { id: "a", type: "led", x: 4, y: 2, w: 6, h: 3 } as never,
    { id: "b", type: "led", x: 0, y: 0, w: 2, h: 2 } as never,
  ] }],
});
const widget = (id = "a") => useProject.getState().project.pages[0]!.widgets.find((w) => w.id === id)!;

beforeEach(() => { useProject.getState().loadProject(project()); useEditorView.setState({ device: "desktop" }); });

describe("editing a screen size", () => {
  it("on the desktop a move is the widget's own x and y", () => {
    useProject.getState().updateWidget("p1", "a", { x: 7 });
    expect(widget()).toMatchObject({ x: 7, y: 2 });
    expect(widget().layout).toBeUndefined();
  });

  it("on a phone a move and a resize go into the phone layout and the desktop is untouched", () => {
    useEditorView.getState().setDevice("phone");
    useProject.getState().updateWidget("p1", "a", { x: 0, y: 5, w: 4 });
    expect(widget()).toMatchObject({ x: 4, y: 2, w: 6, h: 3, layout: { phone: { x: 0, y: 5, w: 4 } } });
  });

  it("settings changed on a phone are the widget's own, not a layout", () => {
    useEditorView.getState().setDevice("phone");
    useProject.getState().updateWidget("p1", "a", { props: { label: "Run" } });
    expect(widget()).toMatchObject({ props: { label: "Run" } });
    expect(widget().layout).toBeUndefined();
  });

  it("moving several widgets at once on a tablet stores each one's tablet layout", () => {
    useEditorView.getState().setDevice("tablet");
    useProject.getState().updateWidgets("p1", [{ id: "a", patch: { x: 1 } }, { id: "b", patch: { y: 4 } }]);
    expect(widget("a").layout).toEqual({ tablet: { x: 1 } });
    expect(widget("b").layout).toEqual({ tablet: { y: 4 } });
  });

  it("putting a field back to what the larger layout has removes it", () => {
    useEditorView.getState().setDevice("tablet");
    useProject.getState().updateWidget("p1", "a", { x: 1 });
    useProject.getState().updateWidget("p1", "a", { x: 4 });
    expect(widget().layout).toBeUndefined();
  });

  it("hide, show and follow the larger layout", () => {
    useEditorView.getState().setDevice("phone");
    useProject.getState().setWidgetHidden("p1", "a", true);
    expect(widget().layout).toEqual({ phone: { hidden: true } });
    useProject.getState().updateWidget("p1", "a", { x: 0 });
    useProject.getState().resetWidgetLayout("p1", "a");
    expect(widget().layout).toBeUndefined();
  });

  it("hiding does nothing on the desktop", () => {
    useProject.getState().setWidgetHidden("p1", "a", true);
    expect(widget().layout).toBeUndefined();
  });

  it("is undoable", () => {
    useEditorView.getState().setDevice("phone");
    useProject.getState().updateWidget("p1", "a", { x: 0 });
    useProject.getState().undo();
    expect(widget().layout).toBeUndefined();
  });
});

describe("DeviceSwitch and the position fields", () => {
  it("switching size shows where the widget sits there", () => {
    useProject.getState().updateWidget("p1", "a", { x: 4 });
    useEditorView.getState().setDevice("phone");
    useProject.getState().updateWidget("p1", "a", { x: 0, w: 4 });
    useEditorView.getState().setDevice("desktop");
    render(<><DeviceSwitch /><PositionEditor pageId="p1" widgetId="a" /></>);
    const field = (k: string) => (screen.getByText(k, { selector: "span" }).nextElementSibling as HTMLInputElement).value;
    expect([field("x"), field("w")]).toEqual(["4", "6"]);
    fireEvent.click(screen.getByText("Phone"));
    expect([field("x"), field("w")]).toEqual(["0", "4"]);
    expect(screen.getByText(/Editing the phone layout/)).toBeTruthy();
  });

  it("typing a position on a phone stores a phone layout, and Hide and Follow work", () => {
    render(<><DeviceSwitch /><PositionEditor pageId="p1" widgetId="a" /></>);
    fireEvent.click(screen.getByText("Phone"));
    expect(screen.getByText(/follows the larger layout until you change it/)).toBeTruthy();
    fireEvent.change(screen.getByText("y", { selector: "span" }).nextElementSibling!, { target: { value: "9" } });
    expect(widget().layout).toEqual({ phone: { y: 9 } });
    fireEvent.click(screen.getByLabelText("Hide on phone"));
    expect(widget().layout).toEqual({ phone: { y: 9, hidden: true } });
    fireEvent.click(screen.getByText("Follow the larger layout"));
    expect(widget().layout).toBeUndefined();
  });

  it("the desktop has no hide box", () => {
    render(<PositionEditor pageId="p1" widgetId="a" />);
    expect(screen.queryByText(/Hide on/)).toBeNull();
  });
});
