import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, PRESETS, THEMES, resolveTheme, themeStyle, themeVars, tokenColor, type ThemeColors } from "./tokens";
import { suit } from "./drive";

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Key = keyof ThemeColors;
/** Text on its background: WCAG AA for text, 4.5:1. */
const TEXT: [Key, Key][] = [
  ["foreground", "background"], ["cardForeground", "card"], ["mutedForeground", "card"], ["mutedForeground", "background"],
  ["primaryForeground", "primary"], ["secondaryForeground", "secondary"], ["processValue", "card"], ["processSetpoint", "card"],
];
/** Graphics (alarm and state colors) on the surfaces they sit on: 3:1. */
const GRAPHICS: [Key, Key][] = (["alarmCritical", "alarmWarning", "alarmInfo", "alarmShelved", "processRunning", "processBadQuality", "danger", "warning"] as Key[])
  .flatMap((k) => [[k, "card"], [k, "background"]] as [Key, Key][]);

describe.each(THEMES.map((t) => [t.id, t] as const))("theme %s", (_id, theme) => {
  it.each(TEXT)("text %s on %s meets 4.5:1", (fg, bg) => {
    expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHICS)("%s on %s meets 3:1", (fg, bg) => {
    expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(3);
  });
  it("has a ten-step gray scale, light to dark", () => {
    expect(theme.gray).toHaveLength(10);
    const l = theme.gray.map(luminance);
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeLessThan(l[i - 1]!);
  });
  it("sets every token, shape, type, spacing and shadow included", () => {
    const vars = themeVars(theme);
    for (const name of ["--background", "--card", "--primary", "--border", "--danger", "--radius", "--line-width", "--font-sans", "--font-mono", "--font-size", "--pad", "--shadow", "--gray-0", "--gray-9"]) {
      expect(vars[name], name).toBeTruthy();
    }
    for (const t of COLOR_TOKENS) expect(vars[`--${t}`], t).toMatch(/^#[0-9a-f]{6}$/);
    expect(themeStyle(theme)).toContain("--alarm-critical: ");
  });
});

const MODES = ["light", "dark"] as const;
const PALETTES = ["calm", "modern", "slate", "sand", "forest", "navy", "contrast"] as const;

// Every palette in both modes must pass, whichever preset or element mix picks it.
describe.each(PALETTES.flatMap((p) => MODES.map((m) => [p, m] as const)))("palette %s, %s", (palette, mode) => {
  const theme = resolveTheme({ palette, mode });
  it.each(TEXT)("text %s on %s meets 4.5:1", (fg, bg) => {
    expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHICS)("%s on %s meets 3:1", (fg, bg) => {
    expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("resolving a theme", () => {
  it("a missing theme is the calm preset", () => {
    expect(resolveTheme(undefined).id).toBe("calm");
    expect(resolveTheme(null).colors.background).toBe("#c8c8c8");
  });
  it("each preset sets its own mode, palette, corners, depth and density", () => {
    expect(resolveTheme({ preset: "modern" }).mode).toBe("dark");
    expect(resolveTheme({ preset: "clean" }).shape.radius).toBe("12px");
    expect(resolveTheme({ preset: "clean" }).shadow).not.toBe("none");
    expect(resolveTheme({ preset: "calm" }).shape.radius).toBe("2px");
  });
  it("an element replaces the preset's choice and leaves the rest", () => {
    const base = resolveTheme({ preset: "clean" });
    const mixed = resolveTheme({ preset: "clean", corners: "square", density: "touch", font: "roboto" });
    expect(mixed.shape.radius).toBe("2px");
    expect(mixed.space.control).toBe("2.75rem");
    expect(mixed.type.fontSans).toContain("Roboto");
    expect(mixed.colors).toEqual(base.colors);
    expect(mixed.shadow).toBe(base.shadow);
  });
  it("borderless has no line and no shadow", () => {
    const t = resolveTheme({ depth: "borderless" });
    expect([t.shape.lineWidth, t.shadow]).toEqual(["0px", "none"]);
  });
  it("a browser's mode beats the project's", () => {
    expect(resolveTheme({ preset: "modern" }, "light").colors.background).toBe("#f4f6f9");
    expect(resolveTheme({ preset: "calm", mode: "light" }, "dark").mode).toBe("dark");
  });
  it("an accent replaces the primary color, with text that reads on it", () => {
    const light = resolveTheme({ accent: "#ffd400" }).colors;
    const dark = resolveTheme({ accent: "#102a43" }).colors;
    expect(light.primary).toBe("#ffd400");
    expect(contrast(light.primary, light.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.primary, dark.primaryForeground)).toBeGreaterThanOrEqual(4.5);
  });
  it("the touch density has controls of at least 44 px", () => {
    expect(parseFloat(resolveTheme({ density: "touch" }).space.control) * 16).toBeGreaterThanOrEqual(44);
  });
  it("every preset is listed", () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual(Object.keys(PRESETS).sort());
  });
});

describe("color tokens in driven properties", () => {
  it.each([
    ["token:alarm-critical", "var(--alarm-critical)"],
    ["token:process-running", "var(--process-running)"],
    ["token:no-such-token", undefined],
    ["#dc2626", "#dc2626"],
  ])("%s", (v, want) => {
    expect(tokenColor(v)).toBe(want);
    expect(suit("bgColor", v)).toBe(want);
  });
});
