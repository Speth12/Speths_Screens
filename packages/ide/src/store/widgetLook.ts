// A widget drawn as a card (background, border, label: the default) or plain, as a drawing on whatever
// is behind it, so a number can sit on a picture. Plain is not a setting of its own: it is the frame
// settings that make the widget library draw no card (no background, no border), with the label off.

export type Look = "card" | "plain";
type Props = Record<string, unknown>;

const clear = (v: unknown) => v === "transparent" || v === "none";

/** Plain: no background and no border. */
export function lookOf(props: Props | undefined): Look {
  return clear(props?.bgColor) && clear(props?.borderColor) ? "plain" : "card";
}

/** The widget's settings with the look changed. Going back to a card returns the background, border
 *  and label to the theme's own; colors the widget was given before are not kept. */
export function withLook(props: Props | undefined, look: Look): Props | undefined {
  const next: Props = { ...props };
  if (look === "plain") {
    next.bgColor = "transparent";
    next.borderColor = "transparent";
    next.showLabel = false;
  } else {
    delete next.bgColor;
    delete next.borderColor;
    delete next.showLabel;
  }
  return Object.keys(next).length ? next : undefined;
}
