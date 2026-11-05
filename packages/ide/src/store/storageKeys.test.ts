import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readMigrated } from "./storageKeys";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("reads the current key", () => {
  localStorage.setItem("speths-screens-x", "new");
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBe("new");
});

it("moves a value kept under the old key to the new one", () => {
  localStorage.setItem("xhmi-x", "old");
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBe("old");
  expect(localStorage.getItem("speths-screens-x")).toBe("old");
  expect(localStorage.getItem("xhmi-x")).toBeNull();
  // and the next read finds it under the new key
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBe("old");
});

it("prefers the current key and leaves the old entry alone", () => {
  localStorage.setItem("speths-screens-x", "new");
  localStorage.setItem("xhmi-x", "old");
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBe("new");
  expect(localStorage.getItem("xhmi-x")).toBe("old");
});

it("is null when there is nothing under either key", () => {
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBeNull();
  expect(localStorage.length).toBe(0);
});

it("keeps an empty value (it is a value)", () => {
  localStorage.setItem("xhmi-x", "");
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBe("");
  expect(localStorage.getItem("speths-screens-x")).toBe("");
});

it("is null when storage cannot be read", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readMigrated("speths-screens-x", "xhmi-x")).toBeNull();
});
