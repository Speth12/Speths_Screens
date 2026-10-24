import type { ImageFit } from "@speths-screens/shared-types";

// An image widget can carry its fit under two keys: `fit`, set in the
// properties panel, and `objectFit`, set when the image is dropped from the
// image library. The panel's choice wins. The operator app and the HTML
// export use the same rule.
export function imageFit(config: { fit?: unknown; objectFit?: unknown } | undefined): ImageFit {
  for (const v of [config?.fit, config?.objectFit]) {
    if (v === "contain" || v === "cover" || v === "fill") return v;
  }
  return "contain";
}
