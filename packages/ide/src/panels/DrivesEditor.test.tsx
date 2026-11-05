import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Widget } from "@speths-screens/shared-types";
import { useProject, type Project } from "../store/projectStore";
import { virtualTagStore } from "../store/virtualTagStore";
import { DrivesEditor, parseValue } from "./DrivesEditor";

afterEach(cleanup);

const gauge = (more: Partial<Widget> = {}): Widget => ({ id: "w1", type: "gauge", x: 0, y: 0, w: 2, h: 2, ...more });

function draw(w: Widget) {
  const onChange = vi.fn();
  render(<DrivesEditor w={w} onChange={onChange} />);
  return onChange;
}

describe("DrivesEditor", () => {
  it("offers only the properties the widget type can drive, and not those already driven", () => {
    draw(gauge({ dynamics: { bgColor: { expr: "1" } } }));
    const options = [...screen.getByLabelText("Drive a property").querySelectorAll("option")].map((o) => o.value).filter(Boolean);
    expect(options).toContain("min");
    expect(options).not.toContain("bgColor");
    expect(options).not.toContain("staticText");
  });

  it("adds a driven property", () => {
    const onChange = draw(gauge());
    fireEvent.change(screen.getByLabelText("Drive a property"), { target: { value: "min" } });
    expect(onChange).toHaveBeenCalledWith({ min: { expr: "" } });
  });

  it("edits the expression and shows why it does not compile", () => {
    const onChange = draw(gauge({ dynamics: { min: { expr: "1 +" } } }));
    expect(screen.getByText("unexpected end of expression")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("min expression"), { target: { value: "{ns:Low}" } });
    expect(onChange).toHaveBeenCalledWith({ min: { expr: "{ns:Low}" } });
  });

  it("picks a transform and edits it", () => {
    const onChange = draw(gauge({ dynamics: { rotate: { expr: "value" } } }));
    fireEvent.change(screen.getByLabelText("rotate transform"), { target: { value: "linear" } });
    expect(onChange).toHaveBeenLastCalledWith({ rotate: { expr: "value", transform: { kind: "linear", in: [0, 100], out: [0, 100] } } });
  });

  it("edits threshold steps with typed values", () => {
    const onChange = draw(gauge({ dynamics: { bgColor: { expr: "value", transform: { kind: "thresholds", steps: [{ above: 80, value: "#d97706" }] } } } }));
    fireEvent.change(screen.getByLabelText("step 1 from"), { target: { value: "90" } });
    expect(onChange).toHaveBeenLastCalledWith({ bgColor: { expr: "value", transform: { kind: "thresholds", steps: [{ above: 90, value: "#d97706" }] } } });
  });

  it("removing the last driven property clears dynamics", () => {
    const onChange = draw(gauge({ dynamics: { min: { expr: "1" } } }));
    fireEvent.click(screen.getByLabelText("Stop driving min"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it.each([["true", true], ["false", false], ["12.5", 12.5], ["#f00", "#f00"], ["", ""], [" ", " "]])("parseValue(%j)", (text, want) =>
    expect(parseValue(text)).toBe(want));
});

describe("live preview", () => {
  // Tags of a virtual datasource ("sim:") come from virtualTagStore.
  const project = (): Project => ({
    schemaVersion: 5, version: "1", pages: [{ id: "p1", name: "Main", widgets: [] }],
    datasources: [{ id: "sim", type: "virtual", label: "Sim", config: { tags: [] } }],
  });
  beforeEach(() => useProject.getState().loadProject(project()));
  const steps = { kind: "thresholds" as const, steps: [{ above: 80, value: "#dc2626" }], below: "#3f3f46" };
  const preview = () => screen.getByTestId("drive-preview").textContent;

  it("shows the expression's value, the transform's result and the property", () => {
    act(() => virtualTagStore.set("sim:L", 97));
    draw(gauge({ dynamics: { bgColor: { expr: "{sim:L}", transform: steps } } }));
    expect(preview()).toBe("now 97→ '#dc2626'→ bgColor = '#dc2626'");
    act(() => virtualTagStore.set("sim:L", 20));
    expect(preview()).toBe("now 20→ '#3f3f46'→ bgColor = '#3f3f46'");
  });

  it("says so when the result is unknown", () => {
    act(() => virtualTagStore.set("sim:L", 97, "Bad", "no answer"));
    draw(gauge({ dynamics: { bgColor: { expr: "{sim:L}", transform: steps } } }));
    expect(preview()).toBe("now unknown: input {sim:L} is Bad; bgColor keeps its own setting");
  });

  it("says so when the value does not suit the property", () => {
    act(() => virtualTagStore.set("sim:L", 97));
    draw(gauge({ dynamics: { bgColor: { expr: "{sim:L} * 2" } } }));
    expect(preview()).toBe("now 194; not a color for bgColor, which keeps its own setting");
  });

  it("reads value as the widget's tag", () => {
    act(() => virtualTagStore.set("sim:T", 25));
    draw(gauge({ bindings: { value: "sim:T" }, dynamics: { label: { expr: "value > 20 ? 'hot' : 'cold'" } } }));
    expect(preview()).toBe("now 'hot'→ label = 'hot'");
  });

  it("offers a color swatch for color properties only", () => {
    draw(gauge({ dynamics: { bgColor: { expr: "1", transform: steps }, min: { expr: "1", transform: { kind: "map", cases: [{ equals: 1, value: 0 }] } } } }));
    expect(within(screen.getByTestId("drive-bgColor")).getByLabelText("step 1 value color")).toBeTruthy();
    expect(within(screen.getByTestId("drive-min")).queryByLabelText("case 1 value color")).toBeNull();
  });
});
