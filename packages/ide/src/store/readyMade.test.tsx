import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MANIFESTS, READY_MADE } from "@speths-screens/widgets";
import { useProject } from "./projectStore";
import { STARTS_PLAIN, newWidget, readyMadeInstance } from "./newWidget";
import { lookOf } from "./widgetLook";
import { validateProject } from "./validateProject";
import { WidgetPalette } from "../panels/Palette";

afterEach(cleanup);
beforeEach(() => useProject.getState().newProject());

const manifest = (type: string) => MANIFESTS.find((m) => m.type === type)!;

describe("a new widget from the palette", () => {
  it("an element starts plain: no card and no label", () => {
    for (const type of STARTS_PLAIN) {
      const w = newWidget(manifest(type), true);
      expect(lookOf(w.props as Record<string, unknown>), type).toBe("plain");
      expect((w.props as Record<string, unknown>).showLabel, type).toBe(false);
    }
  });

  it("a list or a panel keeps its card, and a button still writes while pressed", () => {
    for (const type of ["trend", "table", "historyLog", "alarmBanner", "recipes"]) {
      expect(lookOf(newWidget(manifest(type), true).props as Record<string, unknown> | undefined), type).toBe("card");
    }
    expect(newWidget(manifest("button"), true).events?.onPress).toBeTruthy();
  });
});

describe("ready-made custom widgets", () => {
  it("a project holding every one of them, each placed, has no problems", () => {
    const p = useProject.getState().project;
    const project = {
      ...p,
      customWidgets: READY_MADE.map((r) => r.customWidget),
      pages: [{ ...p.pages[0]!, widgets: READY_MADE.map((r) => readyMadeInstance(r, true)) }],
    };
    expect(validateProject(project)).toEqual([]);
  });

  it("a copy is a card with the ready-made's name, sized for its contents, in pixels or cells", () => {
    const rm = READY_MADE[0]!;
    const px = readyMadeInstance(rm, true);
    expect(px.props).toMatchObject({ customWidgetId: rm.customWidget.id, label: rm.name, params: { tag: "" } });
    expect(px.w).toBeGreaterThanOrEqual(rm.customWidget.width!);
    expect(px.h).toBeGreaterThan(rm.customWidget.height!);
    const cells = readyMadeInstance(rm, false);
    expect(cells.w).toBeLessThanOrEqual(12);
    expect(cells.w).toBeGreaterThanOrEqual(1);
  });

  it("choosing one in the palette adds it to the project once and places a copy each time", () => {
    render(<WidgetPalette />);
    const name = READY_MADE.find((r) => r.element === "tank")!.name;
    fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(screen.getByRole("button", { name }));
    const p = useProject.getState().project;
    expect(p.customWidgets).toHaveLength(1);
    expect(p.pages[0]!.widgets.filter((w) => w.type === "customWidget")).toHaveLength(2);
    useProject.getState().undo();
  });
});
