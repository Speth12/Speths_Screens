// @speths-screens/widgets: the one widget library for the IDE canvas, the
// IDE preview and the operator screen.
export { WidgetRenderer, KeypadModal, RENDERED_TYPES, fmt, resolveColor, rewriteBinding, toggled, actionWrite } from "./widgets";
export {
  WidgetHostProvider, useHost, useTag, useTags, inertHost, EMPTY_TAG,
  type WidgetHost, type TagState, type Quality, type WriteRequest, type AlarmView,
} from "./host";
export { SymbolSVG } from "./SymbolSVG";
export * from "./symbols";
export type { Field, FieldKind, WidgetManifest, BindingSlot, WidgetEvent } from "./manifest";
export { Icon, ICON_NAMES } from "./icons";
export { translator, pickLanguage, translateWidget, collectTexts, type Translate } from "./translate";
export { MANIFESTS, FRAME_SETTINGS, DEFAULT_STATES, manifestFor, type SettingsGroup } from "./manifests";
export { BUILTIN_PRESETS } from "./presets";
export {
  COL_W, ROW_H, GAP, PREVIEW_MINIMUM, placement, pageExtent, stageSize, fitScale,
  DEVICE_WIDTH, PHONE_MAX, TABLET_MAX, deviceFor, effectivePlacement, forDevice, placeFor, type Device,
  type Size, type Box, type Placeable, type CanvasResolutionLike,
} from "./layout";
export { applyTransform, suit, driveValue, DRIVEN_KIND, type DrivenValue } from "./drive";
export {
  THEMES, PRESETS, resolveTheme, COLOR_TOKENS, FONTS, TYPE_SCALE, themeVars, themeStyle, applyTheme, tokenColor,
  type Theme, type ThemeColors, type FontId, type TypeScale,
} from "./tokens";
export { Gallery, GALLERY_STATES, galleryCell, galleryInsert, type GalleryState } from "./gallery";
export type { GallerySample } from "./manifest";
