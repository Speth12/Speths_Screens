import { describe, expect, it } from "vitest";
import { lookOf, withLook } from "./widgetLook";

describe("a widget's look", () => {
  const cases: { name: string; props: Record<string, unknown> | undefined; want: "card" | "plain" }[] = [
    { name: "no settings is a card", props: undefined, want: "card" },
    { name: "its own colors are still a card", props: { bgColor: "#111111", borderColor: "#222222" }, want: "card" },
    { name: "no background but a border is a card", props: { bgColor: "transparent" }, want: "card" },
    { name: "no background and no border is plain", props: { bgColor: "transparent", borderColor: "transparent" }, want: "plain" },
    { name: "the older word none counts too", props: { bgColor: "none", borderColor: "none" }, want: "plain" },
  ];
  for (const c of cases) it(c.name, () => expect(lookOf(c.props)).toBe(c.want));

  it("plain takes the background, border and label away and keeps every other setting", () => {
    expect(withLook({ unit: "bar", label: "Pressure" }, "plain")).toEqual({
      unit: "bar", label: "Pressure", bgColor: "transparent", borderColor: "transparent", showLabel: false,
    });
  });

  it("card gives them back to the theme", () => {
    const plain = withLook({ unit: "bar" }, "plain");
    expect(withLook(plain, "card")).toEqual({ unit: "bar" });
    expect(withLook(withLook(undefined, "plain"), "card")).toBeUndefined();
  });
});
