import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, THEMES, themeById, themeStyle, themeVars, tokenColor, type ThemeColors } from "./tokens";
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

it("an unknown or missing theme id is the default theme", () => {
  expect(themeById("scada-dark").id).toBe("high-performance");
  expect(themeById(undefined).id).toBe("high-performance");
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
