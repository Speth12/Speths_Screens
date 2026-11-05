// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readMigrated } from "./storageKeys";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("reads the current key", () => {
  localStorage.setItem("speths-screens-theme", "high-performance");
  expect(readMigrated("speths-screens-theme", "xhmi-theme")).toBe("high-performance");
});

it("moves a value kept under the old key to the new one", () => {
  localStorage.setItem("xhmi-scale", "1");
  expect(readMigrated("speths-screens-scale", "xhmi-scale")).toBe("1");
  expect(localStorage.getItem("speths-screens-scale")).toBe("1");
  expect(localStorage.getItem("xhmi-scale")).toBeNull();
});

it("prefers the current key and leaves the old entry alone", () => {
  localStorage.setItem("speths-screens-scale", "0");
  localStorage.setItem("xhmi-scale", "1");
  expect(readMigrated("speths-screens-scale", "xhmi-scale")).toBe("0");
  expect(localStorage.getItem("xhmi-scale")).toBe("1");
});

it("is null when there is nothing, or when storage cannot be read", () => {
  expect(readMigrated("speths-screens-theme", "xhmi-theme")).toBeNull();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readMigrated("speths-screens-theme", "xhmi-theme")).toBeNull();
});
