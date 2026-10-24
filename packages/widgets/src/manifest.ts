// Widget manifests: what each widget type is called, how big it starts, which
// tags it reads, which events it offers and which settings it has. The IDE's
// palette and properties panel are built from them. schema.json stays the
// contract for the settings themselves; a manifest only adds how to edit them
// (tests hold the two together).
import type { Widget, WidgetType } from "@speths-screens/shared-types";

type Config = Record<string, unknown>;

interface FieldBase {
  /** The widget config key (for a list item: the item's key). */
  key: string;
  label: string;
  /** Shown under the field. */
  note?: string;
  /** Only shown when this returns true for the widget's config. */
  showIf?: (config: Config) => boolean;
  /** Two consecutive half fields share a row. */
  half?: boolean;
  /** An older key read while this one is unset (image fit: objectFit). */
  alias?: string;
}

export type Field = FieldBase & (
  | { kind: "number"; default?: number; min?: number; max?: number; step?: number;
      /** Blank clears the setting (shown as this placeholder, e.g. "auto"). */
      blank?: string }
  | { kind: "text"; default?: string; placeholder?: string }
  /** A number when the text is numeric, otherwise the text (state values, button values). */
  | { kind: "value"; default?: number | string; placeholder?: string }
  | { kind: "boolean"; default?: boolean }
  | { kind: "color"; default?: string;
      /** Unset means the theme's colour: offers "default" and "custom". */
      optional?: boolean;
      /** Also offers "none", stored as this value (e.g. "transparent"). */
      none?: string }
  | { kind: "choice"; default?: string; display?: "buttons" | "select" | "swatches";
      /** A value of "" is the theme's default. */
      options: { value: string; label?: string; swatch?: string }[] }
  /** A page of the project. */
  | { kind: "page" }
  /** A tag binding (ds:path or ns:path). */
  | { kind: "binding"; placeholder?: string }
  /** An image: library, URL or upload. */
  | { kind: "image" }
  /** A symbol from the symbol packs. */
  | { kind: "symbol" }
  /** A faceplate of the project. */
  | { kind: "faceplate" }
  /** Values for the chosen faceplate's parameters. */
  | { kind: "faceplateParams" }
  | { kind: "list"; item: Field[];
      /** A new item, given the list so far. */
      newItem: (items: Config[]) => Config;
      /** The list the widget shows while the setting is unset. */
      seed?: (w: Widget) => Config[];
      max?: number; empty?: string }
);

export type FieldKind = Field["kind"];

/** A tag the widget reads. In the v1 format only "value" exists: w.binding. */
export type BindingSlot = { name: "value"; label: string };

export type WidgetEvent = "onClick" | "onPress" | "onRelease";

export interface WidgetManifest {
  type: WidgetType;
  label: string;
  defaultSize: { w: number; h: number };
  /** False keeps it out of the palette (symbols come from the symbol library). */
  palette?: boolean;
  bindings: BindingSlot[];
  events: WidgetEvent[];
  settings: Field[];
}
