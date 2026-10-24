// @speths-screens/widgets: the one widget library for the IDE canvas, the
// IDE preview and the operator screen.
export { WidgetRenderer, KeypadModal, RENDERED_TYPES, fmt, resolveColor, rewriteBinding, toggled } from "./widgets";
export {
  WidgetHostProvider, useHost, useTag, useTags, inertHost, EMPTY_TAG,
  type WidgetHost, type TagState, type Quality, type WriteRequest, type AlarmView,
} from "./host";
export { SymbolSVG } from "./SymbolSVG";
export * from "./symbols";
export { imageFit } from "./imageFit";
export type { Field, FieldKind, WidgetManifest, BindingSlot, WidgetEvent } from "./manifest";
export { MANIFESTS, FRAME_SETTINGS, UNUSED_CONFIG_KEYS, DEFAULT_STATES, manifestFor, type SettingsGroup } from "./manifests";
