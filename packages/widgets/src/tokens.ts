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
import type {
  Background, CardStyle, FontAsset, Theme as ThemeSpec, ThemeCorners, ThemeDensity, ThemeDepth, ThemeMode, ThemePalette, ThemePreset,
} from "@speths-screens/shared-types";
import { FONT_LIST } from "./fontList";

/** The text sizes widgets draw with, smallest to largest, as CSS lengths. Tailwind's text-xs to
 *  text-3xl read them (--type-xs to --type-3xl), so a theme changes every widget's text at once. */
export interface TypeScale { xs: string; sm: string; base: string; lg: string; xl: string; "2xl": string; "3xl": string }

export const TYPE_SCALE: TypeScale = {
  xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem",
};

export type FontKind = "sans" | "condensed" | "mono" | "serif" | "display";
export type FontId = (typeof FONT_LIST)[number]["id"] | "system";
export interface FontInfo {
  name: string;
  /** The CSS font-family list: the font, then what a device has that is like it, then a generic family. */
  stack: string;
  kind: FontKind;
  /** The weights it draws: every weight from the first to the second (a variable font), or just these. */
  weights: readonly number[];
  variable: boolean;
}

/** What a device draws when a font is missing, by the kind of font. Each ends in a generic family. */
const FALLBACK: Record<FontKind, string> = {
  sans: "'Segoe UI', system-ui, sans-serif",
  condensed: "'Arial Narrow', 'Segoe UI', system-ui, sans-serif",
  mono: "Consolas, 'DejaVu Sans Mono', monospace",
  serif: "Georgia, 'Times New Roman', serif",
  display: "'Segoe UI', system-ui, sans-serif",
};
const quoted = (name: string) => (/^[A-Za-z]+$/.test(name) ? name : `'${name}'`);

/** The fonts a project can choose from. All but "system" (whatever the device has) ship with the widget
 *  library (fonts/fonts.css, written by scripts/fonts/fetch.mjs), so a PLC with no internet shows them. */
export const FONTS: Record<FontId, FontInfo> = {
  ...(Object.fromEntries(FONT_LIST.map((f) => [f.id, { name: f.name, stack: `${quoted(f.name)}, ${FALLBACK[f.kind]}`, kind: f.kind, weights: f.weights, variable: f.variable }])) as unknown as Record<Exclude<FontId, "system">, FontInfo>),
  system: { name: "System", stack: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", kind: "sans", weights: [100, 900], variable: true },
};

/** The CSS family name a project's own font is declared under. */
export const projectFontFamily = (id: string) => `pf-${id}`;

/** The CSS font-family list for a font id: a bundled font, or else one of the project's own. */
export function fontStack(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const bundled = (FONTS as Record<string, FontInfo | undefined>)[id];
  return bundled ? bundled.stack : `'${projectFontFamily(id)}', ${FALLBACK.sans}`;
}

/** The @font-face rules that make a project's own fonts available under their ids. */
export function projectFontsCss(fonts: readonly FontAsset[] | undefined): string {
  return (fonts ?? [])
    .filter((f) => /^[a-z0-9][a-z0-9-]*$/.test(f.id) && f.dataUrl.startsWith("data:"))
    .map((f) => `@font-face{font-family:'${projectFontFamily(f.id)}';font-display:swap;src:url("${f.dataUrl.replace(/["\\\n\r]/g, "")}")}`)
    .join("\n");
}

/** Puts the project's own fonts into the page (one style element, replaced when the fonts change). */
export function applyProjectFonts(fonts: readonly FontAsset[] | undefined, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc) return;
  const css = projectFontsCss(fonts);
  let el = doc.getElementById("project-fonts");
  if (!css) { el?.remove(); return; }
  if (!el) { el = doc.createElement("style"); el.id = "project-fonts"; doc.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

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

/** A resolved theme: every token has a value. Build one with resolveTheme. */
export interface Theme {
  /** The preset it started from. */
  id: ThemePreset;
  name: string;
  tagline: string;
  mode: ThemeMode;
  /** --gray-0 (lightest) to --gray-9 (darkest). */
  gray: readonly string[];
  colors: ThemeColors;
  /** Corner radius and line weight of frames and controls. */
  shape: { radius: string; lineWidth: string };
  type: { fontSans: string; fontMono: string; fontSize: string; scale: TypeScale };
  /** Padding inside a widget's frame, and the least height of a control. */
  space: { pad: string; control: string };
  /** Shadow under a widget's frame ("none" for flat). */
  shadow: string;
}

type Palette = { gray: readonly string[]; light: ThemeColors; dark: ThemeColors };

/** The colors. calm is ISA-101 gray with a muted blue; modern is cool white or charcoal with a
 *  bright blue. Every pair a screen uses meets WCAG AA (tokens.test.ts). */
// The newer palettes keep the modern palette's state and alarm colors, which are chosen to read on a
// near-white and a near-black page, and change the page, the cards, the lines and the accent. Each
// still has to pass the contrast test (tokens.test.ts), which is why their pages stay near white or
// near black.
const MODERN_LIGHT_STATES = {
  danger: "#c62828", warning: "#9a5b00", success: "#1b7a43",
  processRunning: "#1b7a43", processValue: "#0b3a73", processSetpoint: "#1f4e9a", processBadQuality: "#6b21a8",
  alarmCritical: "#c62828", alarmWarning: "#9a5b00", alarmInfo: "#1957a6", alarmShelved: "#5b6877",
} as const;
const MODERN_DARK_STATES = {
  danger: "#ff6b6b", warning: "#f5a524", success: "#4cc38a",
  processRunning: "#4cc38a", processValue: "#8cc0ff", processSetpoint: "#7fb0ff", processBadQuality: "#c79bff",
  alarmCritical: "#ff6b6b", alarmWarning: "#f5a524", alarmInfo: "#6fb0ff", alarmShelved: "#9aa8b8",
} as const;

/** One mode of a palette from its page, card, text, line and accent colors. */
function mode(dark: boolean, c: { page: string; card: string; text: string; soft: string; muted: string; mutedText: string; line: string; accent: string; onAccent: string }, more: Partial<ThemeColors> = {}): ThemeColors {
  return {
    background: c.page, foreground: c.text, card: c.card, cardForeground: c.text,
    primary: c.accent, primaryForeground: c.onAccent,
    secondary: c.soft, secondaryForeground: c.text, muted: c.muted, mutedForeground: c.mutedText, border: c.line,
    processNormal: c.card, processOff: c.muted,
    ...(dark ? MODERN_DARK_STATES : MODERN_LIGHT_STATES), ...more,
  };
}

const SLATE: Palette = {
  gray: ["#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#1e293b", "#0f172a"],
  light: mode(false, { page: "#eef2f6", card: "#ffffff", text: "#0f172a", soft: "#e2e8f0", muted: "#f1f5f9", mutedText: "#475569", line: "#cbd5e1", accent: "#334155", onAccent: "#ffffff" }),
  dark: mode(true, { page: "#0f172a", card: "#1e293b", text: "#e8eef6", soft: "#334155", muted: "#172033", mutedText: "#a8b6c8", line: "#3b4a61", accent: "#9fb4d0", onAccent: "#0f172a" }),
};
const SAND: Palette = {
  gray: ["#ffffff", "#fbf8f3", "#f5f0e8", "#e9e0d2", "#d8cbb8", "#b3a48e", "#857763", "#5e5344", "#33291e", "#1c1814"],
  light: mode(false, { page: "#f5f0e8", card: "#fffdf9", text: "#2a2118", soft: "#ebe2d4", muted: "#f1eadf", mutedText: "#5e5344", line: "#d8cbb8", accent: "#7a4d12", onAccent: "#ffffff" }),
  dark: mode(true, { page: "#1c1814", card: "#29231c", text: "#f1e9dd", soft: "#3a3128", muted: "#241e18", mutedText: "#bfb19d", line: "#4a4034", accent: "#e3b673", onAccent: "#241807" }),
};
const FOREST: Palette = {
  gray: ["#ffffff", "#f5f9f6", "#eef4ef", "#dde8e0", "#c2d3c7", "#96ad9c", "#687f6f", "#48594e", "#1f2d25", "#0e1712"],
  light: mode(false, { page: "#eef4ef", card: "#ffffff", text: "#12211a", soft: "#dfeae2", muted: "#eaf1ec", mutedText: "#48594e", line: "#c8d8cd", accent: "#1c6a44", onAccent: "#ffffff" }),
  dark: mode(true, { page: "#0e1712", card: "#17241c", text: "#e4efe8", soft: "#243529", muted: "#131f18", mutedText: "#a3b8a9", line: "#2c4033", accent: "#63d09a", onAccent: "#06210f" }),
};
const NAVY: Palette = {
  gray: ["#ffffff", "#f4f6fb", "#edf1f8", "#dbe2f0", "#bfcbe2", "#93a3c4", "#67779c", "#465478", "#17213f", "#0a1124"],
  light: mode(false, { page: "#edf1f8", card: "#ffffff", text: "#101a33", soft: "#dfe6f4", muted: "#e8edf7", mutedText: "#465478", line: "#cbd5ea", accent: "#1e3a8a", onAccent: "#ffffff" }),
  dark: mode(true, { page: "#0a1124", card: "#141d38", text: "#e6ebf8", soft: "#22305a", muted: "#0f1830", mutedText: "#a5b2d0", line: "#2a3963", accent: "#7ea6ff", onAccent: "#06122e" }),
};
// The strongest contrast there is: black on white or white on black, heavy lines, and state colors
// darkened or brightened to stand at 7:1 where they are text.
const CONTRAST: Palette = {
  gray: ["#ffffff", "#f2f2f2", "#e0e0e0", "#c8c8c8", "#a0a0a0", "#787878", "#505050", "#303030", "#181818", "#000000"],
  light: mode(false, { page: "#ffffff", card: "#ffffff", text: "#000000", soft: "#e6e6e6", muted: "#f2f2f2", mutedText: "#303030", line: "#000000", accent: "#00339a", onAccent: "#ffffff" },
    { danger: "#a40000", warning: "#7a4300", success: "#0b5a2c", alarmCritical: "#a40000", alarmWarning: "#7a4300", alarmInfo: "#00339a", alarmShelved: "#404040", processRunning: "#0b5a2c" }),
  dark: mode(true, { page: "#000000", card: "#000000", text: "#ffffff", soft: "#2a2a2a", muted: "#161616", mutedText: "#e0e0e0", line: "#ffffff", accent: "#ffe600", onAccent: "#000000" },
    { danger: "#ff8a8a", warning: "#ffc04d", success: "#6ee7a8", alarmCritical: "#ff8a8a", alarmWarning: "#ffc04d", alarmInfo: "#9cc8ff", alarmShelved: "#c8c8c8", processRunning: "#6ee7a8" }),
};

const PALETTES: Record<ThemePalette, Palette> = {
  calm: {
    gray: ["#ffffff", "#f2f2f2", "#e6e6e6", "#dcdcdc", "#c8c8c8", "#b0b0b0", "#8a8a8a", "#5c5c5c", "#3d3d3d", "#1f1f1f"],
    light: {
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
    dark: {
      background: "#2b2b2b", foreground: "#e8e8e8",
      card: "#353535", cardForeground: "#e8e8e8",
      primary: "#7fa6cf", primaryForeground: "#10202f",
      secondary: "#454545", secondaryForeground: "#e8e8e8",
      muted: "#3d3d3d", mutedForeground: "#b8b8b8",
      border: "#5c5c5c",
      danger: "#ff6b6b", warning: "#f0a030", success: "#b8b8b8",
      processNormal: "#353535", processOff: "#2b2b2b", processRunning: "#d0d0d0",
      processValue: "#9cc7f0", processSetpoint: "#8fb8e8", processBadQuality: "#c79bff",
      alarmCritical: "#ff6b6b", alarmWarning: "#f0a030", alarmInfo: "#6fb0ff", alarmShelved: "#a0a0a0",
    },
  },
  modern: {
    gray: ["#ffffff", "#f4f6f9", "#eef2f7", "#dde3ea", "#c3ccd8", "#9aa8b8", "#6b7a8c", "#4b5a6b", "#243040", "#0f151d"],
    light: {
      background: "#f4f6f9", foreground: "#16202c",
      card: "#ffffff", cardForeground: "#16202c",
      primary: "#2459a6", primaryForeground: "#ffffff",
      secondary: "#e6ebf2", secondaryForeground: "#16202c",
      muted: "#eef2f7", mutedForeground: "#4b5a6b",
      border: "#dde3ea",
      danger: "#c62828", warning: "#9a5b00", success: "#1b7a43",
      processNormal: "#ffffff", processOff: "#eef2f7", processRunning: "#1b7a43",
      processValue: "#0b3a73", processSetpoint: "#1f4e9a", processBadQuality: "#6b21a8",
      alarmCritical: "#c62828", alarmWarning: "#9a5b00", alarmInfo: "#1957a6", alarmShelved: "#5b6877",
    },
    dark: {
      background: "#0f151d", foreground: "#e6edf5",
      card: "#18212c", cardForeground: "#e6edf5",
      primary: "#5b9dff", primaryForeground: "#07182e",
      secondary: "#243040", secondaryForeground: "#e6edf5",
      muted: "#1f2935", mutedForeground: "#a3b0bf",
      border: "#2b3747",
      danger: "#ff6b6b", warning: "#f5a524", success: "#4cc38a",
      processNormal: "#18212c", processOff: "#0f151d", processRunning: "#4cc38a",
      processValue: "#8cc0ff", processSetpoint: "#7fb0ff", processBadQuality: "#c79bff",
      alarmCritical: "#ff6b6b", alarmWarning: "#f5a524", alarmInfo: "#6fb0ff", alarmShelved: "#9aa8b8",
    },
  },
  slate: SLATE, sand: SAND, forest: FOREST, navy: NAVY, contrast: CONTRAST,
};

const CORNERS: Record<ThemeCorners, string> = { square: "2px", soft: "6px", round: "12px" };
const DEPTH: Record<ThemeDepth, { shadow: string; line: string }> = {
  flat: { shadow: "none", line: "1px" },
  raised: { shadow: "0 1px 3px rgba(15, 21, 29, 0.18)", line: "1px" },
  borderless: { shadow: "none", line: "0px" },
};
const DENSITY: Record<ThemeDensity, { pad: string; size: string; control: string }> = {
  compact: { pad: "0.5rem", size: "13px", control: "2rem" },
  comfortable: { pad: "0.75rem", size: "14px", control: "2.25rem" },
  touch: { pad: "1rem", size: "16px", control: "2.75rem" },
};

interface Preset {
  name: string; tagline: string; mode: ThemeMode; palette: ThemePalette;
  corners: ThemeCorners; depth: ThemeDepth; density: ThemeDensity; font: FontId;
  /** How its cards are drawn; plain when it names none. */
  cardStyle?: CardStyle;
  /** What is behind its pages; the palette's page color when it names none. */
  background?: Background;
}

/** How a project's theme draws its cards: what it says, else its preset's way, else plain. */
export function cardStyleOf(spec: ThemeSpec | undefined | null): CardStyle {
  return spec?.cardStyle ?? PRESETS[spec?.preset ?? "calm"].cardStyle ?? "plain";
}

/** What a project's theme puts behind every page: what it says, else its preset's (most have none). */
export function themeBackground(spec: ThemeSpec | undefined | null): Background | undefined {
  return spec?.background ?? PRESETS[spec?.preset ?? "calm"].background;
}

/** What is drawn behind a page, as CSS: the page's own background, else its background color, else
 *  the theme's background; undefined leaves the theme's page color. */
export function pageBackground(
  page: { background?: Background; backgroundColor?: string } | undefined, theme: ThemeSpec | undefined | null,
  images: readonly { id: string; dataUrl: string }[] | undefined,
): React.CSSProperties | undefined {
  const url = (id: string) => images?.find((i) => i.id === id)?.dataUrl;
  return backgroundCss(page?.background, url)
    ?? (page?.backgroundColor ? { background: page.backgroundColor } : undefined)
    ?? backgroundCss(themeBackground(theme), url);
}

const PATTERNS: Record<string, (mark: string) => React.CSSProperties> = {
  dots: (m) => ({ backgroundImage: `radial-gradient(circle, ${m} 1.2px, transparent 1.6px)`, backgroundSize: "18px 18px" }),
  squares: (m) => ({ backgroundImage: `linear-gradient(${m} 1px, transparent 1px), linear-gradient(90deg, ${m} 1px, transparent 1px)`, backgroundSize: "24px 24px" }),
  stripes: (m) => ({ backgroundImage: `repeating-linear-gradient(45deg, ${m} 0 1px, transparent 1px 12px)` }),
};
const PICTURE_FIT: Record<string, React.CSSProperties> = {
  fill: { backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center" },
  whole: { backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" },
  tile: { backgroundRepeat: "repeat" },
  stretch: { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" },
};
const cssColor = (v: string | undefined) => (v ? tokenColor(v) ?? v : undefined);

/** A background as CSS. `pictureUrl` gives a project image's URL from its id. Undefined when there is
 *  nothing to draw (no background, or a picture that is missing), which leaves the theme's page color. */
export function backgroundCss(bg: Background | undefined | null, pictureUrl: (id: string) => string | undefined): React.CSSProperties | undefined {
  if (!bg) return undefined;
  const page = "var(--background)";
  const color = cssColor(bg.color);
  if (bg.kind === "solid") return color ? { background: color } : undefined;
  if (bg.kind === "gradient") return { background: `linear-gradient(${bg.angle ?? 180}deg, ${color ?? page}, ${cssColor(bg.color2) ?? "var(--secondary)"})` };
  if (bg.kind === "pattern") {
    const mark = cssColor(bg.color2) ?? "color-mix(in srgb, var(--foreground) 14%, transparent)";
    return { backgroundColor: color ?? page, ...(PATTERNS[bg.pattern ?? "dots"] ?? PATTERNS.dots!)(mark) };
  }
  const url = bg.picture ? pictureUrl(bg.picture) : undefined;
  if (!url) return color ? { background: color } : undefined;
  const fit = PICTURE_FIT[bg.fit ?? "fill"] ?? PICTURE_FIT.fill!;
  const safe = `url("${url.replace(/["\\\n\r]/g, "")}")`;
  // Some of the page color laid over the picture, so text and plain widgets on it still read.
  const dim = Math.max(0, Math.min(0.95, bg.dim ?? 0));
  const veil = dim > 0 ? `linear-gradient(color-mix(in srgb, ${page} ${Math.round(dim * 100)}%, transparent), color-mix(in srgb, ${page} ${Math.round(dim * 100)}%, transparent)), ` : "";
  return { backgroundColor: color ?? page, backgroundImage: `${veil}${safe}`, ...fit, ...(veil && fit.backgroundSize ? { backgroundSize: `auto, ${fit.backgroundSize}` } : {}) };
}

/** The ready-made starting points. An element in a project's theme replaces the preset's. */
export const PRESETS: Record<ThemePreset, Preset> = {
  calm: {
    name: "Calm", tagline: "ISA-101: gray, flat, color only for abnormal states",
    mode: "light", palette: "calm", corners: "square", depth: "flat", density: "compact", font: "inter",
  },
  clean: {
    name: "Clean", tagline: "White cards, soft depth, round corners",
    mode: "light", palette: "modern", corners: "round", depth: "raised", density: "comfortable", font: "inter",
  },
  modern: {
    name: "Modern", tagline: "Charcoal, soft corners, borders instead of shadows",
    mode: "dark", palette: "modern", corners: "soft", depth: "flat", density: "comfortable", font: "inter",
  },
  industrial: {
    name: "Industrial", tagline: "Dark slate, square, cards pressed into the panel",
    mode: "dark", palette: "slate", corners: "square", depth: "flat", density: "compact", font: "roboto-condensed", cardStyle: "inset",
  },
  soft: {
    name: "Soft", tagline: "Warm sand, round corners, softly shaded cards",
    mode: "light", palette: "sand", corners: "round", depth: "raised", density: "comfortable", font: "nunito", cardStyle: "gradient",
  },
  glass: {
    name: "Glass", tagline: "Deep navy, see-through cards over a gradient",
    mode: "dark", palette: "navy", corners: "round", depth: "borderless", density: "comfortable", font: "inter", cardStyle: "glass",
    background: { kind: "gradient", color: "#0a1124", color2: "#1d3a7a", angle: 150 },
  },
  highContrast: {
    name: "High contrast", tagline: "Black on white, heavy lines, the strongest contrast",
    mode: "light", palette: "contrast", corners: "square", depth: "flat", density: "comfortable", font: "inter", cardStyle: "outlined",
  },
};

/** Black or white text, whichever reads better on this #rrggbb. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.18 ? "#10202f" : "#ffffff";
}

/** The theme a project asks for: its preset (calm when missing), with each element it names
 *  replacing the preset's. `mode` also lets a browser pick light or dark for itself. */
export function resolveTheme(spec?: ThemeSpec | null, mode?: ThemeMode | null): Theme {
  const id = spec?.preset ?? "calm";
  const p = PRESETS[id];
  const m = mode ?? spec?.mode ?? p.mode;
  const palette = PALETTES[spec?.palette ?? p.palette];
  const colors = { ...palette[m] };
  if (spec?.accent) { colors.primary = spec.accent; colors.primaryForeground = textOn(spec.accent); }
  const depth = DEPTH[spec?.depth ?? p.depth];
  const density = DENSITY[spec?.density ?? p.density];
  return {
    id, name: p.name, tagline: p.tagline, mode: m,
    gray: palette.gray, colors,
    shape: { radius: CORNERS[spec?.corners ?? p.corners], lineWidth: depth.line },
    type: { fontSans: fontStack(spec?.font) ?? FONTS[p.font].stack, fontMono: "Consolas, 'DejaVu Sans Mono', monospace", fontSize: density.size, scale: TYPE_SCALE },
    space: { pad: density.pad, control: density.control },
    shadow: depth.shadow,
  };
}

/** Each preset as it stands, for the gallery and the tests. */
export const THEMES: readonly Theme[] = (Object.keys(PRESETS) as ThemePreset[]).map((id) => resolveTheme({ preset: id }));

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
  for (const [k, v] of Object.entries(t.type.scale)) vars[`--type-${k}`] = v;
  vars["--pad"] = t.space.pad;
  vars["--control-height"] = t.space.control;
  vars["--shadow"] = t.shadow;
  return vars;
}

/** Sets a theme's properties on an element (the page root by default). */
export function applyTheme(t: Theme, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(themeVars(t))) el.style.setProperty(k, v);
  el.setAttribute("data-theme-id", t.id);
  el.setAttribute("data-theme-mode", t.mode);
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
