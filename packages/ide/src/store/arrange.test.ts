import { describe, expect, it } from "vitest";
import { arrange, restack } from "./arrange";
import { placeNew } from "./newWidget";

const a = { id: "a", x: 10, y: 20, w: 100, h: 40 };
const b = { id: "b", x: 200, y: 60, w: 50, h: 80 };
const c = { id: "c", x: 400, y: 5, w: 30, h: 30 };

describe("arranging the selected widgets", () => {
  const cases: { action: Parameters<typeof arrange>[1]; ws: (typeof a)[]; want: ReturnType<typeof arrange> }[] = [
    { action: "align-left", ws: [a, b], want: [{ id: "b", patch: { x: 10 } }] },
    { action: "align-right", ws: [a, b], want: [{ id: "a", patch: { x: 150 } }] },
    { action: "align-top", ws: [a, b], want: [{ id: "b", patch: { y: 20 } }] },
    { action: "align-bottom", ws: [a, b], want: [{ id: "a", patch: { y: 100 } }] },
    { action: "align-cx", ws: [a, b], want: [{ id: "a", patch: { x: 80 } }, { id: "b", patch: { x: 105 } }] },
    { action: "align-cy", ws: [a, b], want: [{ id: "a", patch: { y: 60 } }, { id: "b", patch: { y: 40 } }] },
    // The outer two stay; the middle one gets the even gap (420 wide, 180 of widgets, gaps of 120).
    { action: "dist-h", ws: [c, a, b], want: [{ id: "b", patch: { x: 230 } }] },
    { action: "same-w", ws: [b, a], want: [{ id: "a", patch: { w: 50 } }] },
    { action: "same-h", ws: [a, b], want: [{ id: "b", patch: { h: 40 } }] },
    { action: "same-size", ws: [a, b, c], want: [{ id: "b", patch: { w: 100, h: 40 } }, { id: "c", patch: { w: 100, h: 40 } }] },
  ];
  for (const t of cases) it(t.action, () => expect(arrange(t.ws, t.action)).toEqual(t.want));

  it("needs enough widgets to mean something", () => {
    expect(arrange([a], "align-left")).toEqual([]);
    expect(arrange([a, b], "dist-h")).toEqual([]);
    expect(arrange([a], "same-size")).toEqual([]);
  });
});

describe("the drawing order", () => {
  const ws = ["1", "2", "3", "4", "5"].map((id) => ({ id }));
  const order = (ids: string[], move: Parameters<typeof restack>[2]) => restack(ws, ids, move).map((w) => w.id).join("");
  it("to the front and back, several at once, keeping their own order", () => {
    expect(order(["2", "4"], "front")).toBe("13524");
    expect(order(["2", "4"], "back")).toBe("24135");
  });
  it("one step forward or back", () => {
    expect(order(["2"], "forward")).toBe("13245");
    expect(order(["2", "3"], "forward")).toBe("14235");
    expect(order(["5"], "forward")).toBe("12345");
    expect(order(["1"], "backward")).toBe("12345");
    expect(order(["3", "5"], "backward")).toBe("13254");
  });
  it("nothing selected changes nothing", () => expect(order([], "front")).toBe("12345"));
});

describe("where a new widget goes", () => {
  const view = { x: 1000, y: 800, w: 600, h: 400 };
  it("in the middle of what is in view, on the 8 px grid", () => {
    expect(placeNew(view, { w: 200, h: 100 }, [], true)).toEqual({ x: 1200, y: 952 });
  });
  it("stepped aside from a widget already there, so both can be seen", () => {
    const there = { x: 1200, y: 952, w: 200, h: 100 };
    expect(placeNew(view, { w: 200, h: 100 }, [there], true)).toEqual({ x: 1216, y: 968 });
  });
  it("on the cell grid: the middle cell, inside the columns", () => {
    expect(placeNew({ x: 0, y: 0, w: 1056, h: 576 }, { w: 4, h: 2 }, [], false)).toEqual({ x: 4, y: 3 });
    expect(placeNew({ x: 2000, y: 0, w: 800, h: 400 }, { w: 4, h: 2 }, [], false).x).toBe(8);
  });
  it("never left of or above the page", () => {
    expect(placeNew({ x: 0, y: 0, w: 100, h: 50 }, { w: 400, h: 300 }, [], true)).toEqual({ x: 0, y: 0 });
  });
  it("with no view known, under the lowest widget at the left", () => {
    expect(placeNew(null, { w: 10, h: 10 }, [{ x: 50, y: 30, w: 10, h: 70 }], true)).toEqual({ x: 0, y: 100 });
  });
});
