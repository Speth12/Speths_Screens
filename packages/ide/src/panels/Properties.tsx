import { useState } from "react";
import { useProject, type Dynamic } from "../store/projectStore";
import type { DynamicTargetProp } from "@speths-screens/shared-types";
import { PositionEditor } from "./Canvas";
import { FRAME_SETTINGS, manifestFor } from "@speths-screens/widgets";
import { BindingInput, LiveTagPreview } from "./BindingInput";
import { SettingsFields, inp } from "./SettingsEditor";
import { EventsEditor } from "./EventsEditor";


function PageProperties({ page }: { page: { id: string; name: string; backgroundColor?: string; script?: string } }) {
  const { updatePage } = useProject();
  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  return (
    <div className="p-3 space-y-4 overflow-auto">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 pb-1 border-b border-zinc-800">Page Properties</div>

      <div>
        <div className="text-[10px] text-zinc-500 mb-0.5">Page name</div>
        <input value={page.name} onChange={(e) => updatePage(page.id, { name: e.target.value })} className={inp} />
      </div>

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
          Variables available: <code className="bg-zinc-800 px-0.5 rounded text-zinc-400">tags</code> object with tag paths as keys.<br />
          Example: <code className="bg-zinc-800 px-0.5 rounded text-zinc-400">{"// tags['rest:path'] > 5000"}</code>
        </div>
        <textarea
          value={page.script ?? ""}
          onChange={(e) => updatePage(page.id, { script: e.target.value })}
          placeholder={"// Page-level script runs when tags update\n// Example:\n// if (tags['rest:ds:path'] > 100) { ... }"}
          rows={8}
          className={`${inp} font-mono text-[10px] resize-y`}
        />
        <div className="text-[10px] text-zinc-600 mt-1">Page scripting executes in runtime — logic here affects all widgets on this page.</div>
      </div>
    </div>
  );
}

export function Properties() {
  const { project, activePageId, selectedWidgetId, updateWidget, setWidgetTag } = useProject();
  const page = project.pages.find((p) => p.id === activePageId);
  const w = page?.widgets.find((x) => x.id === selectedWidgetId);

  if (!w || !page) {
    return page
      ? <PageProperties page={page} />
      : <div className="p-3 text-xs text-zinc-500">No page selected.</div>;
  }

  const props: Record<string, unknown> = w.props ?? {};
  const setProp = (k: string, v: unknown) => {
    const next = { ...props };
    if (v === undefined) delete next[k];
    else next[k] = v;
    updateWidget(page.id, w.id, { props: Object.keys(next).length ? next : undefined });
  };
  const manifest = manifestFor(w.type);
  const readsTag = manifest ? manifest.bindings.some((b) => b.name === "value") : true;
  const tagInput = (slot: "value" | "visible" | "color", placeholder = "ds:tagPath or ns:path") => (
    <BindingInput
      value={w.bindings?.[slot] ?? ""}
      onChange={(v) => setWidgetTag(page.id, w.id, slot, v)}
      placeholder={placeholder}
      className={`${inp} font-mono w-full`}
    />
  );

  return (
    <div className="p-3 space-y-4 overflow-auto">
      {/* Widget meta */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Widget</div>
        <div className="text-sm font-medium">{manifest?.label ?? w.type}</div>
        <div className="text-[10px] text-zinc-600 font-mono">{w.id}</div>
      </div>

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

      {/* Events: what the widget does when touched */}
      <EventsEditor w={w} onChange={(events) => updateWidget(page.id, w.id, { events })} />

      {/* Dynamics: tag-driven looks */}
      <DynamicsEditor w={w} pageId={page.id} />

      {/* Layout */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Layout</div>
        <PositionEditor pageId={page.id} widgetId={w.id} />
        <div className="text-[10px] text-zinc-500 mt-2 mb-0.5">Visible only while this tag is on</div>
        {tagInput("visible", "blank: always visible")}
      </div>

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

// ── Dynamics editor ───────────────────────────────────────────────────────

// Tag-driven looks. What a widget does when touched is its events (EventsEditor).
const DYN_KINDS: { kind: Dynamic["kind"]; label: string; group: "property" | "script" }[] = [
  { kind: "visibility", label: "Visibility",   group: "property" },
  { kind: "colorFill",  label: "Color / Fill", group: "property" },
  { kind: "blink",      label: "Blink",        group: "property" },
  { kind: "rotation",   label: "Rotation",     group: "property" },
  { kind: "disable",    label: "Disable",      group: "property" },
  { kind: "script",     label: "Script / Expression", group: "script" },
];

function uid() { return Math.random().toString(36).slice(2, 8); }

function DynamicCard({ d, onUpdate, onRemove, inp, numInp }: {
  d: Dynamic;
  onUpdate: (patch: Partial<Dynamic>) => void;
  onRemove: () => void;
  inp: string; numInp: string;
}) {
  const [open, setOpen] = useState(true);
  const meta = DYN_KINDS.find((k) => k.kind === d.kind);

  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-zinc-800/60 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[9px] text-zinc-500">{open ? "▼" : "▶"}</span>
        <span className="text-[11px] font-medium text-zinc-200 flex-1">{meta?.label ?? d.kind}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-zinc-600 hover:text-red-400 text-sm leading-none px-1"
        >×</button>
      </div>

      {open && (
        <div className="p-2 space-y-2 bg-zinc-900/40">
          {/* Property dynamics — binding */}
          {d.kind !== "script" && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-0.5">Binding</div>
              <BindingInput
                value={d.binding ?? ""}
                onChange={(v) => onUpdate({ binding: v || undefined })}
                placeholder="ds:tagPath or ns:path"
                className={`${inp} font-mono text-[10px] w-full`}
              />
            </div>
          )}

          {/* colorFill colors */}
          {d.kind === "colorFill" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">True color</div>
                <div className="flex gap-1">
                  <input type="color" value={d.trueColor ?? "#22c55e"} onChange={(e) => onUpdate({ trueColor: e.target.value })}
                    className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
                  <input value={d.trueColor ?? "#22c55e"} onChange={(e) => onUpdate({ trueColor: e.target.value })}
                    className={`${inp} flex-1 font-mono text-[10px]`} />
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">False color</div>
                <div className="flex gap-1">
                  <input type="color" value={d.falseColor ?? "#3f3f46"} onChange={(e) => onUpdate({ falseColor: e.target.value })}
                    className="h-6 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer" />
                  <input value={d.falseColor ?? "#3f3f46"} onChange={(e) => onUpdate({ falseColor: e.target.value })}
                    className={`${inp} flex-1 font-mono text-[10px]`} />
                </div>
              </div>
            </div>
          )}

          {/* blink period */}
          {d.kind === "blink" && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-0.5">Period (ms)</div>
              <input type="number" min={100} max={5000} step={100}
                value={d.blinkPeriodMs ?? 800}
                onChange={(e) => onUpdate({ blinkPeriodMs: Number(e.target.value) })}
                className={numInp} />
            </div>
          )}

          {/* rotation range */}
          {d.kind === "rotation" && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Value min</div>
                  <input type="number" value={d.minValue ?? 0} onChange={(e) => onUpdate({ minValue: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Value max</div>
                  <input type="number" value={d.maxValue ?? 100} onChange={(e) => onUpdate({ maxValue: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Angle min °</div>
                  <input type="number" value={d.minAngle ?? -90} onChange={(e) => onUpdate({ minAngle: Number(e.target.value) })} className={numInp} />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-0.5">Angle max °</div>
                  <input type="number" value={d.maxAngle ?? 90} onChange={(e) => onUpdate({ maxAngle: Number(e.target.value) })} className={numInp} />
                </div>
              </div>
            </>
          )}

          {/* script dynamic */}
          {d.kind === "script" && (
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Tag binding</div>
                <BindingInput
                  value={d.binding ?? ""}
                  onChange={(v) => onUpdate({ binding: v || undefined })}
                  placeholder="ds:tagPath or ns:path"
                  className={`${inp} font-mono text-[10px] w-full`}
                />
                <LiveTagPreview binding={d.binding} />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Expression <span className="text-zinc-600 font-normal normal-case">(use <code className="bg-zinc-800 px-0.5 rounded">value</code> for tag value)</span></div>
                <input value={d.expression ?? "value"} onChange={(e) => onUpdate({ expression: e.target.value })}
                  placeholder="value > 5000" className={`${inp} font-mono text-[10px]`} />
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Target property</div>
                <select value={d.targetProp ?? "bgColor"} onChange={(e) => onUpdate({ targetProp: e.target.value as DynamicTargetProp })} className={inp}>
                  <option value="bgColor">Background color</option>
                  <option value="borderColor">Border color</option>
                  <option value="textColor">Text color</option>
                  <option value="visible">Visibility (hide when false)</option>
                </select>
              </div>
              {d.targetProp !== "visible" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-0.5">When TRUE</div>
                    <div className="flex gap-1">
                      <input type="color" value={d.trueValue ?? "#22c55e"}
                        onChange={(e) => onUpdate({ trueValue: e.target.value })}
                        className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                      <input value={d.trueValue ?? ""} onChange={(e) => onUpdate({ trueValue: e.target.value })}
                        placeholder="#22c55e" className={`${inp} font-mono text-[10px]`} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-0.5">When FALSE</div>
                    <div className="flex gap-1">
                      <input type="color" value={d.falseValue ?? "#3f3f46"}
                        onChange={(e) => onUpdate({ falseValue: e.target.value })}
                        className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
                      <input value={d.falseValue ?? ""} onChange={(e) => onUpdate({ falseValue: e.target.value })}
                        placeholder="(leave blank to keep default)" className={`${inp} font-mono text-[10px]`} />
                    </div>
                  </div>
                </div>
              )}
              <div className="text-[10px] text-zinc-600 italic border-t border-zinc-800 pt-1">
                Example: <code className="bg-zinc-800 px-0.5 rounded">value &gt; 5000</code> → background turns red when tag exceeds 5000
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function DynamicsEditor({ w, pageId }: { w: import("../store/projectStore").Widget; pageId: string }) {
  const { updateWidget } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const dynamics = w.dynamics ?? [];

  const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
  const numInp = `${inp} font-mono`;

  const add = (kind: Dynamic["kind"]) => {
    updateWidget(pageId, w.id, { dynamics: [...dynamics, { id: uid(), kind }] });
    setAddOpen(false);
  };

  const update = (id: string, patch: Partial<Dynamic>) => {
    updateWidget(pageId, w.id, { dynamics: dynamics.map((d) => d.id === id ? { ...d, ...patch } : d) });
  };

  const remove = (id: string) => {
    updateWidget(pageId, w.id, { dynamics: dynamics.filter((d) => d.id !== id) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Dynamics</div>
        <div className="relative">
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          >+ Add</button>
          {addOpen && (
            <div className="absolute right-0 top-6 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-[150px]">
              <div className="text-[9px] text-zinc-500 px-3 py-1 uppercase tracking-wider">Property</div>
              {DYN_KINDS.filter((k) => k.group === "property").map((k) => (
                <button key={k.kind} onClick={() => add(k.kind)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 text-zinc-200">{k.label}</button>
              ))}
              <div className="border-t border-zinc-700 my-1" />
              <div className="text-[9px] text-zinc-500 px-3 py-1 uppercase tracking-wider">Script</div>
              {DYN_KINDS.filter((k) => k.group === "script").map((k) => (
                <button key={k.kind} onClick={() => add(k.kind)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 text-zinc-200">{k.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {dynamics.length === 0 ? (
        <div className="text-[10px] text-zinc-600 italic">No dynamics. Click + Add to begin.</div>
      ) : (
        <div className="space-y-2">
          {dynamics.map((d) => (
            <DynamicCard key={d.id} d={d} onUpdate={(p) => update(d.id, p)} onRemove={() => remove(d.id)}
              inp={inp} numInp={numInp} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-widget PropertiesPanel components ─────────────────────────────────

