import { describe, expect, it } from "vitest";
import { imageFit } from "./imageFit";

describe("imageFit", () => {
  it.each([
    ["nothing set", undefined, "contain"],
    ["empty config", {}, "contain"],
    ["set in the properties panel", { fit: "cover" }, "cover"],
    ["dropped from the image library", { objectFit: "fill" }, "fill"],
    ["panel choice wins over the drop default", { fit: "cover", objectFit: "contain" }, "cover"],
    ["unknown value is ignored", { fit: "stretch", objectFit: "fill" }, "fill"],
  ])("%s", (_name, config, want) => {
    expect(imageFit(config)).toBe(want);
  });
});
