import { describe, expect, it } from "vitest";
import type { CustomWidget, CustomWidgetPart, Shell } from "@speths-screens/shared-types";
import { DEFAULT_IDS, HEADER_PRESETS, builtinAsDesigned, headerPresetOf, mergeChrome, withHeaderPreset } from "./chrome";

/** A project holding its header and navigation as custom widgets, as "Edit as custom widgets" leaves it. */
function customProject(shell: Shell = {}) {
  const made = builtinAsDesigned({ shell });
  return { customWidgets: made.customWidgets, shell: { ...shell, chrome: "custom" as const, frame: made.frame } };
}
const header = (p: { customWidgets: readonly CustomWidget[] }) => p.customWidgets.find((c) => c.id === DEFAULT_IDS.header)!;
const part = (p: { customWidgets: readonly CustomWidget[] }, id: string) => header(p).widgets.find((w) => w.localId === id);
const change = (p: ReturnType<typeof customProject>, patch: Partial<Shell>) => {
  const m = mergeChrome(p, { ...p.shell, ...patch });
  return { customWidgets: m.customWidgets, shell: m.shell as ReturnType<typeof customProject>["shell"] };
};
const editPart = (p: ReturnType<typeof customProject>, id: string, f: (w: CustomWidgetPart) => CustomWidgetPart) => ({
  ...p, customWidgets: p.customWidgets.map((c) => (c.id === DEFAULT_IDS.header ? { ...c, widgets: c.widgets.map((w) => (w.localId === id ? f(w) : w)) } : c)),
});

describe("header settings on a header held as custom widgets", () => {
  it("an untouched header follows the settings exactly", () => {
    const next: Shell = { header: { clock: "none", alarms: true, drivers: "summary", height: 80 }, nav: "sidebar", navOptions: { width: 260 } };
    const got = change(customProject(), next);
    const fresh = customProject(next);
    // The order of the parts is only the order they are drawn in; nothing here overlaps.
    const sorted = (list: readonly CustomWidget[]) => [...list].sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({ ...c, widgets: [...c.widgets].sort((a, b) => a.localId.localeCompare(b.localId)) }));
    expect(sorted(got.customWidgets)).toEqual(sorted(fresh.customWidgets));
    expect(got.shell.frame).toEqual(fresh.shell.frame);
  });

  it("turning a part off removes it and on adds it; nothing else changes", () => {
    const p = customProject();
    const off = change(p, { header: { clock: "none" } });
    expect(part(off, "clock")).toBeUndefined();
    expect(part(off, "user")).toEqual(part(p, "user"));
    const on = change(off, { header: undefined });
    expect(part(on, "clock")).toEqual(part(p, "clock"));
  });

  it("a part added by hand stays through every change", () => {
    const mine: CustomWidgetPart = { localId: "my-button", type: "button", x: 400, y: 8, w: 120, h: 44, props: { label: "Home" } } as CustomWidgetPart;
    let p = customProject();
    p = { ...p, customWidgets: p.customWidgets.map((c) => (c.id === DEFAULT_IDS.header ? { ...c, widgets: [...c.widgets, mine] } : c)) };
    p = change(p, { header: { clock: "none", logo: "none", drivers: "none" } });
    p = change(p, { header: { height: 90 }, nav: "sidebar" });
    expect(part(p, "my-button")).toEqual(mine);
  });

  it("what was changed by hand is kept; what was not follows the setting", () => {
    let p = customProject();
    p = editPart(p, "logo", (w) => ({ ...w, x: 300, props: { ...w.props, bgColor: "#ff0000" } }));
    p = change(p, { header: { logoText: "PX" } });
    const logo = part(p, "logo")!;
    expect(logo.x).toBe(300);
    expect(logo.props).toMatchObject({ bgColor: "#ff0000", staticText: "PX" });
  });

  it("a part deleted by hand is not brought back by another setting", () => {
    let p = customProject();
    p = { ...p, customWidgets: p.customWidgets.map((c) => (c.id === DEFAULT_IDS.header ? { ...c, widgets: c.widgets.filter((w) => w.localId !== "clock") } : c)) };
    p = change(p, { header: { alarms: true } });
    expect(part(p, "clock")).toBeUndefined();
    expect(part(p, "alarms")).toBeTruthy();
  });

  it("the height changes the header and its slot, and a slot sized by hand is kept", () => {
    const p = customProject();
    const tall = change(p, { header: { height: 90 } });
    expect(header(tall).height).toBe(90);
    expect(tall.shell.frame!.find((s) => s.id === "header")!.size).toBe(90);
    const sized = { ...p, shell: { ...p.shell, frame: p.shell.frame!.map((s) => (s.id === "header" ? { ...s, size: 72 } : s)) } };
    expect(change(sized, { header: { height: 90 } }).shell.frame!.find((s) => s.id === "header")!.size).toBe(72);
  });

  it("the navigation style moves the slot; none removes it and the phone's bar", () => {
    const p = customProject({ nav: "sidebar" });
    const tabs = change(p, { nav: "tabs" });
    expect(tabs.shell.frame!.find((s) => s.id === "nav")).toMatchObject({ customWidgetId: DEFAULT_IDS.tabNav, edge: "top" });
    expect(change(p, { nav: "none" }).shell.frame!.map((s) => s.id)).toEqual(["header"]);
  });

  it("a slot added by hand, and a change that is not a setting, are left alone", () => {
    const p = customProject();
    const extra = { id: "footer", customWidgetId: "cw-x", edge: "bottom" as const, size: 40 };
    const got = mergeChrome(p, { ...p.shell, frame: [...p.shell.frame!, extra] });
    expect(got.customWidgets).toEqual(p.customWidgets);
    expect(got.shell.frame).toContainEqual(extra);
    expect(change({ ...p, shell: got.shell as typeof p.shell }, { header: { clock: "date" } }).shell.frame).toContainEqual(extra);
  });

  it("a navigation setting reaches the page lists", () => {
    const got = change(customProject({ nav: "sidebar" }), { navOptions: { showSettings: false } });
    const list = got.customWidgets.find((c) => c.id === DEFAULT_IDS.sideNav)!.widgets[0]!;
    expect(list.props).toMatchObject({ showSettings: false });
  });
});

describe("header presets", () => {
  it("a preset sets the header's choices and keeps its look", () => {
    const compact = HEADER_PRESETS.find((p) => p.id === "compact")!;
    const shell = withHeaderPreset({ nav: "sidebar", header: { alarms: true, style: { background: "#102030" } } }, compact);
    expect(shell).toEqual({ nav: "sidebar", header: { ...compact.header, style: { background: "#102030" } } });
    expect(headerPresetOf(shell)?.id).toBe("compact");
  });

  it("no choices is the standard preset; other choices are no preset", () => {
    expect(headerPresetOf(undefined)?.id).toBe("standard");
    expect(withHeaderPreset({ header: { alarms: true } }, HEADER_PRESETS[0]!)).toEqual({});
    expect(headerPresetOf({ header: { logoText: "PX" } })).toBeUndefined();
  });

  it("every preset builds a header whose parts fit inside it", () => {
    for (const preset of HEADER_PRESETS) {
      const h = header(customProject({ header: preset.header }));
      for (const w of h.widgets) {
        expect(w.x, `${preset.id} ${w.localId}`).toBeGreaterThanOrEqual(0);
        expect(w.x + w.w, `${preset.id} ${w.localId}`).toBeLessThanOrEqual(h.width!);
      }
    }
  });
});
