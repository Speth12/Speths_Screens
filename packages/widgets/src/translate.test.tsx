import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Project, Widget } from "@speths-screens/shared-types";
import { collectTexts, pickLanguage, translateWidget, translator } from "./translate";
import { WidgetRenderer } from "./widgets";
import { WidgetHostProvider, inertHost } from "./host";

afterEach(cleanup);

const p = (more: Partial<Project> = {}): Project => ({
  schemaVersion: 6, version: "1", datasources: [], pages: [], languages: ["en", "de"],
  translations: { de: { Pressure: "Druck", Start: "Starten", "Pump 1": "Pumpe 1", RUNNING: "LÄUFT" } }, ...more,
});
const w = (props: Record<string, unknown>, type = "numericDisplay") => ({ id: "w", type, x: 0, y: 0, w: 2, h: 2, props }) as unknown as Widget;

describe("translator", () => {
  it("translates into another language and leaves what has no entry", () => {
    const t = translator(p(), "de");
    expect(t("Pressure")).toBe("Druck");
    expect(t("Temperature")).toBe("Temperature");
  });
  it("the project's first language, no language and an unknown language change nothing", () => {
    for (const lang of ["en", undefined, "fr"]) expect(translator(p(), lang)("Pressure")).toBe("Pressure");
  });
  it("an empty translation shows the original", () => {
    expect(translator(p({ translations: { de: { Pressure: "" } } }), "de")("Pressure")).toBe("Pressure");
  });
  it("a project with no languages translates nothing", () => {
    expect(translator(p({ languages: undefined, translations: undefined }), "de")("Pressure")).toBe("Pressure");
  });
});

describe("pickLanguage", () => {
  it.each([
    ["de", "de"], ["fr", "en"], [null, "en"], [undefined, "en"],
  ] as const)("asking for %s gives %s", (wanted, want) => expect(pickLanguage(p(), wanted)).toBe(want));
  it("is undefined for a project with no languages", () => expect(pickLanguage(p({ languages: undefined }), "de")).toBeUndefined());
});

describe("translateWidget", () => {
  const de = translator(p(), "de");
  it("translates the text settings and keeps the rest", () => {
    const out = translateWidget(w({ label: "Pressure", unit: "bar", min: 0 }), de);
    expect(out.props).toEqual({ label: "Druck", unit: "bar", min: 0 });
  });
  it("translates the labels of states and rows", () => {
    const out = translateWidget(w({ states: [{ value: 1, label: "RUNNING", color: "#0f0" }, { value: 0, label: "STOPPED" }] }, "multiState"), de);
    expect((out.props as { states: { label: string }[] }).states.map((s) => s.label)).toEqual(["LÄUFT", "STOPPED"]);
  });
  it("returns the same widget when nothing changes, so memoized drawing stays still", () => {
    const widget = w({ label: "Temperature" });
    expect(translateWidget(widget, de)).toBe(widget);
    const noProps = { id: "x", type: "led", x: 0, y: 0, w: 1, h: 1 } as unknown as Widget;
    expect(translateWidget(noProps, de)).toBe(noProps);
  });
});

describe("collectTexts", () => {
  it("lists each text once, from pages, widgets, states and alarm rules", () => {
    const texts = collectTexts(p({
      pages: [
        { id: "a", name: "Overview", group: "Process", widgets: [w({ label: "Pressure" }), w({ label: "Pressure", unit: "bar" })] },
        { id: "b", name: "Pumps", widgets: [w({ states: [{ value: 1, label: "RUNNING" }] }, "multiState")] },
      ],
      alarmRules: [{ id: "r", name: "High pressure", expr: "1", severity: "warning", message: "Pressure is high" }],
    }));
    expect(texts).toEqual(["Overview", "Process", "Pressure", "bar", "Pumps", "RUNNING", "High pressure", "Pressure is high"]);
  });
});

describe("a widget draws in the language being shown", () => {
  const host = (lang: string | undefined) => ({ ...inertHost, useTranslate: () => translator(p(), lang) });
  const draw = (lang: string | undefined) =>
    render(<WidgetHostProvider value={host(lang)}><WidgetRenderer w={w({ label: "Pressure", unit: "bar" })} /></WidgetHostProvider>);

  it("shows the translation", () => {
    draw("de");
    expect(screen.getByText("Druck")).toBeTruthy();
    expect(screen.queryByText("Pressure")).toBeNull();
  });
  it("shows the text as written in the first language", () => {
    draw("en");
    expect(screen.getByText("Pressure")).toBeTruthy();
  });
});
