import { describe, expect, it } from "vitest";
import { SessionStore, convertTyped, sessionName } from "./session";

describe("convertTyped", () => {
  it.each([
    ["bool", true, true],
    ["bool", 1, true],
    ["bool", 0, false],
    ["int", 3, 3],
    ["real", 2.5, 2.5],
    ["string", "auto", "auto"],
  ] as const)("%s %j", (t, v, want) => expect(convertTyped(t, v)).toEqual({ value: want }));

  it.each([
    ["bool", 2, "is a bool, not 2"],
    ["int", 3.5, "is an int, not 3.5"],
    ["int", true, "is an int, not the flag true"],
    ["real", "1", 'is a real, not the text "1"'],
    ["real", Number.NaN, "is a real, not NaN"],
    ["string", 3, "is a string, not 3"],
    ["string", null, "is a string, not nothing"],
  ] as const)("%s %j refused", (t, v, reason) => expect(convertTyped(t, v)).toEqual({ reason }));
});

it("sessionName", () => {
  expect(sessionName("session:mode")).toBe("mode");
  expect(sessionName("plc:mode")).toBeUndefined();
});

describe("SessionStore", () => {
  it("starts at the initial value, else the type's zero", () => {
    const s = new SessionStore();
    s.define([{ name: "mode", type: "string", initial: "auto" }, { name: "n", type: "int" }, { name: "bad", type: "int", initial: "x" }]);
    expect(s.get("mode")).toMatchObject({ value: "auto", quality: "Good" });
    expect(s.get("n").value).toBe(0);
    expect(s.get("bad").value).toBe(0);
    expect(s.get("nope")).toMatchObject({ value: null, quality: "Bad", reason: "no session variable nope" });
  });

  it("set checks the type and tells subscribers", () => {
    const s = new SessionStore();
    s.define([{ name: "n", type: "int" }]);
    const seen: unknown[] = [];
    s.subscribe("n", (st) => seen.push(st.value));
    expect(s.set("n", 4)).toEqual({ status: "confirmed" });
    expect(s.set("n", 4.5)).toEqual({ status: "failed", reason: "session variable n is an int, not 4.5" });
    expect(s.set("x", 1)).toEqual({ status: "failed", reason: "no session variable x" });
    expect(seen).toEqual([0, 4]);
  });

  it("a new project keeps values of variables with the same name and type", () => {
    const s = new SessionStore();
    s.define([{ name: "a", type: "int" }, { name: "b", type: "int" }, { name: "gone", type: "bool" }]);
    s.set("a", 5);
    s.set("b", 6);
    const gone: unknown[] = [];
    s.subscribe("gone", (st) => gone.push(st.quality));
    s.define([{ name: "a", type: "int" }, { name: "b", type: "string", initial: "hi" }]);
    expect(s.get("a").value).toBe(5);
    expect(s.get("b").value).toBe("hi");
    expect(gone).toEqual(["Good", "Bad"]);
  });
});
