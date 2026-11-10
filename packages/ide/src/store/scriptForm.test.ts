import { describe, expect, it } from "vitest";
import { hasNoTrigger, triggerSummary, withTrigger, withWrites, writesText } from "./scriptForm";

describe("withTrigger", () => {
  it.each([
    [{ every: 500 }, { every: "" }, {}],
    [{}, { every: "250" }, { every: 250 }],
    [{}, { every: "250.6" }, { every: 251 }],
    [{}, { every: "abc" }, {}],
    [{}, { onChange: " plc:A, ns:B ,, " }, { onChange: ["plc:A", "ns:B"] }],
    [{ onChange: ["x"] }, { onChange: "" }, {}],
    [{}, { onStart: true }, { onStart: true }],
    [{ onStart: true }, { onStart: false }, {}],
    [{ onAlarm: ["a"] }, { onAlarm: [] }, {}],
    [{ every: 100 }, { onStart: true }, { every: 100, onStart: true }],
  ])("%j + %j", (t, patch, want) => expect(withTrigger(t, patch)).toEqual(want));
});

describe("the writes list", () => {
  it.each([
    ["", undefined],
    [" , ,, ", undefined],
    ["mem:Count", ["mem:Count"]],
    [" mem:*, plc:Run ,, ns:Line1/* ", ["mem:*", "plc:Run", "ns:Line1/*"]],
  ])("withWrites(%j)", (text, want) => expect(withWrites(text)).toEqual(want));

  it("writesText joins the entries", () => {
    expect(writesText({ id: "s", name: "S", trigger: {}, source: "", writes: ["mem:*", "plc:Run"] })).toBe("mem:*, plc:Run");
    expect(writesText({ id: "s", name: "S", trigger: {}, source: "" })).toBe("");
  });
});

describe("triggerSummary", () => {
  it.each([
    [{ every: 1000 }, "every 1 s"],
    [{ every: 2500 }, "every 2500 ms"],
    [{ every: 250, onStart: true }, "every 250 ms · on start"],
    [{ onChange: ["a", "b"] }, "on change (2)"],
    [{ onAlarm: ["x"], onStart: true }, "on start · on alarm (1)"],
    [{}, "no trigger"],
  ])("%j is %j", (t, want) => expect(triggerSummary(t)).toBe(want));
});

describe("hasNoTrigger", () => {
  it.each([
    [{}, true],
    [{ onChange: [] }, true],
    [{ onAlarm: [] }, true],
    [{ every: 100 }, false],
    [{ onStart: true }, false],
    [{ onChange: ["a"] }, false],
    [{ onAlarm: ["a"] }, false],
  ])("%j is %j", (t, want) => expect(hasNoTrigger(t)).toBe(want));
});
