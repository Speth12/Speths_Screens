// The open page as the IDE draws it: widgets positioned by the project's
// canvas snap (grid cells or pixels) on a stage that is either the fixed
// resolution or the extent of the widgets, then scaled to the window by the
// shared rules in packages/widgets/src/layout.ts. (The operator used to lay
// every page out on its own 12-column grid and ignored both settings.)
import { WidgetRenderer, fitScale, placement, stageSize, type Size } from "@speths-screens/widgets";
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
};

/** The scale a page is drawn at: a fixed resolution always fits the window; a dynamic one fits its width when asked. */
export function pageScale(stage: Size & { fixed: boolean }, viewport: Size, fit: boolean): number {
  if (stage.fixed) return fitScale(stage, viewport);
  return fit ? fitScale(stage, viewport, { fitHeight: false }) : 1;
}

export function PageStage({ widgets, resolution, pixel, fit, viewport }: Props) {
  const stage = stageSize(resolution, widgets, pixel);
  const scale = pageScale(stage, viewport, fit);
  return (
    // The outer box has the scaled size, so scrolling and centering follow what is seen.
    <div data-testid="page-stage" style={{ width: stage.width * scale, height: stage.height * scale, margin: stage.fixed ? "0 auto" : undefined }}>
      <div style={{ position: "relative", width: stage.width, height: stage.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {widgets.map((w) => (
          <div key={w.id} style={{ position: "absolute", ...placement(w, pixel) }}>
            <WidgetRenderer w={w} />
          </div>
        ))}
      </div>
    </div>
  );
}
