import { describe, expect, it } from "vitest";
import { anchoredStyle, fitInBox } from "./layout";

describe("a custom widget scaled to fit its place", () => {
  const design = { width: 400, height: 100 };
  it.each([
    ["the same size", { width: 400, height: 100 }, { scale: 1, left: 0, top: 0 }],
    ["twice as big", { width: 800, height: 200 }, { scale: 2, left: 0, top: 0 }],
    ["wider than its shape: centered across", { width: 1000, height: 100 }, { scale: 1, left: 300, top: 0 }],
    ["taller than its shape: centered down", { width: 200, height: 300 }, { scale: 0.5, left: 0, top: 125 }],
    ["a box not measured yet", { width: 0, height: 0 }, { scale: 1, left: 0, top: 0 }],
  ])("%s", (_name, box, want) => expect(fitInBox(design, box)).toEqual(want));
});

describe("a part of a custom widget pinned to an edge", () => {
  const design = { width: 1000, height: 60 };
  const part = { x: 900, y: 10, w: 80, h: 40 };
  it("with no anchor keeps its place from the left and top, and its size", () => {
    expect(anchoredStyle(part, design)).toEqual({ position: "absolute", left: "900px", width: "80px", top: "10px", height: "40px" });
  });
  it("anchored right keeps its distance from the right", () => {
    expect(anchoredStyle({ ...part, anchorX: "right" }, design)).toMatchObject({ right: "20px", width: "80px" });
  });
  it("anchored to the middle keeps its distance from the middle", () => {
    expect(anchoredStyle({ x: 450, y: 0, w: 100, h: 60, anchorX: "center" }, design)).toMatchObject({ left: "calc(50% + -50px)", width: "100px" });
    expect(anchoredStyle({ x: 500, y: 0, w: 100, h: 60, anchorX: "center" }, design).left).toBe("calc(50% + 0px)");
  });
  it("stretched keeps its distance from both edges and has no width of its own", () => {
    const css = anchoredStyle({ x: 0, y: 0, w: 1000, h: 60, anchorX: "stretch", anchorY: "stretch" }, design);
    expect(css).toEqual({ position: "absolute", left: "0px", right: "0px", top: "0px", bottom: "0px" });
  });
  it("down: from the bottom, and from the middle", () => {
    expect(anchoredStyle({ ...part, anchorY: "bottom" }, design)).toMatchObject({ bottom: "10px", height: "40px" });
    expect(anchoredStyle({ ...part, anchorY: "center" }, design).top).toBe("calc(50% + -20px)");
  });
});
