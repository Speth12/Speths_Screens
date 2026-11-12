// The screen's header and navigation. The operator draws a project's own frame when it asks for
// custom chrome; otherwise it draws this built-in one. The built-in header and navigation are
// ordinary custom widgets, built from the page list, clock, driver status and user menu widgets and
// pinned to the screen edges, so the IDE draws exactly what the operator draws. A project that
// chooses custom chrome gets copies of them to edit.
//
// A project can say what the built-in ones show and how they look (shell.header, shell.navOptions):
// the same custom widgets are then built with those choices, so the choices are a starting point a
// project can still turn into custom chrome.
import type { CustomWidget, CustomWidgetPart, FrameSlot, Shell, ShellStyle } from "@speths-screens/shared-types";
import { FONTS, TYPE_SCALE, tokenColor } from "./tokens";

const bare = { noPadding: true, bgColor: "transparent", borderColor: "none" } as const;

const part = (localId: string, type: CustomWidgetPart["type"], rest: Partial<CustomWidgetPart> = {}): CustomWidgetPart =>
  ({ localId, type, x: 0, y: 0, w: 2, h: 1, ...rest } as CustomWidgetPart);

/** The ids the defaults use, so a second "add the defaults" can tell they are already there. */
export const DEFAULT_IDS = {
  titles: "cw-titles", header: "cw-header", sideNav: "cw-side-nav", bottomNav: "cw-bottom-nav",
  tabNav: "cw-tab-nav", iconNav: "cw-icon-nav",
} as const;
/** The sidebar as icons only, which a project that asks for it on a tablet also gets. */
export const SIDE_NAV_ICONS_ID = "cw-side-nav-icons";

/** How the pages are offered on a tablet or a desktop: down the side, as tabs, as large icons, or not at all. */
export type ChromeNav = NonNullable<Shell["nav"]>;

/** What of a project decides its built-in header and navigation. */
export type ChromeProject = { shell?: Shell; security?: { mode?: string } };

export const HEADER_HEIGHT = 60, HEADER_HEIGHT_PHONE = 52, SIDEBAR_WIDTH = 208, SIDEBAR_ICONS_WIDTH = 64;

/** Leaves out what is not set, so a header with no options is exactly the header as it always was. */
function set<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export function defaultCustomWidgets(project: ChromeProject = {}): CustomWidget[] {
  const h = project.shell?.header ?? {};
  const n = project.shell?.navOptions ?? {};
  // With logins on there must be a way to log out, whatever the project says.
  const showUser = h.showUser !== false || project.security?.mode === "login";
  const showProject = h.showProjectName !== false, showPage = h.showPageName !== false;
  const titles = showProject || showPage;
  const drivers = h.drivers ?? "full";
  const centered = h.titleAlign === "center" && titles;
  const align = centered ? { textAlign: "center" as const } : {};
  // One part takes the room that is left, which pushes the clock and the user to the right.
  const grower: "titles" | "drivers" | "spacer" = centered ? "titles" : drivers === "full" ? "drivers" : titles ? "titles" : "spacer";

  const titleParts: CustomWidgetPart[] = [];
  if (showProject) titleParts.push(part("project", "textDisplay", { w: 4, h: 1, bindings: { value: "app:projectName" }, props: { ...bare, fontSize: "base", fontBold: true, ...align } }));
  if (showPage) {
    titleParts.push(h.pageIcon
      ? part("page", "pageTitle", { w: 4, h: 1, props: { ...bare, fontSize: "xs", textColor: "var(--muted-foreground)", ...align } })
      : part("page", "textDisplay", { w: 4, h: 1, bindings: { value: "app:pageName" }, props: { ...bare, fontSize: "xs", textColor: "var(--muted-foreground)", ...align } }));
  }

  const header: CustomWidgetPart[] = [];
  const logo = h.logo ?? "mark";
  if (logo === "mark") {
    header.push(part("logo", "textDisplay", { w: 1, h: 1, flex: { basis: 34 }, props: { staticText: h.logoText || "S", bgColor: "var(--primary)", textColor: "var(--primary-foreground)", borderColor: "none", noPadding: true, fontBold: true, textAlign: "center" } }));
  } else if (logo === "image" && h.logoImage) {
    header.push(part("logo", "image", { w: 2, h: 1, flex: { basis: 96 }, props: { ...bare, src: `lib:${h.logoImage}`, fit: "contain", showLabel: false } }));
  }
  if (titles) {
    header.push(part("titles", "customWidget", { w: 3, h: 1, flex: grower === "titles" ? { basis: 220, grow: 1 } : { basis: 220, phone: { grow: 1 } }, props: { customWidgetId: DEFAULT_IDS.titles, ...bare } }));
  }
  if (drivers === "full") {
    header.push(part("drivers", "driverStatus", { w: 4, h: 1, flex: grower === "drivers" ? { grow: 1 } : { basis: 260 }, hiddenOn: ["phone"], props: { ...bare } }));
  } else if (drivers === "summary") {
    header.push(part("drivers", "driverStatus", { w: 1, h: 1, flex: { basis: 56 }, props: { ...bare, compact: true } }));
  }
  if (grower === "spacer") header.push(part("spacer", "textDisplay", { w: 1, h: 1, flex: { grow: 1 }, props: { ...bare, staticText: "" } }));
  if (h.alarms) header.push(part("alarms", "alarmIndicator", { w: 1, h: 1, flex: { basis: 64 }, props: { ...bare, ...set({ page: h.alarmsPage }) } }));
  if (h.clock !== "none") {
    header.push(part("clock", "clock", { w: 2, h: 1, flex: { basis: 150 }, hiddenOn: ["phone"], props: { ...bare, ...set({ format: h.clock, showWeekday: h.clockWeekday }) } }));
  }
  if (showUser) header.push(part("user", "userMenu", { w: 1, h: 1, flex: { basis: 40 }, props: { ...bare } }));

  const pages = set({ showIcons: n.showIcons === false ? false : undefined, showSettings: n.showSettings === false ? false : undefined });
  const out: CustomWidget[] = [
    {
      id: DEFAULT_IDS.titles, name: "Header titles", description: "The project's name over the page's name", params: [],
      layout: { mode: "stack", direction: "column", gap: 0, justify: "center", align: "stretch" },
      widgets: titleParts,
    },
    {
      id: DEFAULT_IDS.header, name: "Project header", description: "Logo, project and page, driver status, clock and user", params: [],
      layout: { mode: "stack", direction: "row", gap: 12, padding: 8, justify: "start", align: "stretch", phone: { gap: 8, padding: 6 } },
      widgets: header,
    },
    {
      id: DEFAULT_IDS.sideNav, name: "Side navigation", description: "The pages as a list down the left side", params: [],
      layout: { mode: "stack", direction: "column", gap: 0, padding: 0, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 3, h: 6, flex: { grow: 1 }, props: { ...bare, style: "list", ...pages } })],
    },
    {
      id: DEFAULT_IDS.tabNav, name: "Tab navigation", description: "The pages as tabs along the top", params: [],
      // Stretched, not centered: a centered part keeps its own height, which is taller than this row,
      // and stuck out above it. The tabs center themselves in the row.
      layout: { mode: "stack", direction: "row", gap: 0, padding: 8, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "tabs", ...pages } })],
    },
    {
      id: DEFAULT_IDS.iconNav, name: "Icon navigation", description: "The pages as large icon buttons along the top", params: [],
      layout: { mode: "stack", direction: "row", gap: 0, padding: 8, align: "center" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "icons", ...pages } })],
    },
    {
      id: DEFAULT_IDS.bottomNav, name: "Bottom navigation", description: "The pages as a bar along the bottom (for a phone)", params: [],
      layout: { mode: "stack", direction: "row", gap: 0, padding: 0, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "bar", ...pages } })],
    },
  ];
  if (n.tabletIcons) {
    out.push({
      id: SIDE_NAV_ICONS_ID, name: "Side navigation, icons only", description: "The pages as icons down the left side (for a tablet)", params: [],
      layout: { mode: "stack", direction: "column", gap: 0, padding: 0, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 1, h: 6, flex: { grow: 1 }, props: { ...bare, style: "list", showLabels: false, ...set({ showSettings: pages.showSettings }) } })],
    });
  }
  return out;
}

/** The header, the pages' navigation in the style asked for (a phone gets the bottom bar), as slots.
 *  `shell` carries the built-in header's height and the sidebar's width. */
export function defaultFrame(nav: ChromeNav = "sidebar", shell: Shell = {}): FrameSlot[] {
  const wide = ["desktop", "tablet"] as FrameSlot["devices"];
  const height = shell.header?.height ?? HEADER_HEIGHT;
  const o = shell.navOptions ?? {};
  const slots: FrameSlot[] = [{ id: "header", customWidgetId: DEFAULT_IDS.header, edge: "top", size: height, phone: { size: Math.min(height, HEADER_HEIGHT_PHONE) } }];
  if (nav === "none") return slots;
  if (nav === "sidebar") {
    const width = o.width ?? SIDEBAR_WIDTH;
    if (o.tabletIcons) {
      slots.push({ id: "nav", customWidgetId: DEFAULT_IDS.sideNav, edge: "left", size: width, devices: ["desktop"] });
      slots.push({ id: "nav-tablet", customWidgetId: SIDE_NAV_ICONS_ID, edge: "left", size: SIDEBAR_ICONS_WIDTH, devices: ["tablet"] });
    } else {
      slots.push({ id: "nav", customWidgetId: DEFAULT_IDS.sideNav, edge: "left", size: width, devices: wide });
    }
  } else if (nav === "toolbar") {
    slots.push({ id: "nav", customWidgetId: DEFAULT_IDS.iconNav, edge: "top", size: 92, devices: wide });
  } else {
    slots.push({ id: "nav", customWidgetId: DEFAULT_IDS.tabNav, edge: "top", size: 48, devices: wide });
  }
  slots.push({ id: "bottom-nav", customWidgetId: DEFAULT_IDS.bottomNav, edge: "bottom", size: 64, devices: ["phone"] });
  return slots;
}

/** The custom widgets a project is missing from the defaults, and the slots to add (a slot id already
 *  taken is left alone), so adding the defaults twice changes nothing. A project's choices for the
 *  built-in header and navigation are carried into what is added. */
export function missingDefaults(have: { customWidgets?: readonly CustomWidget[]; frame?: readonly FrameSlot[] }, nav: ChromeNav = "sidebar", project: ChromeProject = {}): { customWidgets: CustomWidget[]; frame: FrameSlot[] } {
  const ids = new Set((have.customWidgets ?? []).map((c) => c.id));
  const slotIds = new Set((have.frame ?? []).map((s) => s.id));
  return {
    customWidgets: defaultCustomWidgets(project).filter((c) => !ids.has(c.id)),
    frame: defaultFrame(nav, project.shell).filter((s) => !slotIds.has(s.id)),
  };
}

/** What the screen draws around its pages: the project's frame when it chose custom chrome, else the
 *  built-in header and navigation (the project's navigation style, tabs when it names none). */
export function effectiveFrame(project: { shell?: Shell }): FrameSlot[] {
  return project.shell?.chrome === "custom" ? project.shell.frame ?? [] : defaultFrame(project.shell?.nav ?? "tabs", project.shell);
}

const asMap = (list: CustomWidget[]) => new Map(list.map((c) => [c.id, c]));
const BUILTIN = asMap(defaultCustomWidgets());
// The built-in ones as a project's choices make them, built once for each shell a project has had.
const built = new WeakMap<Shell, { login: boolean; map: Map<string, CustomWidget> }>();

function builtinFor(project: ChromeProject): Map<string, CustomWidget> {
  const shell = project.shell;
  if (!shell || (!shell.header && !shell.navOptions)) return BUILTIN;
  const login = project.security?.mode === "login";
  const hit = built.get(shell);
  if (hit && hit.login === login) return hit.map;
  const map = asMap(defaultCustomWidgets(project));
  built.set(shell, { login, map });
  return map;
}

/** A custom widget by id: the project's own, else one of the built-in ones the default frame uses,
 *  as the project's header and navigation choices make them. */
export function findCustomWidget(project: ChromeProject & { customWidgets?: readonly CustomWidget[] }, id: string | undefined): CustomWidget | undefined {
  if (!id) return undefined;
  return project.customWidgets?.find((c) => c.id === id) ?? builtinFor(project).get(id);
}

// ── The look of the built-in header and navigation ─────────────────────────

const FONT_SCALE = { small: 0.875, normal: 1, large: 1.15 } as const;
const paint = (v: string | undefined) => (v ? tokenColor(v) ?? v : undefined);

export type SlotStyle = Record<string, string | number>;

/** A look as the CSS a frame slot is drawn with. The widgets inside read the theme's colors and text
 *  sizes as custom properties, so setting those on the slot restyles everything in it. */
export function shellStyleVars(s: ShellStyle | undefined, nav = false): SlotStyle {
  const v: SlotStyle = {};
  if (!s) return v;
  const bg = paint(s.background), fg = paint(s.textColor), border = paint(s.borderColor);
  if (bg) {
    v.background = bg;
    v["--card"] = bg;
    // What sits on the bar a shade apart from it (an idle tab, the user button).
    v["--secondary"] = `color-mix(in srgb, ${fg ?? "var(--card-foreground)"} 12%, ${bg})`;
  }
  if (fg) {
    v.color = fg;
    v["--card-foreground"] = fg;
    v["--foreground"] = fg;
    v["--muted-foreground"] = `color-mix(in srgb, ${fg} 72%, transparent)`;
  }
  if (border) v["--border"] = border;
  if (s.font) { v.fontFamily = FONTS[s.font].stack; v["--font-sans"] = FONTS[s.font].stack; }
  const scale = FONT_SCALE[s.fontSize ?? "normal"];
  if (scale !== 1) for (const [k, size] of Object.entries(TYPE_SCALE)) v[`--type-${k}`] = `calc(${size} * ${scale})`;
  if (s.bold) v.fontWeight = 600;
  if (nav) {
    const activeBg = paint(s.activeBackground), activeFg = paint(s.activeTextColor);
    if (activeBg) v["--primary"] = activeBg;
    if (activeFg) v["--primary-foreground"] = activeFg;
  }
  return v;
}

const NAV_SLOTS = ["nav", "nav-tablet", "bottom-nav"];

/** The look of the header and navigation slots, by slot id. It goes by the slot's id, so a project
 *  that turned the built-in ones into custom chrome keeps the look on the slots it kept. */
export function chromeStyles(project: { shell?: Shell }): Record<string, SlotStyle> {
  const shell = project.shell;
  if (!shell) return {};
  const out: Record<string, SlotStyle> = {};
  const header = shellStyleVars(shell.header?.style);
  if (Object.keys(header).length) out.header = header;
  const nav = shellStyleVars(shell.navOptions?.style, true);
  if (Object.keys(nav).length) for (const id of NAV_SLOTS) out[id] = nav;
  return out;
}

// WCAG 2.1 contrast, for the editor's warning beside a text and background pair.
function luminance(hex: string): number | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two #rgb or #rrggbb colors, or undefined when either is something else
 *  (a token, a named color), which cannot be worked out without the theme. */
export function contrastRatio(a: string | undefined, b: string | undefined): number | undefined {
  const la = a ? luminance(a) : undefined, lb = b ? luminance(b) : undefined;
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── The built-in header and navigation as designed custom widgets ──────────
// "Edit as custom widgets" turns the built-in ones, with the project's choices, into custom widgets
// with a designed size, laid out as the stack draws them on a desktop: the parts before the one that
// takes the room left stay left, those after it stay right, and that one stretches. They are then
// edited on the canvas like any custom widget.

const PAD = 8, GAP_X = 12;
const NAV_LENGTH = 720;

type DesignedSizes = { header: number; sideWidth: number };

function anchoredHeader(stackHeader: CustomWidget, titles: CustomWidget, height: number): CustomWidget {
  const width = DESKTOP_WIDTH;
  const inner = height - 2 * PAD;
  const growIndex = stackHeader.widgets.findIndex((w) => w.flex?.grow);
  const sizeOf = (p: CustomWidgetPart) => (p.localId === "logo" && p.type === "textDisplay" ? inner : p.flex?.basis ?? 120);
  const out: CustomWidgetPart[] = [];
  const place = (p: CustomWidgetPart, x: number, w: number, anchorX: CustomWidgetPart["anchorX"]) => {
    const { flex: _flex, ...rest } = p;
    // The names are the titles custom widget's two lines, put in the header itself so each can be moved.
    if (p.localId === "titles") {
      const lines = titles.widgets;
      const lineH = Math.round(inner / Math.max(1, lines.length));
      lines.forEach((t, i) => {
        const { flex: _f, ...line } = t;
        out.push({ ...line, x, y: PAD + i * lineH, w, h: i === lines.length - 1 ? inner - i * lineH : lineH, anchorX, ...(lines.length > 1 ? { anchorY: i === 0 ? "top" : "bottom" } : { anchorY: "center" }) });
      });
      return;
    }
    out.push({ ...rest, x, y: PAD, w, h: inner, anchorX, anchorY: "stretch" });
  };
  const parts = stackHeader.widgets;
  const left = growIndex < 0 ? parts : parts.slice(0, growIndex);
  const right = growIndex < 0 ? [] : parts.slice(growIndex + 1);
  let x = PAD;
  for (const p of left) { const w = sizeOf(p); place(p, x, w, "left"); x += w + GAP_X; }
  let end = width - PAD;
  const placedRight: [CustomWidgetPart, number, number][] = [];
  for (const p of [...right].reverse()) { const w = sizeOf(p); end -= w; placedRight.unshift([p, end, w]); end -= GAP_X; }
  if (growIndex >= 0) place(parts[growIndex]!, x, Math.max(40, end - x), "stretch");
  for (const [p, px, w] of placedRight) place(p, px, w, "right");
  // A spacer only pushed the others apart; anchors do that now.
  return { ...stackHeader, layout: undefined, width, height, widgets: out.filter((p) => !(p.localId === "spacer" && p.type === "textDisplay")) };
}

const DESKTOP_WIDTH = 1280, PHONE_WIDTH = 390;

/** A navigation custom widget as one page list filling a designed box. */
function filledNav(nav: CustomWidget, width: number, height: number): CustomWidget {
  const list = nav.widgets[0]!;
  const { flex: _flex, ...rest } = list;
  return { ...nav, layout: undefined, width, height, widgets: [{ ...rest, x: 0, y: 0, w: width, h: height, anchorX: "stretch", anchorY: "stretch" }] };
}

/** The built-in header and navigation, with the project's choices, as custom widgets with a designed
 *  size, and the frame that pins them. The header's two lines of names become parts of the header. */
export function builtinAsDesigned(project: ChromeProject): { customWidgets: CustomWidget[]; frame: FrameSlot[] } {
  const shell = project.shell ?? {};
  const sizes: DesignedSizes = { header: shell.header?.height ?? HEADER_HEIGHT, sideWidth: shell.navOptions?.width ?? SIDEBAR_WIDTH };
  const built = defaultCustomWidgets(project);
  const byId = new Map(built.map((c) => [c.id, c]));
  const titles = byId.get(DEFAULT_IDS.titles)!;
  const out: CustomWidget[] = [anchoredHeader(byId.get(DEFAULT_IDS.header)!, titles, sizes.header)];
  out.push(filledNav(byId.get(DEFAULT_IDS.sideNav)!, sizes.sideWidth, NAV_LENGTH));
  out.push(filledNav(byId.get(DEFAULT_IDS.tabNav)!, DESKTOP_WIDTH, 48));
  out.push(filledNav(byId.get(DEFAULT_IDS.iconNav)!, DESKTOP_WIDTH, 92));
  out.push(filledNav(byId.get(DEFAULT_IDS.bottomNav)!, PHONE_WIDTH, 64));
  const icons = byId.get(SIDE_NAV_ICONS_ID);
  if (icons) out.push(filledNav(icons, SIDEBAR_ICONS_WIDTH, NAV_LENGTH));
  return { customWidgets: out, frame: defaultFrame(shell.nav ?? "tabs", shell) };
}
