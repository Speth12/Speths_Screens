import { describe, expect, it } from "vitest";
import type { CustomWidget, Shell, ShellHeader, ShellNavOptions } from "@speths-screens/shared-types";
import {
  DEFAULT_IDS, SIDE_NAV_ICONS_ID, builtinAsDesigned, chromeStyles, contrastRatio, defaultCustomWidgets, defaultFrame, effectiveFrame, findCustomWidget, missingDefaults, shellStyleVars,
} from "./chrome";
import { slotsByEdge } from "./layout";

const header = (h: ShellHeader, security?: { mode: string }) =>
  defaultCustomWidgets({ shell: { header: h }, security }).find((c) => c.id === DEFAULT_IDS.header)!;
const titles = (h: ShellHeader) => defaultCustomWidgets({ shell: { header: h } }).find((c) => c.id === DEFAULT_IDS.titles)!;
const parts = (c: CustomWidget) => c.widgets.map((w) => w.localId);
const part = (c: CustomWidget, id: string) => c.widgets.find((w) => w.localId === id)!;
const props = (c: CustomWidget, id: string) => part(c, id).props as Record<string, unknown>;

describe("a project with no choices", () => {
  it("has the header and navigation it always had", () => {
    expect(defaultCustomWidgets({})).toEqual(defaultCustomWidgets());
    expect(defaultCustomWidgets({ shell: { header: {}, navOptions: {} } })).toEqual(defaultCustomWidgets());
    expect(parts(header({}))).toEqual(["logo", "titles", "drivers", "clock", "user"]);
    expect(defaultFrame("sidebar", {})).toEqual(defaultFrame("sidebar"));
    expect(chromeStyles({})).toEqual({});
    expect(chromeStyles({ shell: { nav: "sidebar" } })).toEqual({});
  });
});

describe("what the built-in header shows", () => {
  const cases: { name: string; h: ShellHeader; want: string[] }[] = [
    { name: "no logo", h: { logo: "none" }, want: ["titles", "drivers", "clock", "user"] },
    { name: "a picture for a logo", h: { logo: "image", logoImage: "img1" }, want: ["logo", "titles", "drivers", "clock", "user"] },
    { name: "a picture not chosen yet is no logo", h: { logo: "image" }, want: ["titles", "drivers", "clock", "user"] },
    { name: "no datasource connections", h: { drivers: "none" }, want: ["logo", "titles", "clock", "user"] },
    { name: "no clock", h: { clock: "none" }, want: ["logo", "titles", "drivers", "user"] },
    { name: "no user menu", h: { showUser: false }, want: ["logo", "titles", "drivers", "clock"] },
    { name: "the alarm count, before the clock", h: { alarms: true }, want: ["logo", "titles", "drivers", "alarms", "clock", "user"] },
    { name: "no names at all", h: { showProjectName: false, showPageName: false }, want: ["logo", "drivers", "clock", "user"] },
    { name: "nothing but the user: a spacer keeps it on the right", h: { logo: "none", showProjectName: false, showPageName: false, drivers: "none", clock: "none" }, want: ["spacer", "user"] },
  ];
  for (const c of cases) it(c.name, () => expect(parts(header(c.h))).toEqual(c.want));

  it("the logo's letters, and S when none are given", () => {
    expect(props(header({ logoText: "PX" }), "logo").staticText).toBe("PX");
    expect(props(header({}), "logo").staticText).toBe("S");
  });

  it("a picture logo is the project's image, fitted", () => {
    const logo = part(header({ logo: "image", logoImage: "img1" }), "logo");
    expect(logo.type).toBe("image");
    expect(logo.props).toMatchObject({ src: "lib:img1", fit: "contain" });
  });

  it("the names: either, both, the page with its icon, and centered", () => {
    expect(parts(titles({}))).toEqual(["project", "page"]);
    expect(parts(titles({ showProjectName: false }))).toEqual(["page"]);
    expect(parts(titles({ showPageName: false }))).toEqual(["project"]);
    expect(part(titles({}), "page").type).toBe("textDisplay");
    expect(part(titles({ pageIcon: true }), "page").type).toBe("pageTitle");
    const centered = titles({ titleAlign: "center", pageIcon: true });
    expect(props(centered, "project").textAlign).toBe("center");
    expect(props(centered, "page").textAlign).toBe("center");
  });

  it("exactly one part takes the room that is left", () => {
    const growers = (h: ShellHeader) => header(h).widgets.filter((w) => w.flex?.grow).map((w) => w.localId);
    expect(growers({})).toEqual(["drivers"]);
    expect(growers({ titleAlign: "center" })).toEqual(["titles"]);
    expect(growers({ drivers: "summary" })).toEqual(["titles"]);
    expect(growers({ drivers: "none" })).toEqual(["titles"]);
    expect(growers({ drivers: "none", showProjectName: false, showPageName: false })).toEqual(["spacer"]);
  });

  it("a summary of the connections is compact and stays on a phone", () => {
    const drivers = part(header({ drivers: "summary" }), "drivers");
    expect(drivers.props).toMatchObject({ compact: true });
    expect(drivers.hiddenOn).toBeUndefined();
  });

  it("the clock's format and weekday", () => {
    expect(props(header({ clock: "date", clockWeekday: false }), "clock")).toMatchObject({ format: "date", showWeekday: false });
    expect(props(header({}), "clock").format).toBeUndefined();
  });

  it("the alarm count opens the page chosen", () => {
    expect(props(header({ alarms: true, alarmsPage: "p2" }), "alarms").page).toBe("p2");
  });

  it("a project that asks for logins keeps the user menu, whatever it says", () => {
    expect(parts(header({ showUser: false }, { mode: "login" }))).toContain("user");
    expect(parts(header({ showUser: false }, { mode: "none" }))).not.toContain("user");
  });
});

describe("the built-in navigation", () => {
  const nav = (n: ShellNavOptions, id: string = DEFAULT_IDS.sideNav) =>
    defaultCustomWidgets({ shell: { navOptions: n } }).find((c) => c.id === id)!.widgets[0]!.props as Record<string, unknown>;

  it("icons and the Settings entry can be left out, in every style", () => {
    for (const id of [DEFAULT_IDS.sideNav, DEFAULT_IDS.tabNav, DEFAULT_IDS.iconNav, DEFAULT_IDS.bottomNav]) {
      expect(nav({ showIcons: false, showSettings: false }, id)).toMatchObject({ showIcons: false, showSettings: false });
      expect(nav({}, id).showIcons).toBeUndefined();
    }
  });

  it("none draws only the header, on a phone too", () => {
    const frame = defaultFrame("none");
    expect(frame.map((s) => s.id)).toEqual(["header"]);
    expect(slotsByEdge(effectiveFrame({ shell: { nav: "none" } }), "phone").bottom).toEqual([]);
  });

  it("the header's height and the sidebar's width", () => {
    const frame = defaultFrame("sidebar", { header: { height: 80 }, navOptions: { width: 260 } });
    expect(frame.find((s) => s.id === "header")).toMatchObject({ size: 80, phone: { size: 52 } });
    expect(frame.find((s) => s.id === "nav")!.size).toBe(260);
    expect(defaultFrame("tabs", { header: { height: 40 } }).find((s) => s.id === "header")!.phone).toEqual({ size: 40 });
  });

  it("icons only on a tablet: a narrow sidebar there, the full one on a desktop", () => {
    const shell: Shell = { nav: "sidebar", navOptions: { tabletIcons: true } };
    const at = (device: "desktop" | "tablet" | "phone") => slotsByEdge(effectiveFrame({ shell }), device).left.map((x) => [x.slot.customWidgetId, x.size]);
    expect(at("desktop")).toEqual([[DEFAULT_IDS.sideNav, 208]]);
    expect(at("tablet")).toEqual([[SIDE_NAV_ICONS_ID, 64]]);
    expect(at("phone")).toEqual([]);
    expect(findCustomWidget({ shell }, SIDE_NAV_ICONS_ID)?.widgets[0]!.props).toMatchObject({ style: "list", showLabels: false });
    // A project that did not ask for it has no such widget.
    expect(findCustomWidget({}, SIDE_NAV_ICONS_ID)).toBeUndefined();
  });
});

describe("the screen draws the header the project chose", () => {
  it("a built-in custom widget is found as the project's choices make it", () => {
    const shell: Shell = { header: { clock: "none" } };
    expect(parts(findCustomWidget({ shell }, DEFAULT_IDS.header)!)).not.toContain("clock");
    expect(parts(findCustomWidget({}, DEFAULT_IDS.header)!)).toContain("clock");
  });

  it("the same shell gives the same widget, so a screen does not redraw for nothing", () => {
    const shell: Shell = { header: { clock: "none" } };
    expect(findCustomWidget({ shell }, DEFAULT_IDS.header)).toBe(findCustomWidget({ shell }, DEFAULT_IDS.header));
    // Logins switched on changes what is built.
    const open = findCustomWidget({ shell: { header: { showUser: false } } }, DEFAULT_IDS.header)!;
    expect(parts(open)).not.toContain("user");
    const one: Shell = { header: { showUser: false } };
    expect(parts(findCustomWidget({ shell: one, security: { mode: "none" } }, DEFAULT_IDS.header)!)).not.toContain("user");
    expect(parts(findCustomWidget({ shell: one, security: { mode: "login" } }, DEFAULT_IDS.header)!)).toContain("user");
  });

  it("turning it into custom chrome carries the choices into the copies", () => {
    const project = { shell: { nav: "sidebar" as const, header: { clock: "none" as const, height: 72 }, navOptions: { width: 240 } } };
    const add = missingDefaults({}, "sidebar", project);
    expect(parts(add.customWidgets.find((c) => c.id === DEFAULT_IDS.header)!)).not.toContain("clock");
    expect(add.frame.find((s) => s.id === "header")!.size).toBe(72);
    expect(add.frame.find((s) => s.id === "nav")!.size).toBe(240);
  });
});

describe("the look of the header and navigation", () => {
  it("nothing chosen sets nothing", () => {
    expect(shellStyleVars(undefined)).toEqual({});
    expect(shellStyleVars({})).toEqual({});
    expect(shellStyleVars({ fontSize: "normal" })).toEqual({});
  });

  it("a background and a text color restyle what is inside through the theme's own properties", () => {
    const v = shellStyleVars({ background: "#0b3d91", textColor: "#ffffff", borderColor: "#123456" });
    expect(v).toMatchObject({ background: "#0b3d91", "--card": "#0b3d91", color: "#ffffff", "--card-foreground": "#ffffff", "--foreground": "#ffffff", "--border": "#123456" });
    expect(String(v["--muted-foreground"])).toContain("#ffffff");
    expect(String(v["--secondary"])).toContain("#0b3d91");
  });

  it("a color may be a theme token", () => {
    expect(shellStyleVars({ background: "token:alarm-critical" }).background).toBe("var(--alarm-critical)");
  });

  it("a font, a text size and bold", () => {
    const v = shellStyleVars({ font: "roboto", fontSize: "large", bold: true });
    expect(String(v.fontFamily)).toContain("Roboto");
    expect(v["--font-sans"]).toBe(v.fontFamily);
    expect(v["--type-sm"]).toBe("calc(0.875rem * 1.15)");
    expect(v["--type-xs"]).toBe("calc(0.75rem * 1.15)");
    expect(v.fontWeight).toBe(600);
    expect(shellStyleVars({ fontSize: "small" })["--type-base"]).toBe("calc(1rem * 0.875)");
  });

  it("the current page's colors are the navigation's alone", () => {
    const s = { activeBackground: "#f59e0b", activeTextColor: "#111827" };
    expect(shellStyleVars(s, true)).toEqual({ "--primary": "#f59e0b", "--primary-foreground": "#111827" });
    expect(shellStyleVars(s)).toEqual({});
  });

  it("each look goes to its slots", () => {
    const styles = chromeStyles({ shell: { header: { style: { background: "#000000" } }, navOptions: { style: { background: "#ffffff" } } } });
    expect(Object.keys(styles).sort()).toEqual(["bottom-nav", "header", "nav", "nav-tablet"]);
    expect(styles.header!.background).toBe("#000000");
    expect(styles.nav!.background).toBe("#ffffff");
    expect(styles["bottom-nav"]).toBe(styles.nav);
  });
});

describe("contrast of two colors", () => {
  const cases: { a?: string; b?: string; want: number | undefined }[] = [
    { a: "#000000", b: "#ffffff", want: 21 },
    { a: "#fff", b: "#000", want: 21 },
    { a: "#777777", b: "#ffffff", want: 4.48 },
    { a: "#ffffff", b: "#ffffff", want: 1 },
    { a: "token:alarm-critical", b: "#ffffff", want: undefined },
    { a: "red", b: "#ffffff", want: undefined },
    { a: undefined, b: "#ffffff", want: undefined },
  ];
  for (const c of cases) {
    it(`${c.a} on ${c.b}`, () => {
      const got = contrastRatio(c.a, c.b);
      if (c.want === undefined) expect(got).toBeUndefined();
      else expect(got).toBeCloseTo(c.want, 2);
    });
  }
});

describe("the tab navigation", () => {
  it("stretches its page list to the row, so the tabs do not stick out above it", () => {
    const tabs = defaultCustomWidgets().find((c) => c.id === DEFAULT_IDS.tabNav)!;
    expect(tabs.layout).toMatchObject({ direction: "row", align: "stretch" });
  });
});

describe("the built-in header and navigation as designed custom widgets", () => {
  const designed = (shell: Shell = {}) => builtinAsDesigned({ shell });
  const head = (shell?: Shell) => designed(shell).customWidgets.find((c) => c.id === DEFAULT_IDS.header)!;
  const at = (c: CustomWidget, id: string) => c.widgets.find((w) => w.localId === id)!;

  it("the header is designed at a desktop's width and the header's height, with no stack", () => {
    const h = head({ header: { height: 72 } });
    expect([h.width, h.height, h.layout]).toEqual([1280, 72, undefined]);
  });

  it("the parts before the one that takes the room stay left, those after it stay right, and it stretches", () => {
    const h = head();
    expect(h.widgets.map((w) => [w.localId, w.anchorX])).toEqual([
      ["logo", "left"], ["project", "left"], ["page", "left"], ["drivers", "stretch"], ["clock", "right"], ["user", "right"],
    ]);
    expect(at(h, "logo").anchorX).toBe("left");
    expect(at(h, "user").anchorX).toBe("right");
    expect(at(h, "clock").anchorX).toBe("right");
    expect(at(h, "drivers").anchorX).toBe("stretch");
    // The user menu sits against the right edge, the clock before it.
    expect(at(h, "user").x + at(h, "user").w).toBe(1280 - 8);
    expect(at(h, "clock").x + at(h, "clock").w).toBe(at(h, "user").x - 12);
  });

  it("the names become two lines of the header itself, one at the top and one at the bottom", () => {
    const h = head();
    expect(h.widgets.some((w) => w.type === "customWidget")).toBe(false);
    expect(at(h, "project")).toMatchObject({ type: "textDisplay", bindings: { value: "app:projectName" }, anchorY: "top" });
    expect(at(h, "page")).toMatchObject({ bindings: { value: "app:pageName" }, anchorY: "bottom" });
    expect(at(h, "project").y + at(h, "project").h).toBe(at(h, "page").y);
  });

  it("centered names take the room in the middle", () => {
    const h = head({ header: { titleAlign: "center" } });
    expect(at(h, "project").anchorX).toBe("stretch");
    expect(at(h, "drivers").anchorX).toBe("right");
  });

  it("the choices carry over: no clock, a picture logo, the alarm count", () => {
    const h = head({ header: { clock: "none", logo: "image", logoImage: "img1", alarms: true, alarmsPage: "p2" } });
    expect(h.widgets.map((w) => w.localId)).not.toContain("clock");
    expect(at(h, "logo")).toMatchObject({ type: "image", props: { src: "lib:img1" } });
    expect(at(h, "alarms")).toMatchObject({ type: "alarmIndicator", props: { page: "p2" }, anchorX: "right" });
  });

  it("parts hidden on a phone stay hidden there", () => {
    expect(at(head(), "clock").hiddenOn).toEqual(["phone"]);
  });

  it("each navigation is a page list filling its box, stretching both ways", () => {
    const d = designed({ nav: "sidebar", navOptions: { width: 240 } });
    const side = d.customWidgets.find((c) => c.id === DEFAULT_IDS.sideNav)!;
    expect([side.width, side.height]).toEqual([240, 720]);
    expect(side.widgets).toEqual([expect.objectContaining({ type: "pageList", x: 0, y: 0, w: 240, h: 720, anchorX: "stretch", anchorY: "stretch" })]);
    expect(d.frame.map((s) => s.id)).toEqual(["header", "nav", "bottom-nav"]);
  });
});
