import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MANIFESTS, FRAME_SETTINGS, type Field } from "@speths-screens/widgets";
import type { Project, Widget } from "@speths-screens/shared-types";
import { SettingsFields, fieldValue, parseValue } from "./SettingsEditor";
import { Properties, usePropertyTab } from "./Properties";
import { useProject } from "../store/projectStore";

afterEach(() => { cleanup(); usePropertyTab.setState({ tab: "settings" }); });
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));

const w = { id: "w1", type: "gauge", x: 0, y: 0, w: 4, h: 3 } as Widget;

function draw(fields: Field[], config: Record<string, unknown> = {}) {
  const set = vi.fn();
  render(<SettingsFields fields={fields} config={config} set={set} w={w} />);
  return set;
}

describe("field kinds", () => {
  it("number: a value, and blank clears it", () => {
    const set = draw([{ key: "min", label: "Min", kind: "number", blank: "auto" }], { min: 5 });
    fireEvent.change(screen.getByLabelText("Min"), { target: { value: "12.5" } });
    expect(set).toHaveBeenLastCalledWith("min", 12.5);
    fireEvent.change(screen.getByLabelText("Min"), { target: { value: "" } });
    expect(set).toHaveBeenLastCalledWith("min", undefined);
  });

  it("text: shows the default, empty clears", () => {
    const set = draw([{ key: "trueLabel", label: "ON label", kind: "text", default: "ON" }]);
    expect((screen.getByLabelText("ON label") as HTMLInputElement).value).toBe("ON");
    fireEvent.change(screen.getByLabelText("ON label"), { target: { value: "" } });
    expect(set).toHaveBeenLastCalledWith("trueLabel", undefined);
  });

  it.each([["1", 1], ["-2.5", -2.5], ["open", "open"], ["", ""]])("value parses %j as %j", (s, want) => {
    expect(parseValue(s)).toBe(want);
  });

  it("boolean: the default shows, a click stores it", () => {
    const set = draw([{ key: "showQuality", label: "Quality", kind: "boolean", default: true }]);
    const box = screen.getByLabelText("Quality") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(set).toHaveBeenLastCalledWith("showQuality", false);
  });

  it("optional color: default, none and custom", () => {
    const fields: Field[] = [{ key: "bgColor", label: "Background", kind: "color", optional: true, none: "transparent", default: "#1c1c1e" }];
    const set = draw(fields);
    fireEvent.click(screen.getByText("none"));
    expect(set).toHaveBeenLastCalledWith("bgColor", "transparent");
    fireEvent.click(screen.getByText("custom"));
    expect(set).toHaveBeenLastCalledWith("bgColor", "#1c1c1e");
    cleanup();
    const set2 = draw(fields, { bgColor: "#123456" });
    fireEvent.click(screen.getByText("default"));
    expect(set2).toHaveBeenLastCalledWith("bgColor", undefined);
  });

  it("choice: buttons, select and swatches", () => {
    const set = draw([
      { key: "action", label: "Action", kind: "choice", default: "write", options: [{ value: "write" }, { value: "navigate" }] },
      { key: "xFormat", label: "X-axis", kind: "choice", display: "select", default: "time", options: [{ value: "time" }, { value: "relative" }] },
      { key: "btnColor", label: "Color", kind: "choice", display: "swatches", default: "blue", options: [{ value: "blue", swatch: "#00f" }, { value: "red", swatch: "#f00" }] },
    ]);
    fireEvent.click(screen.getByText("navigate"));
    expect(set).toHaveBeenLastCalledWith("action", "navigate");
    fireEvent.change(screen.getByLabelText("X-axis"), { target: { value: "relative" } });
    expect(set).toHaveBeenLastCalledWith("xFormat", "relative");
    fireEvent.click(screen.getByLabelText("Color red"));
    expect(set).toHaveBeenLastCalledWith("btnColor", "red");
  });

  it("showIf hides a field", () => {
    const fields: Field[] = [{ key: "navigateTo", label: "Target page", kind: "page", showIf: (c) => c.action === "navigate" }];
    draw(fields, { action: "write" });
    expect(screen.queryByLabelText("Target page")).toBeNull();
    cleanup();
    draw(fields, { action: "navigate" });
    expect(screen.getByLabelText("Target page")).toBeTruthy();
  });

  it("alias: the old key is read while the new one is unset", () => {
    const f: Field = { key: "fit", label: "Fit", kind: "choice", display: "select", alias: "objectFit", options: [] };
    expect(fieldValue(f, { objectFit: "cover" })).toBe("cover");
    expect(fieldValue(f, { fit: "fill", objectFit: "cover" })).toBe("fill");
  });

  it("list: seeds from the widget, adds, edits and removes items", () => {
    const fields = MANIFESTS.find((m) => m.type === "trend")!.settings.filter((f) => f.key === "tags");
    const set = vi.fn();
    render(<SettingsFields fields={fields} config={{}} set={set} w={{ ...w, bindings: { value: "plc:T" } }} />);
    // Seeded with the widget's value tag as series 0.
    expect((screen.getAllByPlaceholderText("ns:plant.tag or datasource:path")[0] as HTMLInputElement).value).toBe("plc:T");
    fireEvent.click(screen.getByText("+ add"));
    expect(set).toHaveBeenLastCalledWith("tags", [{ binding: "plc:T", color: "#3b82f6" }, { binding: "", color: "#22c55e", label: "" }]);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Temp" } });
    expect(set).toHaveBeenLastCalledWith("tags", [{ binding: "plc:T", color: "#3b82f6", label: "Temp" }]);
    fireEvent.click(screen.getByLabelText("Remove Series 1"));
    expect(set).toHaveBeenLastCalledWith("tags", []);
  });
});

describe("properties panel", () => {
  const project = (widgets: Widget[]): Project => ({
    schemaVersion: 7, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets }],
  });

  for (const m of MANIFESTS) {
    it(`${m.type}: opens with its settings and the frame settings`, () => {
      const wid = { id: "x", type: m.type, x: 0, y: 0, w: 2, h: 2 } as Widget;
      useProject.getState().loadProject(project([wid]));
      useProject.getState().selectWidget("x");
      render(<Properties />);
      if (m.settings.length) expect(screen.getByText(`${m.label} settings`)).toBeTruthy();
      expect(!!screen.queryByText("Drag tag from browser → widget")).toBe(m.bindings.length > 0);
      openTab("Look");
      for (const g of FRAME_SETTINGS) expect(screen.getByText(g.title)).toBeTruthy();
    });
  }

  it("an edit lands in the widget's props, and clearing the last one removes props", () => {
    const wid = { id: "x", type: "historyLog", x: 0, y: 0, w: 2, h: 2, props: { pageSize: 100 } } as Widget;
    useProject.getState().loadProject(project([wid]));
    useProject.getState().selectWidget("x");
    render(<Properties />);
    const props = () => useProject.getState().project.pages[0]!.widgets[0]!.props;
    fireEvent.change(screen.getByLabelText("Rows to fetch"), { target: { value: "250" } });
    expect(props()).toEqual({ pageSize: 250 });
    fireEvent.change(screen.getByLabelText("Rows to fetch"), { target: { value: "" } });
    expect(props()).toBeUndefined();
  });

  it("Plain takes the card away in one step, and Card gives it back", () => {
    const wid = { id: "x", type: "numericDisplay", x: 0, y: 0, w: 2, h: 2, props: { unit: "bar" } } as Widget;
    useProject.getState().loadProject(project([wid]));
    useProject.getState().selectWidget("x");
    render(<Properties />);
    openTab("Look");
    const props = () => useProject.getState().project.pages[0]!.widgets[0]!.props;
    expect(screen.getByRole("button", { name: "Card" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(props()).toEqual({ unit: "bar", bgColor: "transparent", borderColor: "transparent", showLabel: false });
    expect(screen.getByRole("button", { name: "Plain" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(props()).toEqual({ unit: "bar" });
  });

  it.each(["pipe", "shape"])("a %s is always a drawing: no Card or Plain switch", (type) => {
    useProject.getState().loadProject(project([{ id: "x", type, x: 0, y: 0, w: 2, h: 2 } as Widget]));
    useProject.getState().selectWidget("x");
    render(<Properties />);
    expect(screen.queryByRole("button", { name: "Plain" })).toBeNull();
  });
});

describe("the properties' tabs", () => {
  const project = (widgets: Widget[]): Project => ({
    schemaVersion: 7, version: "0.1.0", datasources: [], pages: [{ id: "p1", name: "Main", widgets }],
  });
  const two = [
    { id: "a", type: "button", x: 0, y: 0, w: 2, h: 1, events: { onClick: [{ type: "write", value: 1 }, { type: "navigate", page: "p1" }] } },
    { id: "b", type: "numericDisplay", x: 3, y: 0, w: 2, h: 1, dynamics: { bgColor: { expr: "1" } }, access: { view: "admin" } },
  ] as unknown as Widget[];

  it("splits the widget into Settings, Actions, Dynamics, Look and Access, Settings first", () => {
    useProject.getState().loadProject(project(two));
    useProject.getState().selectWidget("a");
    render(<Properties />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Settings", "Actions 2", "Dynamics", "Look", "Access"]);
    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("On click")).toBeNull();
    openTab("Actions");
    expect(screen.getByText("On click")).toBeTruthy();
  });

  it("each tab shows only its own part, and its count says what is set there", () => {
    useProject.getState().loadProject(project(two));
    useProject.getState().selectWidget("b");
    render(<Properties />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Settings", "Actions", "Dynamics 1", "Look", "Access 1"]);
    openTab("Access");
    expect(screen.getByRole("group", { name: "Who can use this widget" })).toBeTruthy();
    expect(screen.queryByText("Appearance")).toBeNull();
  });

  it("the tab in front stays while another widget is selected", () => {
    useProject.getState().loadProject(project(two));
    useProject.getState().selectWidget("a");
    render(<Properties />);
    openTab("Look");
    act(() => useProject.getState().selectWidget("b"));
    expect(screen.getByRole("tab", { name: "Look" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Appearance")).toBeTruthy();
  });
});
