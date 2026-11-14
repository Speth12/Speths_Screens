// Named styles: a look kept under a name in the project, which any number of widgets take by naming
// it (styleId). A change to the style reaches them all; a setting a widget has itself wins.
import type { NamedStyle } from "@speths-screens/shared-types";

/** The settings that are a widget's look, and so can be kept in a style. What a widget shows or is
 *  bound to (its label, its tags, its own settings) is never part of a style. */
export const STYLE_KEYS = [
  "bgColor", "borderColor", "textColor", "cardStyle", "noPadding", "padding", "radius", "borderWidth", "shadow",
  "fontFamily", "fontSize", "fontPx", "fontWeight", "fontBold", "fontItalic", "fontUnderline", "strike",
  "letterSpacing", "lineHeight", "textTransform", "textShadow", "wrap", "textAlign", "valign",
  "showLabel", "showUnit", "labelSize", "labelWeight", "labelColor", "labelTransform", "labelPosition", "labelIcon",
] as const;
const IS_STYLE_KEY = new Set<string>(STYLE_KEYS);

type Props = Record<string, unknown>;

/** The look settings among a widget's settings. */
export function lookSettings(props: Props | undefined): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props ?? {})) if (IS_STYLE_KEY.has(k) && v !== undefined) out[k] = v;
  return out;
}

/** A widget's settings with its style's look under them: the style's look settings, then the widget's own. */
export function withStyle<P extends Props | undefined>(props: P, style: NamedStyle | undefined): P {
  if (!style) return props;
  return { ...lookSettings(style.props as Props), ...(props ?? {}) } as P;
}

/** A widget's settings once it takes a style: the style named, and the widget's own look settings
 *  that the style also sets removed, so the style is what shows. */
export function applyStyle(props: Props | undefined, style: NamedStyle): Props {
  const mine = lookSettings(style.props as Props);
  const next: Props = {};
  for (const [k, v] of Object.entries(props ?? {})) if (!(k in mine)) next[k] = v;
  return { ...next, styleId: style.id };
}

/** A widget's settings with its style taken off. `keep` writes the style's look into the widget, so it
 *  looks the same but no longer follows the style. */
export function removeStyle(props: Props | undefined, style: NamedStyle | undefined, keep: boolean): Props | undefined {
  const { styleId: _id, ...rest } = props ?? {};
  const next = keep && style ? { ...lookSettings(style.props as Props), ...rest } : rest;
  return Object.keys(next).length ? next : undefined;
}
