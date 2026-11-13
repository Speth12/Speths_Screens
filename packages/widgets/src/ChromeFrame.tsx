// The header and navigation around a page: each slot is a custom widget pinned to an edge, and the
// page is drawn in the room that is left. A slot can instead lie over the page along its edge
// (overlay), taking no room from it. The operator and the IDE both draw the screen with this.
import type React from "react";
import type { ReactNode } from "react";
import type { FrameSlot } from "@speths-screens/shared-types";
import { slotsByEdge, type Device, type FrameEdge } from "./layout";
import { FrameSlotContext, WidgetRenderer } from "./widgets";

const BORDER_SIDE = { top: "borderBottom", bottom: "borderTop", left: "borderRight", right: "borderLeft" } as const;

type Styles = Record<string, Record<string, string | number>>;
type Placed = { slot: FrameSlot; size: number };

/** Where an overlay slot lies over the page: along its edge, as thick as its size. Overlays on the
 *  same edge sit one after another, the first nearest the edge. */
function overlayBox(edge: FrameEdge, size: number, offset: number): React.CSSProperties {
  switch (edge) {
    case "top": return { position: "absolute", left: 0, right: 0, top: offset, height: size };
    case "bottom": return { position: "absolute", left: 0, right: 0, bottom: offset, height: size };
    case "left": return { position: "absolute", top: 0, bottom: 0, left: offset, width: size };
    case "right": return { position: "absolute", top: 0, bottom: 0, right: offset, width: size };
  }
}

function Slot({ slot, edge, style, styles }: { slot: FrameSlot; edge: FrameEdge; style: React.CSSProperties; styles?: Styles }) {
  return (
    <div data-testid={`frame-${slot.id}`} data-overlay={slot.overlay ? "" : undefined} className="shrink-0 overflow-hidden"
      style={{
        ...style,
        // An overlay slot has no background or border of its own: it is drawn on the page.
        ...(slot.overlay ? { zIndex: 20 } : {
          background: "var(--card)", color: "var(--card-foreground)",
          [BORDER_SIDE[edge]]: "var(--line-width, 1px) solid var(--border)",
        }),
        // A project's look for this slot: mostly the theme's custom properties, set for what is inside.
        ...(styles?.[slot.id] as React.CSSProperties | undefined),
      }}>
      <FrameSlotContext.Provider value={true}>
        <WidgetRenderer w={{
          id: slot.id, type: "customWidget", x: 0, y: 0, w: 12, h: 8,
          props: { customWidgetId: slot.customWidgetId, params: slot.params, noPadding: true, bgColor: "transparent", borderColor: "none" },
        } as never} />
      </FrameSlotContext.Provider>
    </div>
  );
}

function Slots({ slots, edge, styles }: { slots: Placed[]; edge: FrameEdge; styles?: Styles }) {
  const horizontal = edge === "top" || edge === "bottom";
  return <>{slots.map(({ slot, size }) => <Slot key={slot.id} slot={slot} edge={edge} styles={styles} style={horizontal ? { height: size } : { width: size }} />)}</>;
}

function Overlays({ edges, styles }: { edges: Record<FrameEdge, Placed[]>; styles?: Styles }) {
  const out: ReactNode[] = [];
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    let offset = 0;
    for (const { slot, size } of edges[edge]) {
      out.push(<Slot key={slot.id} slot={slot} edge={edge} styles={styles} style={overlayBox(edge, size, offset)} />);
      offset += size;
    }
  }
  return <>{out}</>;
}

/** `frame` as it sits on `device`, around `children` (the page). Fills the height it is given.
 *  `styles` is the look of slots by id (chromeStyles). */
export function ChromeFrame({ frame, device, styles, children }: { frame: readonly FrameSlot[]; device: Device; styles?: Styles; children: ReactNode }) {
  const all = slotsByEdge(frame, device);
  const split = (overlay: boolean) => Object.fromEntries(
    (Object.keys(all) as FrameEdge[]).map((e) => [e, all[e].filter((p) => !!p.slot.overlay === overlay)]),
  ) as Record<FrameEdge, Placed[]>;
  const edges = split(false), overlays = split(true);
  return (
    <div className="flex flex-col h-full min-h-0 w-full" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <Slots slots={edges.top} edge="top" styles={styles} />
      <div className="flex flex-1 min-h-0">
        <Slots slots={edges.left} edge="left" styles={styles} />
        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
          {children}
          <Overlays edges={overlays} styles={styles} />
        </div>
        <Slots slots={edges.right} edge="right" styles={styles} />
      </div>
      <Slots slots={edges.bottom} edge="bottom" styles={styles} />
    </div>
  );
}
