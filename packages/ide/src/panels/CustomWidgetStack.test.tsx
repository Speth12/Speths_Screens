// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomWidgetLayout, CustomWidgetPart } from "@speths-screens/shared-types";
import { LayoutStrip, PartFlexFields, StackPreview } from "./CustomWidgetStack";

afterEach(cleanup);

const part = (id: string, extra: Partial<CustomWidgetPart> = {}): CustomWidgetPart => ({ localId: id, type: "led", x: 0, y: 0, w: 2, h: 1, ...extra });

function Strip({ start }: { start?: CustomWidgetLayout }) {
  const [layout, setLayout] = useState<CustomWidgetLayout | undefined>(start);
  const [device, setDevice] = useState<"desktop" | "tablet" | "phone">("desktop");
  return (
    <>
      <LayoutStrip layout={layout} device={device} onDevice={setDevice} onChange={setLayout} />
      <output data-testid="layout">{JSON.stringify(layout ?? null)}</output>
    </>
  );
}
const layoutNow = () => JSON.parse(screen.getByTestId("layout").textContent!) as CustomWidgetLayout | null;

describe("LayoutStrip", () => {
  it("a free layout offers only the mode; stack mode starts as a row", () => {
    render(<Strip />);
    expect(screen.queryByLabelText("Direction")).toBeNull();
    fireEvent.change(screen.getByLabelText("Layout mode"), { target: { value: "stack" } });
    expect(layoutNow()).toEqual({ mode: "stack", direction: "row" });
    expect(screen.getByLabelText("Direction")).toBeTruthy();
  });

  it("a change on the phone goes into the phone's layout and the desktop keeps its own", () => {
    render(<Strip start={{ mode: "stack", direction: "column", gap: 4 }} />);
    fireEvent.click(screen.getByRole("button", { name: "phone" }));
    expect((screen.getByLabelText("Direction") as HTMLSelectElement).value).toBe("column"); // inherited
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "row" } });
    expect(layoutNow()).toEqual({ mode: "stack", direction: "column", gap: 4, phone: { direction: "row" } });
  });

  it("going back to free forgets the stack settings", () => {
    render(<Strip start={{ mode: "stack", direction: "column", gap: 4 }} />);
    fireEvent.change(screen.getByLabelText("Layout mode"), { target: { value: "free" } });
    expect(layoutNow()).toBeNull();
  });
});

describe("StackPreview", () => {
  const layout: CustomWidgetLayout = { mode: "stack", direction: "row" };

  it("lists the parts in order and moves one", () => {
    const onReorder = vi.fn();
    render(<StackPreview layout={layout} parts={[part("a"), part("b")]} device="desktop" selected={null} onSelect={() => {}} onReorder={onReorder} />);
    fireEvent.click(screen.getByLabelText("Move b earlier"));
    expect(onReorder.mock.calls[0]![0].map((p: CustomWidgetPart) => p.localId)).toEqual(["b", "a"]);
    expect((screen.getByLabelText("Move a earlier") as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves out on the preview a part hidden on that screen size", () => {
    const parts = [part("a"), part("b", { hiddenOn: ["phone"] })];
    const { container, rerender } = render(<StackPreview layout={layout} parts={parts} device="desktop" selected={null} onSelect={() => {}} onReorder={() => {}} />);
    expect(container.querySelectorAll("[aria-label='Stack preview'] > div").length).toBe(2);
    rerender(<StackPreview layout={layout} parts={parts} device="phone" selected={null} onSelect={() => {}} onReorder={() => {}} />);
    expect(container.querySelectorAll("[aria-label='Stack preview'] > div").length).toBe(1);
  });
});

describe("PartFlexFields", () => {
  it("sets grow and hides on a size", () => {
    const onChange = vi.fn();
    render(<PartFlexFields part={part("a")} device="desktop" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Grow"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(part("a", { flex: { grow: 2 } }));
    fireEvent.click(screen.getByLabelText("Hide on phone"));
    expect(onChange).toHaveBeenLastCalledWith(part("a", { hiddenOn: ["phone"] }));
  });
});
