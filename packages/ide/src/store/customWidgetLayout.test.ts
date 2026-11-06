import { describe, expect, it } from "vitest";
import type { CustomWidgetPart } from "@speths-screens/shared-types";
import { movePart, setLayoutField, setLayoutMode, setPartFlex, setPartHiddenOn, shownFlex } from "./customWidgetLayout";

const part = (id: string): CustomWidgetPart => ({ localId: id, type: "led", x: 0, y: 0, w: 1, h: 1 });

describe("layout fields", () => {
  const stack = { mode: "stack" as const, direction: "column" as const };

  it("the desktop's value is the layout's own field", () => {
    expect(setLayoutField(stack, "desktop", "gap", 12)).toEqual({ mode: "stack", direction: "column", gap: 12 });
  });

  it("a smaller screen's value goes in its override", () => {
    expect(setLayoutField(stack, "phone", "direction", "row")).toEqual({ ...stack, phone: { direction: "row" } });
    expect(setLayoutField({ ...stack, tablet: { gap: 2 } }, "tablet", "padding", 4)).toEqual({ ...stack, tablet: { gap: 2, padding: 4 } });
  });

  it("clearing the last override field drops the override", () => {
    expect(setLayoutField({ ...stack, phone: { direction: "row" } }, "phone", "direction", undefined)).toEqual(stack);
  });

  it("going free removes every stack setting, and stack starts as a row", () => {
    expect(setLayoutMode({ ...stack, gap: 3 }, "free")).toBeUndefined();
    expect(setLayoutMode(undefined, "stack")).toEqual({ mode: "stack", direction: "row" });
    expect(setLayoutMode(stack, "stack")).toEqual({ mode: "stack", direction: "column" });
  });
});

describe("parts", () => {
  it("move one place, and stay put at the ends", () => {
    const list = [part("a"), part("b"), part("c")];
    expect(movePart(list, 1, -1).map((p) => p.localId)).toEqual(["b", "a", "c"]);
    expect(movePart(list, 1, 1).map((p) => p.localId)).toEqual(["a", "c", "b"]);
    expect(movePart(list, 0, -1)).toBe(list);
    expect(movePart(list, 2, 1)).toBe(list);
  });

  it("flex keeps only what is set", () => {
    expect(setPartFlex(part("a"), "desktop", { grow: 1 }).flex).toEqual({ grow: 1 });
    expect(setPartFlex(setPartFlex(part("a"), "desktop", { grow: 1 }), "desktop", { basis: 80 }).flex).toEqual({ grow: 1, basis: 80 });
    expect(setPartFlex(setPartFlex(part("a"), "desktop", { grow: 1 }), "desktop", { grow: 0 })).toEqual(part("a"));
  });

  it("a smaller screen's flex goes in its own settings and the others are left alone", () => {
    const onPhone = setPartFlex(setPartFlex(part("a"), "desktop", { basis: 220 }), "phone", { grow: 1 });
    expect(onPhone.flex).toEqual({ basis: 220, phone: { grow: 1 } });
    // a 0 on a phone is a real value (it stops growing), not a removal
    expect(setPartFlex(onPhone, "phone", { grow: 0 }).flex).toEqual({ basis: 220, phone: { grow: 0 } });
    expect(shownFlex(onPhone, "phone", "grow")).toBe(1);
    expect(shownFlex(onPhone, "tablet", "grow")).toBe(0);
    expect(shownFlex(onPhone, "phone", "basis")).toBe(220);
  });

  it("hidden-on lists the sizes in a fixed order and disappears when empty", () => {
    const hidden = setPartHiddenOn(setPartHiddenOn(part("a"), "phone", true), "tablet", true);
    expect(hidden.hiddenOn).toEqual(["tablet", "phone"]);
    expect(setPartHiddenOn(setPartHiddenOn(hidden, "tablet", false), "phone", false)).toEqual(part("a"));
  });
});
