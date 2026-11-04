// The widget gallery (Phase 3, step 7): every widget type in every state,
// under a theme, driven by simulated tag values. Built from the manifests'
// samples, so a new widget type shows up with no extra code. The IDE shows it
// as a panel; gallery.test.tsx snapshots it per theme.
import type { CSSProperties } from "react";
import type { Widget } from "@speths-screens/shared-types";
import { MANIFESTS } from "./manifests";
import type { WidgetManifest } from "./manifest";
import { WidgetHostProvider, inertHost, EMPTY_TAG, type TagState, type WidgetHost } from "./host";
import { WidgetRenderer } from "./widgets";
import { themeVars, type Theme } from "./tokens";

/** The gallery's columns, the same for every widget type. */
export const GALLERY_STATES = [
  { id: "normal", label: "Normal" },
  { id: "running", label: "Running" },
  { id: "off", label: "Off" },
  { id: "critical", label: "Critical alarm" },
  { id: "warning", label: "Warning alarm" },
  { id: "info", label: "Info alarm" },
  { id: "bad", label: "Bad quality" },
  { id: "disabled", label: "Disabled" },
] as const;
export type GalleryState = (typeof GALLERY_STATES)[number]["id"];

const ALARM: Partial<Record<GalleryState, string>> = { critical: "alarm-critical", warning: "alarm-warning", info: "alarm-info" };

/** One gallery cell: the widget and the state of the tag it shows. */
export function galleryCell(m: WidgetManifest, state: GalleryState, slider?: number): { widget: Widget; tag?: TagState } {
  const s = m.sample;
  const path = `gallery:${m.type}:${state}`;
  const widget: Widget = {
    id: `gallery-${m.type}-${state}`, type: m.type, x: 0, y: 0, w: m.defaultSize.w, h: m.defaultSize.h,
    props: { ...m.defaults?.props, ...s.props } as Widget["props"],
  };
  const hasValue = "value" in s;
  if (hasValue) widget.bindings = { value: path };
  let value = s.numeric && slider !== undefined ? slider : s.value;
  if (state === "running") value = s.on ?? value;
  if (state === "off") value = s.off ?? (s.numeric ? 0 : value);
  const alarm = ALARM[state];
  if (alarm) widget.dynamics = { borderColor: { expr: `'token:${alarm}'` } };
  if (state === "disabled") widget.dynamics = { disabled: { expr: "true" } };
  if (!hasValue) return { widget };
  const tag: TagState = state === "bad"
    ? { value, quality: "Bad", ts: 0, reason: "no answer" }
    : { value, quality: "Good", ts: 0 };
  return { widget, tag };
}

/** The widget a gallery cell inserts on a page: the sample's settings. */
export function galleryInsert(m: WidgetManifest): Omit<Widget, "id" | "x" | "y"> {
  return {
    type: m.type, w: m.defaultSize.w, h: m.defaultSize.h,
    props: { ...m.defaults?.props, ...m.sample.props } as Widget["props"],
    ...(m.defaults?.events ? { events: m.defaults.events } : {}),
  };
}

const CELL: CSSProperties = { position: "relative", width: 168, height: 112 };

export function Gallery({ theme, slider, manifests = MANIFESTS, onDragCell }: {
  theme: Theme;
  /** The value of numeric widgets; their sample value when missing. */
  slider?: number;
  manifests?: readonly WidgetManifest[];
  /** Lets a cell be dragged; the IDE puts the widget to insert on the drag. */
  onDragCell?: (m: WidgetManifest, e: React.DragEvent) => void;
}) {
  const cells = manifests.flatMap((m) => GALLERY_STATES.map((st) => ({ m, st, ...galleryCell(m, st.id, slider) })));
  const tags = new Map(cells.filter((c) => c.tag).map((c) => [c.widget.bindings!.value!, c.tag!]));
  const state = (p: string | undefined) => (p ? tags.get(p) ?? EMPTY_TAG : EMPTY_TAG);
  const host: WidgetHost = { ...inertHost, useTag: state, useTags: (paths) => Object.fromEntries(paths.map((p) => [p, state(p)])) };
  return (
    <WidgetHostProvider value={host}>
      <div data-theme-id={theme.id} style={{ ...themeVars(theme), background: "var(--background)", color: "var(--foreground)", padding: 12 } as CSSProperties}>
        <div style={{ display: "grid", gridTemplateColumns: `7rem repeat(${GALLERY_STATES.length}, 168px)`, gap: 8, alignItems: "center" }}>
          <div />
          {GALLERY_STATES.map((st) => <div key={st.id} style={{ fontSize: 11, fontWeight: 600 }}>{st.label}</div>)}
          {manifests.map((m) => [
            <div key={`${m.type}-label`} style={{ fontSize: 11, fontWeight: 600 }}>{m.label}</div>,
            ...GALLERY_STATES.map((st) => {
              const c = cells.find((x) => x.m === m && x.st === st)!;
              return (
                <div key={c.widget.id} style={CELL} data-testid={c.widget.id} title={`${m.label}, ${st.label}${onDragCell ? ": drag onto the canvas" : ""}`}
                  draggable={!!onDragCell} onDragStart={onDragCell ? (e) => onDragCell(m, e) : undefined}>
                  <WidgetRenderer w={c.widget} />
                </div>
              );
            }),
          ])}
        </div>
      </div>
    </WidgetHostProvider>
  );
}
