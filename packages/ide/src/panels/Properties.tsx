import { useProject } from "../store/projectStore";
import { DrivesEditor } from "./DrivesEditor";
import { PositionEditor } from "./Canvas";
import { FRAME_SETTINGS, manifestFor } from "@speths-screens/widgets";
import { BindingInput, LiveTagPreview } from "./BindingInput";
import { SettingsFields, inp } from "./SettingsEditor";
import { EventsEditor } from "./EventsEditor";
import { ScriptEditor } from "./ScriptEditor";
import { Segmented } from "../ui/Segmented";
import { lookOf, withLook, type Look } from "../store/widgetLook";
import { surfaceCustomWidget, surfaceOf, surfaceSnap } from "../store/surface";
import { AnchorFields, CustomWidgetProperties } from "./CustomWidgetCanvas";
import { AccessFields } from "./AccessFields";
import { Tabs } from "../ui";
import { create } from "zustand";

/** The parts of a widget's properties, one tab each. */
export const PROPERTY_TABS = [
  { id: "settings", label: "Settings" },
  { id: "actions", label: "Actions" },
  { id: "dynamics", label: "Dynamics" },
  { id: "look", label: "Look" },
  { id: "access", label: "Access" },
] as const;
export type PropertyTab = (typeof PROPERTY_TABS)[number]["id"];

/** The tab in front, kept while other widgets are selected, so editing the look of several widgets
 *  one after another does not mean finding the look again each time. */
export const usePropertyTab = create<{ tab: PropertyTab; set: (t: PropertyTab) => void }>((set) => ({
  tab: "settings",
  set: (tab) => set({ tab }),
}));
import type { Access } from "@speths-screens/shared-types";


function PageProperties({ page }: { page: { id: string; name: string; backgroundColor?: string; script?: string; hideInNav?: boolean; access?: Access } }) {
  const { updatePage } = useProject();
  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  return (
    <div className="p-3 space-y-4 overflow-auto">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 pb-1 border-b border-zinc-800">Page Properties</div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Page name</div>
        <input value={page.name} onChange={(e) => updatePage(page.id, { name: e.target.value })} className={inp} />
      </div>

      <label className="flex items-start gap-2 text-xs text-zinc-200 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={!!page.hideInNav}
          onChange={(e) => updatePage(page.id, { hideInNav: e.target.checked || undefined })} />
        <span>Leave out of the navigation<span className="block text-[10px] text-zinc-500">The page is reached by a button or a script, not from the page list.</span></span>
      </label>

      <AccessFields what="page" access={page.access} onChange={(access) => updatePage(page.id, { access })} />

      <div>
        <div className="text-[10px] text-zinc-500 mb-1">Background color</div>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {["default", "custom"].map((opt) => {
            const cur = page.backgroundColor ?? "";
            const active = opt === "default" ? cur === "" : cur !== "";
            return (
              <button key={opt}
                onClick={() => updatePage(page.id, { backgroundColor: opt === "default" ? "" : "#111111" })}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}>{opt}</button>
            );
          })}
        </div>
        {(page.backgroundColor ?? "") !== "" && (
          <div className="flex gap-1.5 items-center">
            <input type="color" value={page.backgroundColor ?? "#111111"}
              onChange={(e) => updatePage(page.id, { backgroundColor: e.target.value })}
              className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
            <input value={page.backgroundColor ?? ""} onChange={(e) => updatePage(page.id, { backgroundColor: e.target.value })}
              className={`${inp} font-mono text-[10px]`} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Page Script</div>
        <div className="text-[10px] text-zinc-600 mb-1.5 leading-relaxed">
          Runs in a worker while this page is open: <code className="text-zinc-400">readTag</code>, <code className="text-zinc-400">await writeTag</code>, <code className="text-zinc-400">every(ms, fn)</code>, <code className="text-zinc-400">after(ms, fn)</code>, <code className="text-zinc-400">onTagChange</code>, <code className="text-zinc-400">navigate</code>, <code className="text-zinc-400">log</code>.
        </div>
        <ScriptEditor kind="page" label="page script" rows={8} value={page.script ?? ""}
          onChange={(source) => updatePage(page.id, { script: source || undefined })} />
      </div>
    </div>
  );
}

export function Properties() {
  const { project, activePageId, selectedWidgetId, updateWidget, setWidgetTag } = useProject();
  const tab = usePropertyTab((s) => s.tab);
  const setTab = usePropertyTab((s) => s.set);
  const page = surfaceOf(project, activePageId);
  const w = page?.widgets.find((x) => x.id === selectedWidgetId);

  const editingCw = surfaceCustomWidget(project, activePageId);
  if (!w || !page) {
    if (editingCw) return <CustomWidgetProperties cw={editingCw} />;
    return page
      ? <PageProperties page={page} />
      : <div className="p-3 text-xs text-zinc-500">No page selected.</div>;
  }

  const props: Record<string, unknown> = w.props ?? {};
  const pixel = surfaceSnap(project, page.id) === "pixel";
  const designOf = (id: unknown) => project.customWidgets?.find((c) => c.id === id && c.width && c.height);
  const setProp = (k: string, v: unknown) => {
    const next = { ...props };
    if (v === undefined) delete next[k];
    else next[k] = v;
    // Choosing a custom widget with a designed size gives the placement that size (in a pixel page),
    // so it is drawn 1:1 until it is resized on purpose.
    const design = k === "customWidgetId" && pixel ? designOf(v) : undefined;
    updateWidget(page.id, w.id, { props: Object.keys(next).length ? next : undefined, ...(design ? { w: design.width, h: design.height } : {}) });
  };
  const placedDesign = w.type === "customWidget" ? designOf(props.customWidgetId) : undefined;
  const manifest = manifestFor(w.type);
  const readsTag = manifest ? manifest.bindings.some((b) => b.name === "value") : true;
  const tagInput = (slot: "value" | "visible" | "color", placeholder = "ns:plant.tag or datasource:path") => (
    <BindingInput
      value={w.bindings?.[slot] ?? ""}
      onChange={(v) => setWidgetTag(page.id, w.id, slot, v)}
      placeholder={placeholder}
      className={`${inp} font-mono w-full`}
    />
  );

  const counts: Partial<Record<PropertyTab, number>> = {
    actions: Object.values(w.events ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0),
    dynamics: Object.keys(w.dynamics ?? {}).length,
    access: Object.keys((w as { access?: Access }).access ?? {}).length,
  };
  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Widget meta */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Widget</div>
        <div className="text-sm font-medium">{manifest?.label ?? w.type}</div>
        <div className="text-[10px] text-zinc-600 font-mono">{w.id}</div>
      </div>
      <Tabs label="Widget properties" layout="fill" size="sm" className="px-1 shrink-0" active={tab} onSelect={(id) => setTab(id as PropertyTab)}
        tabs={PROPERTY_TABS.map((t) => ({ id: t.id, label: counts[t.id] ? `${t.label} ${counts[t.id]}` : t.label }))} />
      <div role="tabpanel" aria-label={PROPERTY_TABS.find((t) => t.id === tab)?.label} className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        {tab === "settings" && (
          <>
          {/* Binding + live value */}
          {readsTag && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{manifest?.bindings[0]?.label ?? "Binding"}</div>
              {tagInput("value")}
              <div className="text-[10px] text-zinc-600 mt-0.5">Drag tag from browser → widget</div>
              <LiveTagPreview binding={w.bindings?.value} />
            </div>
          )}

          {/* Settings from the widget's manifest */}
          {manifest && manifest.settings.length > 0 && (
            <SettingsGroupBox title={`${manifest.label} settings`}>
              <SettingsFields fields={manifest.settings} config={props} set={setProp} w={w} />
            </SettingsGroupBox>
          )}

          {/* Layout */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Layout</div>
            <PositionEditor pageId={page.id} widgetId={w.id} />
            {placedDesign && pixel && (placedDesign.width !== w.w || placedDesign.height !== w.h) && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
                <span>Designed at {placedDesign.width} × {placedDesign.height}; scaled to fit here.</span>
                <button onClick={() => updateWidget(page.id, w.id, { w: placedDesign.width, h: placedDesign.height })}
                  className="text-blue-400 hover:text-blue-300">Use its designed size</button>
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-2 mb-0.5">Visible only while this tag is on</div>
            {tagInput("visible", "blank: always visible")}
          </div>

          {/* A custom widget's part: where it stays when the custom widget is pinned to a wider edge */}
          {editingCw && (() => {
            const a = w as typeof w & { anchorX?: Parameters<typeof AnchorFields>[0]["anchorX"]; anchorY?: Parameters<typeof AnchorFields>[0]["anchorY"] };
            return <AnchorFields anchorX={a.anchorX} anchorY={a.anchorY} onChange={(patch) => updateWidget(page.id, w.id, patch as never)} />;
          })()}

          </>
        )}
        {tab === "actions" && (
          <>
          {/* Events: what the widget does when touched */}
          <EventsEditor w={w} onChange={(events) => updateWidget(page.id, w.id, { events })} />

          </>
        )}
        {tab === "dynamics" && (
          <>
          {/* Driven properties: looks and settings that follow tags */}
          <DrivesEditor w={w} onChange={(dynamics) => updateWidget(page.id, w.id, { dynamics })} />

          </>
        )}
        {tab === "look" && (
          <>
          {/* Card or plain: one switch for the settings that take the card away (a pipe and a shape are always drawings) */}
          {w.type !== "pipe" && w.type !== "shape" && (
            <SettingsGroupBox title="Look">
              <Segmented<Look> label="Look" value={lookOf(props)}
                options={[
                  { id: "card", label: "Card", title: "A card with a background, a border and a label" },
                  { id: "plain", label: "Plain", title: "No card: the widget sits on whatever is behind it, like a number on a drawing" },
                ]}
                onChange={(look) => updateWidget(page.id, w.id, { props: withLook(props, look) })} />
            </SettingsGroupBox>
          )}

          {/* Frame settings every widget has */}
          {FRAME_SETTINGS.map((g) => (
            <SettingsGroupBox key={g.title} title={g.title}>
              {g.slots?.map((slot) => (
                <div key={slot.name} className="mb-2">
                  <div className="text-[10px] text-zinc-500 mb-0.5">{slot.label}</div>
                  {tagInput(slot.name)}
                </div>
              ))}
              <SettingsFields fields={g.fields} config={props} set={setProp} w={w} />
            </SettingsGroupBox>
          ))}
          </>
        )}
        {tab === "access" && (
          <>
          {/* Who can see and use it (with logins on) */}
          <AccessFields what="widget" access={(w as { access?: Access }).access}
            onChange={(access) => updateWidget(page.id, w.id, { access } as never)} />

          </>
        )}
      </div>
    </div>
  );
}

function SettingsGroupBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-800 pt-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

// ── Per-widget PropertiesPanel components ─────────────────────────────────

