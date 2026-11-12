import { describe, expect, it } from "vitest";
import { describeFailure, isNetworkFailure } from "./targetErrors";

describe("describeFailure", () => {
  it("says the program that serves the editor is not answering when the fetch itself failed", () => {
    const text = describeFailure(new TypeError("Failed to fetch"));
    expect(text).toContain("the program that serves this editor is not answering");
    expect(text).toContain("Failed to fetch");
  });

  it("leaves any other error as it is", () => {
    expect(describeFailure(new Error("bad request"))).toBe("bad request");
    expect(describeFailure("plain")).toBe("plain");
  });

  it("only a TypeError is a network failure", () => {
    expect(isNetworkFailure(new TypeError("x"))).toBe(true);
    expect(isNetworkFailure(new Error("x"))).toBe(false);
    expect(isNetworkFailure("x")).toBe(false);
  });
});
