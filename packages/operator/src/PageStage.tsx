// The open page as the IDE draws it: widgets positioned by the project's
// canvas snap (grid cells or pixels) on a stage that is either the fixed
// resolution or the extent of the widgets, then scaled to the window by the
// shared rules in packages/widgets/src/layout.ts. (The operator used to lay
// every page out on its own 12-column grid and ignored both settings.)
import { WidgetRenderer, fitScale, forDevice, placement, stageSize, type Device, type Size } from "@speths-screens/widgets";
import type { CanvasResolution, Widget } from "@speths-screens/shared-types";

type Props = {
  widgets: readonly Widget[];
  resolution?: CanvasResolution;
  /** The project's canvasSnap: "pixel" or else grid cells. */
  pixel: boolean;
  /** Dynamic resolution only: scale the page to the window's width instead of showing it at full size. */
  fit: boolean;
  /** The room the page has, in pixels; zero until the window is measured. */
  viewport: Size;
  /** The screen size: widgets sit where their tablet or phone layout puts them. Missing is the desktop. */
  device?: Device;
};

/** The scale a page is drawn at: a fixed resolution always fits the window; a dynamic one fits its width when asked. */
export function pageScale(stage: Size & { fixed: boolean }, viewport: Size, fit: boolean): number {
  if (stage.fixed) return fitScale(stage, viewport);
  return fit ? fitScale(stage, viewport, { fitHeight: false }) : 1;
}

export function PageStage({ widgets: all, resolution: fixedOrNot, pixel, fit, viewport, device = "desktop" }: Props) {
  const widgets = forDevice(all, device);
  // A fixed stage is a desktop's size: a page with its own layout for this device is as big as its widgets.
  const ownLayout = device !== "desktop" && all.some((w) => (device === "phone" ? w.layout?.phone || w.layout?.tablet : w.layout?.tablet));
  const resolution = ownLayout ? undefined : fixedOrNot;
  const stage = stageSize(resolution, widgets, pixel);
  const scale = pageScale(stage, viewport, fit);
  return (
    // The outer box has the scaled size, so scrolling and centering follow what is seen.
    <div data-testid="page-stage" style={{ width: stage.width * scale, height: stage.height * scale, margin: stage.fixed ? "0 auto" : undefined }}>
      <div style={{ position: "relative", width: stage.width, height: stage.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {widgets.map((w) => (
          // The id and type let a test (or a person inspecting the page) find a widget; a widget hidden by its visibility tag leaves this box empty.
          <div key={w.id} data-widget-id={w.id} data-widget-type={w.type} style={{ position: "absolute", ...placement(w, pixel) }}>
            <WidgetRenderer w={w} />
          </div>
        ))}
      </div>
    </div>
  );
}
