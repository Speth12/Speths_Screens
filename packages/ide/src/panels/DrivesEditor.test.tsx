import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Widget } from "@speths-screens/shared-types";
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
