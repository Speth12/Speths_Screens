import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readStored } from "./storage";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("reads a stored value", () => {
  localStorage.setItem("speths-screens-scale", "1");
  expect(readStored("speths-screens-scale")).toBe("1");
});

it("is null when there is nothing, or when storage cannot be read", () => {
  expect(readStored("speths-screens-scale")).toBeNull();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readStored("speths-screens-scale")).toBeNull();
});
