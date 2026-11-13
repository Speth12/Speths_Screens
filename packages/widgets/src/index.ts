// @speths-screens/widgets: the one widget library for the IDE canvas, the
// IDE preview and the operator screen.
export { WidgetRenderer, KeypadModal, RENDERED_TYPES, fmt, resolveColor, rewriteBinding, toggled, actionWrite } from "./widgets";
export {
  WidgetHostProvider, useHost, useTag, useTags, inertHost, EMPTY_TAG,
  type WidgetHost, type TagState, type Quality, type WriteRequest, type AlarmView, type PageInfo, type DriverInfo, type UserInfo,
} from "./host";
export { formatClock, groupPages, driverSummary, alarmSummary, listedPages, SETTINGS_PAGE_ID } from "./shell";
export { recipeSetsOf, mayEditRecipes } from "./recipeSets";
export { parseCell } from "./recipes";
export { ChromeFrame } from "./ChromeFrame";
export { PopupLayer, popupBox, usePopups, type PopupSpec } from "./popup";
export { AccessContext, AccessGate, PageAccess, canView, needInside, roleName, roleRank, userRank, type Need } from "./access";
export { FrameSlotContext } from "./widgets";
export {
  DEFAULT_IDS, SIDE_NAV_ICONS_ID, HEADER_HEIGHT, SIDEBAR_WIDTH, defaultCustomWidgets, defaultFrame, missingDefaults, effectiveFrame, findCustomWidget,
  chromeStyles, shellStyleVars, contrastRatio, builtinAsDesigned, mergeChrome, sameChromeSettings,
  HEADER_PRESETS, withHeaderPreset, headerPresetOf, type HeaderPreset, type ChromeNav, type ChromeProject, type SlotStyle,
} from "./chrome";
export { SymbolSVG } from "./SymbolSVG";
export { APP_PREFIX, APP_NAMES, appTag, isAppPath, splitApp, type AppValues } from "./app";
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
  stackFor, stackStyle, partStyle, type StackSpec, type StackLayoutLike, type StackPart,
  slotFor, slotsByEdge, type FrameEdge, type SlotLike,
} from "./layout";
export { applyTransform, suit, driveValue, DRIVEN_KIND, type DrivenValue } from "./drive";
export {
  THEMES, PRESETS, resolveTheme, COLOR_TOKENS, FONTS, fontStack, projectFontsCss, applyProjectFonts, projectFontFamily, TYPE_SCALE, themeVars, themeStyle, applyTheme, tokenColor,
  type Theme, type ThemeColors, type FontId, type FontInfo, type FontKind, type TypeScale,
} from "./tokens";
export { Gallery, GALLERY_STATES, galleryCell, galleryInsert, type GalleryState } from "./gallery";
export type { GallerySample } from "./manifest";
