// Design tokens and themes (Phase 3, step 6). A theme is a set of values for
// the tokens, written out as CSS custom properties. Widgets and both apps read
// the properties, never a theme, so a later theme with its own look and feel
// changes values here and no widget code.
//
// Three layers:
//   base     a 10-step gray scale (--gray-0 white … --gray-9 near black)
//   UI       the names widgets and Tailwind's remapped zinc scale use
//            (--background, --card, --primary, --border, …)
//   process  plant states (--process-running, --alarm-critical, …); a driven
//            color property can name one as "token:alarm-critical"
// plus shape, type, spacing and shadow, so a theme can change the feel too.
import type { ThemeID } from "@speths-screens/shared-types";

/** The colors of a theme, by token. */
export interface ThemeColors {
  background: string; foreground: string;
  card: string; cardForeground: string;
  primary: string; primaryForeground: string;
  secondary: string; secondaryForeground: string;
  muted: string; mutedForeground: string;
  border: string;
  danger: string; warning: string; success: string;
  processNormal: string; processOff: string; processRunning: string;
  processValue: string; processSetpoint: string; processBadQuality: string;
  alarmCritical: string; alarmWarning: string; alarmInfo: string; alarmShelved: string;
}

export interface Theme {
  id: ThemeID;
  name: string;
  tagline: string;
  /** --gray-0 (lightest) to --gray-9 (darkest). */
  gray: readonly string[];
  colors: ThemeColors;
  /** Corner radius and line weight of frames and controls. */
  shape: { radius: string; lineWidth: string };
  type: { fontSans: string; fontMono: string; fontSize: string };
  /** Padding inside a widget's frame. */
  space: { pad: string };
  /** Shadow under a widget's frame ("none" for flat). */
  shadow: string;
}

/** ISA-101 high performance: a mid-gray screen, dark text, no gradients,
 *  shadows or 3D; running and stopped shown by shade, and saturated color
 *  kept for abnormal states. Every pair a screen uses meets WCAG AA. */
export const HIGH_PERFORMANCE: Theme = {
  id: "high-performance",
  name: "High performance",
  tagline: "ISA-101: gray, calm, color only for abnormal states",
  gray: ["#ffffff", "#f2f2f2", "#e6e6e6", "#dcdcdc", "#c8c8c8", "#b0b0b0", "#8a8a8a", "#5c5c5c", "#3d3d3d", "#1f1f1f"],
  colors: {
    background: "#c8c8c8", foreground: "#1f1f1f",
    card: "#dcdcdc", cardForeground: "#1f1f1f",
    primary: "#2f4f6f", primaryForeground: "#ffffff",
    secondary: "#bdbdbd", secondaryForeground: "#1f1f1f",
    muted: "#d2d2d2", mutedForeground: "#4a4a4a",
    border: "#8a8a8a",
    danger: "#c00000", warning: "#995000", success: "#3d3d3d",
    processNormal: "#dcdcdc", processOff: "#f2f2f2", processRunning: "#3d3d3d",
    processValue: "#0b2a4a", processSetpoint: "#1f4e79", processBadQuality: "#6b21a8",
    alarmCritical: "#c00000", alarmWarning: "#995000", alarmInfo: "#1957a6", alarmShelved: "#5c5c5c",
  },
  shape: { radius: "2px", lineWidth: "1px" },
  type: { fontSans: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif", fontMono: "Consolas, 'DejaVu Sans Mono', monospace", fontSize: "13px" },
  space: { pad: "0.5rem" },
  shadow: "none",
};

/** Every theme. Each later theme adds its id to ThemeId in schema.json. */
export const THEMES: readonly Theme[] = [HIGH_PERFORMANCE];

export const DEFAULT_THEME_ID: ThemeID = "high-performance";

/** The theme with this id; the default for a missing or unknown one. */
export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? HIGH_PERFORMANCE;
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The color tokens a driven property may name as "token:<name>". */
export const COLOR_TOKENS: readonly string[] = [
  "process-normal", "process-off", "process-running", "process-value", "process-setpoint", "process-bad-quality",
  "alarm-critical", "alarm-warning", "alarm-info", "alarm-shelved",
];

/** A theme's CSS custom properties. */
export function themeVars(t: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  t.gray.forEach((g, i) => { vars[`--gray-${i}`] = g; });
  for (const [k, v] of Object.entries(t.colors)) vars[`--${kebab(k)}`] = v;
  vars["--radius"] = t.shape.radius;
  vars["--line-width"] = t.shape.lineWidth;
  vars["--font-sans"] = t.type.fontSans;
  vars["--font-mono"] = t.type.fontMono;
  vars["--font-size"] = t.type.fontSize;
  vars["--pad"] = t.space.pad;
  vars["--shadow"] = t.shadow;
  return vars;
}

/** Sets a theme's properties on an element (the page root by default). */
export function applyTheme(t: Theme, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(themeVars(t))) el.style.setProperty(k, v);
  el.setAttribute("data-theme-id", t.id);
}

/** The properties as an inline style string, for the HTML export. */
export function themeStyle(t: Theme): string {
  return Object.entries(themeVars(t)).map(([k, v]) => `${k}: ${v}`).join("; ");
}

/** A color as CSS: "token:alarm-critical" becomes var(--alarm-critical); an
 *  unknown token is undefined; any other color is itself. */
export function tokenColor(v: string): string | undefined {
  if (!v.startsWith("token:")) return v;
  const name = v.slice("token:".length);
  return COLOR_TOKENS.includes(name) ? `var(--${name})` : undefined;
}
