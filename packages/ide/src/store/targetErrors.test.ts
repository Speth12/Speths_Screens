import { describe, expect, it } from "vitest";
import { describeFailure, isNetworkFailure } from "./targetErrors";

describe("describeFailure", () => {
  it("explains a failed fetch to another runtime, naming the origin it must accept", () => {
    const text = describeFailure("http://10.0.0.120:8080", new TypeError("Failed to fetch"), "http://localhost:8080");
    expect(text).toContain("cannot reach http://10.0.0.120:8080");
    expect(text).toContain("--cors-origins=http://localhost:8080");
    expect(text).toContain("SPETHS_CORS=http://localhost:8080");
    expect(text).toContain("Failed to fetch");
  });

  it("leaves an answer from the runtime, and a failure of the runtime this page came from, as they are", () => {
    expect(describeFailure("http://10.0.0.120:8080", new Error("bad request"), "http://localhost:8080")).toBe("bad request");
    expect(describeFailure("", new TypeError("Failed to fetch"), "http://localhost:8080")).toBe("Failed to fetch");
  });

  it("only a TypeError is a network failure", () => {
    expect(isNetworkFailure(new TypeError("x"))).toBe(true);
    expect(isNetworkFailure(new Error("x"))).toBe(false);
    expect(isNetworkFailure("x")).toBe(false);
  });
});
