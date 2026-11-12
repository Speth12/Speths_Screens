// The header and navigation around a page: each slot is a custom widget pinned to an edge, and the
// page is drawn in the room that is left. The operator and the IDE both draw the screen with this.
import type React from "react";
import type { ReactNode } from "react";
import type { FrameSlot } from "@speths-screens/shared-types";
import { slotsByEdge, type Device, type FrameEdge } from "./layout";
import { WidgetRenderer } from "./widgets";

const BORDER_SIDE = { top: "borderBottom", bottom: "borderTop", left: "borderRight", right: "borderLeft" } as const;

type Styles = Record<string, Record<string, string | number>>;

function Slots({ slots, edge, styles }: { slots: { slot: FrameSlot; size: number }[]; edge: FrameEdge; styles?: Styles }) {
  const horizontal = edge === "top" || edge === "bottom";
  return (
    <>
      {slots.map(({ slot, size }) => (
        <div key={slot.id} data-testid={`frame-${slot.id}`} className="shrink-0 overflow-hidden"
          style={{
            ...(horizontal ? { height: size } : { width: size }),
            background: "var(--card)", color: "var(--card-foreground)",
            [BORDER_SIDE[edge]]: "var(--line-width, 1px) solid var(--border)",
            // A project's look for this slot: mostly the theme's custom properties, set for what is inside.
            ...(styles?.[slot.id] as React.CSSProperties | undefined),
          }}>
          <WidgetRenderer w={{
            id: slot.id, type: "customWidget", x: 0, y: 0, w: 12, h: 8,
            props: { customWidgetId: slot.customWidgetId, params: slot.params, noPadding: true, bgColor: "transparent", borderColor: "none" },
          } as never} />
        </div>
      ))}
    </>
  );
}

/** `frame` as it sits on `device`, around `children` (the page). Fills the height it is given.
 *  `styles` is the look of slots by id (chromeStyles). */
export function ChromeFrame({ frame, device, styles, children }: { frame: readonly FrameSlot[]; device: Device; styles?: Styles; children: ReactNode }) {
  const edges = slotsByEdge(frame, device);
  return (
    <div className="flex flex-col h-full min-h-0 w-full" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <Slots slots={edges.top} edge="top" styles={styles} />
      <div className="flex flex-1 min-h-0">
        <Slots slots={edges.left} edge="left" styles={styles} />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</div>
        <Slots slots={edges.right} edge="right" styles={styles} />
      </div>
      <Slots slots={edges.bottom} edge="bottom" styles={styles} />
    </div>
  );
}
