// The screen being designed: the header and navigation the operator will draw, around the page, at the
// width of the screen size being edited. The project's theme applies here, not the IDE's own.
import type { CSSProperties, ReactNode } from "react";
import type { FrameSlot } from "@speths-screens/shared-types";
import { ChromeFrame, DEVICE_WIDTH, WidgetHostProvider, type Device, type SlotStyle } from "@speths-screens/widgets";
import { ideHost } from "../widgets";

export function ScreenFrame({ frame, device, theme, styles, exact, children }: {
  /** A custom widget on the canvas: as wide as its own box, not at least a desktop's width. */
  exact?: boolean;
  frame: readonly FrameSlot[];
  /** The look of the header and navigation slots (chromeStyles). */
  styles?: Record<string, SlotStyle>;
  device: Device;
  theme: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div data-testid="screen-frame" data-device={device} className="relative inline-block align-top rounded-md overflow-hidden"
      style={{
        ...theme,
        // The desktop is as wide as its page; a tablet and a phone are as wide as the device.
        width: exact || device === "desktop" ? "max-content" : DEVICE_WIDTH[device],
        minWidth: !exact && device === "desktop" ? DEVICE_WIDTH.desktop : undefined,
        border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,.15)",
        background: "var(--background)", color: "var(--foreground)",
        fontFamily: "var(--font-sans, inherit)",
      }}>
      <WidgetHostProvider value={ideHost}>
        <ChromeFrame frame={frame} device={device} styles={styles}>{children}</ChromeFrame>
      </WidgetHostProvider>
    </div>
  );
}
