// The screen's header and navigation. The operator draws a project's own frame when it asks for
// custom chrome; otherwise it draws this built-in one. The built-in header and navigation are
// ordinary custom widgets, built from the page list, clock, driver status and user menu widgets and
// pinned to the screen edges, so the IDE draws exactly what the operator draws. A project that
// chooses custom chrome gets copies of them to edit.
import type { CustomWidget, CustomWidgetPart, FrameSlot, Shell } from "@speths-screens/shared-types";

const bare = { noPadding: true, bgColor: "transparent", borderColor: "none" } as const;

const part = (localId: string, type: CustomWidgetPart["type"], rest: Partial<CustomWidgetPart> = {}): CustomWidgetPart =>
  ({ localId, type, x: 0, y: 0, w: 2, h: 1, ...rest } as CustomWidgetPart);

/** The ids the defaults use, so a second "add the defaults" can tell they are already there. */
export const DEFAULT_IDS = {
  titles: "cw-titles", header: "cw-header", sideNav: "cw-side-nav", bottomNav: "cw-bottom-nav",
  tabNav: "cw-tab-nav", iconNav: "cw-icon-nav",
} as const;

/** How the pages are offered on a tablet or a desktop: down the side, as tabs, or as large icons. */
export type ChromeNav = NonNullable<Shell["nav"]>;

export function defaultCustomWidgets(): CustomWidget[] {
  return [
    {
      id: DEFAULT_IDS.titles, name: "Header titles", description: "The project's name over the page's name", params: [],
      layout: { mode: "stack", direction: "column", gap: 0, justify: "center", align: "stretch" },
      widgets: [
        part("project", "textDisplay", { w: 4, h: 1, bindings: { value: "app:projectName" }, props: { ...bare, fontSize: "base", fontBold: true } }),
        part("page", "textDisplay", { w: 4, h: 1, bindings: { value: "app:pageName" }, props: { ...bare, fontSize: "xs", textColor: "var(--muted-foreground)" } }),
      ],
    },
    {
      id: DEFAULT_IDS.header, name: "Project header", description: "Logo, project and page, driver status, clock and user", params: [],
      layout: { mode: "stack", direction: "row", gap: 12, padding: 8, justify: "start", align: "stretch", phone: { gap: 8, padding: 6 } },
      widgets: [
        part("logo", "textDisplay", { w: 1, h: 1, flex: { basis: 34 }, props: { staticText: "S", bgColor: "var(--primary)", textColor: "var(--primary-foreground)", borderColor: "none", noPadding: true, fontBold: true, textAlign: "center" } }),
        part("titles", "customWidget", { w: 3, h: 1, flex: { basis: 220, phone: { grow: 1 } }, props: { customWidgetId: DEFAULT_IDS.titles, ...bare } }),
        part("drivers", "driverStatus", { w: 4, h: 1, flex: { grow: 1 }, hiddenOn: ["phone"], props: { ...bare } }),
        part("clock", "clock", { w: 2, h: 1, flex: { basis: 150 }, hiddenOn: ["phone"], props: { ...bare } }),
        part("user", "userMenu", { w: 1, h: 1, flex: { basis: 40 }, props: { ...bare } }),
      ],
    },
    {
      id: DEFAULT_IDS.sideNav, name: "Side navigation", description: "The pages as a list down the left side", params: [],
      layout: { mode: "stack", direction: "column", gap: 0, padding: 0, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 3, h: 6, flex: { grow: 1 }, props: { ...bare, style: "list" } })],
    },
    {
      id: DEFAULT_IDS.tabNav, name: "Tab navigation", description: "The pages as tabs along the top", params: [],
      layout: { mode: "stack", direction: "row", gap: 0, padding: 8, align: "center" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "tabs" } })],
    },
    {
      id: DEFAULT_IDS.iconNav, name: "Icon navigation", description: "The pages as large icon buttons along the top", params: [],
      layout: { mode: "stack", direction: "row", gap: 0, padding: 8, align: "center" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "icons" } })],
    },
    {
      id: DEFAULT_IDS.bottomNav, name: "Bottom navigation", description: "The pages as a bar along the bottom (for a phone)", params: [],
      layout: { mode: "stack", direction: "row", gap: 0, padding: 0, align: "stretch" },
      widgets: [part("pages", "pageList", { w: 6, h: 1, flex: { grow: 1 }, props: { ...bare, style: "bar" } })],
    },
  ];
}

/** The header, the pages' navigation in the style asked for (a phone always gets the bottom bar), as slots. */
export function defaultFrame(nav: ChromeNav = "sidebar"): FrameSlot[] {
  const wide = ["desktop", "tablet"] as FrameSlot["devices"];
  const navSlot: FrameSlot =
    nav === "sidebar" ? { id: "nav", customWidgetId: DEFAULT_IDS.sideNav, edge: "left", size: 208, devices: wide }
    : nav === "toolbar" ? { id: "nav", customWidgetId: DEFAULT_IDS.iconNav, edge: "top", size: 92, devices: wide }
    : { id: "nav", customWidgetId: DEFAULT_IDS.tabNav, edge: "top", size: 48, devices: wide };
  return [
    { id: "header", customWidgetId: DEFAULT_IDS.header, edge: "top", size: 60, phone: { size: 52 } },
    navSlot,
    { id: "bottom-nav", customWidgetId: DEFAULT_IDS.bottomNav, edge: "bottom", size: 64, devices: ["phone"] },
  ];
}

/** The custom widgets a project is missing from the defaults, and the slots to add (a slot id already
 *  taken is left alone), so adding the defaults twice changes nothing. */
export function missingDefaults(have: { customWidgets?: readonly CustomWidget[]; frame?: readonly FrameSlot[] }, nav: ChromeNav = "sidebar"): { customWidgets: CustomWidget[]; frame: FrameSlot[] } {
  const ids = new Set((have.customWidgets ?? []).map((c) => c.id));
  const slotIds = new Set((have.frame ?? []).map((s) => s.id));
  return {
    customWidgets: defaultCustomWidgets().filter((c) => !ids.has(c.id)),
    frame: defaultFrame(nav).filter((s) => !slotIds.has(s.id)),
  };
}

/** What the screen draws around its pages: the project's frame when it chose custom chrome, else the
 *  built-in header and navigation (the project's navigation style, tabs when it names none). */
export function effectiveFrame(project: { shell?: Shell }): FrameSlot[] {
  return project.shell?.chrome === "custom" ? project.shell.frame ?? [] : defaultFrame(project.shell?.nav ?? "tabs");
}

const BUILTIN = new Map(defaultCustomWidgets().map((c) => [c.id, c]));

/** A custom widget by id: the project's own, else one of the built-in ones the default frame uses. */
export function findCustomWidget(project: { customWidgets?: readonly CustomWidget[] }, id: string | undefined): CustomWidget | undefined {
  if (!id) return undefined;
  return project.customWidgets?.find((c) => c.id === id) ?? BUILTIN.get(id);
}
