// How a button is drawn: its outline (rectangle, square, round, pill), its look (from a plain solid
// color to a realistic domed pushbutton in a metal ring), and what is on it (text, an icon, a logo).
// Colors are worked out from one color, so every look reads on a light and a dark page and a button
// can take any color. What a press does is the widget's events, not this file's.
import type { ButtonColor, PageIcon } from "@speths-screens/shared-types";
import { Icon } from "./icons";
import { readableOn } from "./variants";

export type ButtonLook = "filled" | "outlined" | "ghost" | "flat" | "industrial" | "raised" | "glossy" | "pushbutton";
export type ButtonShape = "rectangle" | "square" | "round" | "pill";

/** The named button colors. */
export const BUTTON_COLORS: Record<ButtonColor, string> = {
  blue: "#2563eb", green: "#059669", red: "#dc2626", amber: "#f59e0b", zinc: "#52525b", purple: "#9333ea", orange: "#f97316", white: "#f4f4f5",
};

const RADIUS: Record<string, string> = { none: "0", sm: "2px", md: "6px", lg: "10px", full: "999px" };
const darker = (c: string, by: number) => `color-mix(in srgb, ${c} ${100 - by}%, #000)`;
const lighter = (c: string, by: number) => `color-mix(in srgb, ${c} ${100 - by}%, #fff)`;
/** The color as text on the page: pulled toward the page's own text color so it reads on light and dark. */
const asText = (c: string) => `color-mix(in srgb, ${c} 72%, var(--foreground))`;

/** The CSS of a look in a color. `on` is a toggle that is on. */
export function buttonLook(look: ButtonLook, color: string, on = false): React.CSSProperties {
  const text = readableOn(color);
  switch (look) {
    case "outlined": return { background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : "transparent", color: asText(color), border: `1.5px solid ${color}` };
    case "ghost": return { background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : "transparent", color: asText(color), border: "1.5px solid transparent" };
    case "flat": return { background: `color-mix(in srgb, ${color} ${on ? 30 : 16}%, transparent)`, color: asText(color), border: "none" };
    case "industrial": return {
      background: `linear-gradient(180deg, ${lighter(color, 14)}, ${darker(color, 16)})`, color: text,
      border: `1px solid ${darker(color, 45)}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 1px 2px rgba(0,0,0,.3)",
    };
    case "raised": return {
      background: `linear-gradient(180deg, ${lighter(color, 8)}, ${color})`, color: text, border: "none",
      boxShadow: `0 var(--btn-depth, 5px) 0 ${darker(color, 38)}, 0 calc(var(--btn-depth, 5px) + 3px) 6px rgba(0,0,0,.3)`,
    };
    case "glossy": return {
      background: `linear-gradient(180deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.12) 48%, rgba(0,0,0,.06) 52%, rgba(0,0,0,.22) 100%), ${color}`, color: text,
      border: `1px solid ${darker(color, 35)}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), 0 2px 4px rgba(0,0,0,.3)",
    };
    default: return { background: color, color: text, border: "none", boxShadow: on ? `0 0 0 2px var(--background, #fff), 0 0 0 4px ${color}` : undefined };
  }
}

export interface ButtonFaceProps {
  look?: ButtonLook; shape?: ButtonShape; rounded?: string;
  /** A CSS color. */
  color: string;
  on?: boolean;
  label?: string;
  /** What is drawn with the text: an icon from the set, a typed symbol, or a picture (its URL). */
  iconName?: PageIcon; icon?: string; image?: string;
  layout?: "beside" | "stacked" | "iconOnly";
}

/** The picture, icon or symbol of a button, sized for where it sits. */
function Mark({ iconName, icon, image, big }: Pick<ButtonFaceProps, "iconName" | "icon" | "image"> & { big: boolean }) {
  if (image) return <img src={image} alt="" draggable={false} style={{ height: big ? "2.2em" : "1.4em", maxWidth: "100%", objectFit: "contain" }} />;
  if (iconName) return <Icon name={iconName} size={big ? 26 : 18} />;
  if (icon) return <span className={big ? "text-2xl leading-none" : "text-base leading-none"}>{icon}</span>;
  return null;
}

export function ButtonFace({ look = "filled", shape = "rectangle", rounded, color, on = false, label, iconName, icon, image, layout = "beside" }: ButtonFaceProps) {
  const has = !!(iconName || icon || image);
  const text = label ?? "Press";
  const content = (
    <span className={`flex items-center justify-center min-w-0 ${layout === "stacked" ? "flex-col gap-1" : "gap-1.5"}`}>
      <Mark iconName={iconName} icon={icon} image={image} big={layout !== "beside"} />
      {(layout !== "iconOnly" || !has) && <span className="min-w-0 truncate">{text}</span>}
    </span>
  );
  const equal = shape === "square" || shape === "round";
  const radius = shape === "round" || shape === "pill" ? "999px" : RADIUS[rounded ?? "md"] ?? "6px";
  // A square or a round button is as large as fits its place, in the middle of it.
  const box: React.CSSProperties = equal ? { aspectRatio: "1 / 1", height: "100%", maxWidth: "100%", maxHeight: "100%", margin: "0 auto" } : { width: "100%", height: "100%" };
  const common = { "data-layout": layout, "data-look": look, "data-shape": shape, "aria-label": layout === "iconOnly" ? text : undefined, "aria-pressed": on || undefined };

  if (look === "pushbutton") {
    // A domed cap in a metal ring: the ring is brushed metal, the cap is lit from the upper left and
    // glows when a toggle is on. Pressing it pushes the cap in.
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ containerType: "size" }}>
        <button {...common} className="ss-btn ss-push text-sm font-semibold" style={{
          ...box, borderRadius: radius, padding: equal ? "9%" : "min(9cqh, 9cqw)",
          background: "conic-gradient(from 210deg, #f4f4f5, #a1a1aa, #e4e4e7, #71717a, #d4d4d8, #a1a1aa, #f4f4f5)",
          boxShadow: "0 3px 6px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.35)", border: "none",
        }}>
          <span className="ss-cap flex items-center justify-center w-full h-full" style={{
            borderRadius: radius, color: readableOn(color),
            background: `radial-gradient(circle at 34% 26%, ${lighter(color, on ? 62 : 45)} 0%, ${lighter(color, on ? 18 : 4)} 32%, ${color} 62%, ${darker(color, 32)} 100%)`,
            boxShadow: `inset 0 -3px 6px rgba(0,0,0,.35), inset 0 2px 3px rgba(255,255,255,.45), 0 0 0 1.5px rgba(0,0,0,.45)${on ? `, 0 0 14px 3px ${color}` : ""}`,
            textShadow: "0 1px 1px rgba(0,0,0,.35)",
          }}>{content}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <button {...common} className={`ss-btn ${look === "raised" ? "ss-raised" : ""} text-sm font-medium`}
        style={{ ...box, borderRadius: radius, padding: "0 0.6em", ...buttonLook(look, color, on) }}>
        {content}
      </button>
    </div>
  );
}

/** How a button answers a touch: it dims a little under the pointer and goes in when pressed. One
 *  style element for the page; a browser that asks for less motion gets no movement. */
export const BUTTON_CSS = `
.ss-btn { cursor: pointer; transition: transform 0.08s, filter 0.12s, box-shadow 0.08s; overflow: hidden; }
.ss-btn:hover { filter: brightness(1.07); }
.ss-btn:active { transform: scale(0.97); filter: brightness(0.95); }
.ss-raised { margin-bottom: 5px !important; height: calc(100% - 6px) !important; }
.ss-raised:active { transform: translateY(4px); --btn-depth: 1px; }
.ss-push:active { transform: none; }
.ss-push:active .ss-cap { transform: scale(0.95); filter: brightness(0.9); }
.ss-cap { transition: transform 0.08s, filter 0.12s; }
@media (prefers-reduced-motion: reduce) { .ss-btn, .ss-cap { transition: none; } .ss-btn:active, .ss-raised:active, .ss-push:active .ss-cap { transform: none; } }`;
