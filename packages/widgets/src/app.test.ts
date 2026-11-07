import { describe, expect, it } from "vitest";
import { appTag, isAppPath, splitApp } from "./app";

describe("app values", () => {
  const values = { pageName: "Overview", projectName: "Pump station" };

  it("reads the values the app has", () => {
    expect(appTag("app:pageName", values)).toEqual({ value: "Overview", quality: "Good", ts: 0 });
    expect(appTag("app:projectName", values)?.value).toBe("Pump station");
  });

  it("a name with no value is Bad, and any other path is not an app value", () => {
    expect(appTag("app:pageId", values)).toEqual({ value: null, quality: "Bad", ts: 0 });
    expect(appTag("plc:Temp", values)).toBeUndefined();
    expect(appTag(undefined, values)).toBeUndefined();
    expect(isAppPath("app:x")).toBe(true);
    expect(isAppPath("application:x")).toBe(false);
  });

  it("splits a list of paths", () => {
    const { app, rest } = splitApp(["plc:A", "app:pageName", "ns:B"], values);
    expect(Object.keys(app)).toEqual(["app:pageName"]);
    expect(rest).toEqual(["plc:A", "ns:B"]);
  });
});
