// The Custom widgets tab: reusable pieces of screen. The list is on the left; the chosen custom widget opens on the
// right in the visual editor with its parameters, layout and parts. The editing is a draft, saved or reverted
// explicitly, and kept while another tab is in front.
import { useMemo, useState } from "react";
import type { CustomWidget } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { SCREEN_TAB, useWorkspace } from "../store/workspace";
import { isDirty, useDraft, useDrafts } from "../store/drafts";
import { customWidgetUsage } from "../store/usage";
import { CustomWidgetEditor, type CustomWidgetDraft } from "./CustomWidgetEditor";
import { Badge, Button, Field, Input, Select } from "../ui";
import { EmptyState, SelectList, TabHeader } from "../ui/Layout";
import { AddIcon, CheckIcon, DeleteIcon } from "../ui/icons";

const NONE: CustomWidget[] = [];

const draftOf = (cw: CustomWidget): CustomWidgetDraft => ({
  name: cw.name, description: cw.description, params: cw.params, widgets: cw.widgets, layout: cw.layout,
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CustomWidgetsTab() {
  const customWidgets = useProject((s) => s.project.customWidgets) ?? NONE;
  const project = useProject((s) => s.project);
  const { addCustomWidget, updateCustomWidget, removeCustomWidget } = useProject.getState();
  const chosen = useWorkspace((s) => s.selection.customWidgets);
  const openOnCanvas = useOpenOnCanvas();
  const select = useWorkspace((s) => s.select);
  const drafts = useDrafts((s) => s.entries);

  const cw = customWidgets.find((c) => c.id === chosen) ?? customWidgets[0];

  // A new custom widget has a designed size and opens on the canvas, with every tool a page has.
  const add = () => {
    const id = `fp-${Math.random().toString(36).slice(2, 8)}`;
    addCustomWidget({ id, name: `Custom widget ${customWidgets.length + 1}`, params: [], widgets: [], width: 480, height: 120 });
    select("customWidgets", id);
    openOnCanvas(id);
  };

  return (
    <div className="@container flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950">
      <TabHeader title="Custom widgets" summary={plural(customWidgets.length, "custom widget")}
        actions={<Button variant="primary" icon={<AddIcon size={14} />} onClick={add}>New custom widget</Button>} />
      <div className="flex-1 flex min-h-0">
        {/* A list beside the editor when there is room for both */}
        <section className="hidden @4xl:flex w-64 shrink-0 min-w-0 flex-col border-r border-zinc-800">
          {customWidgets.length === 0 ? (
            <EmptyState title="No custom widgets yet" action={<Button variant="primary" icon={<AddIcon size={14} />} onClick={add}>New custom widget</Button>}>
              A custom widget is a reusable piece of screen: build it once in the visual editor (free layout, or a stack that adapts to the screen size), then place it on pages or pin it to a screen edge and give each use its own tags.
            </EmptyState>
          ) : (
            <SelectList label="Custom widgets" className="flex-1 min-h-0" selected={cw?.id ?? null} onSelect={(id) => select("customWidgets", id)}
              items={customWidgets.map((c) => {
                const uses = customWidgetUsage(project, c.id).total;
                return {
                  id: c.id,
                  content: (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" aria-hidden="true" />
                        <span className="flex-1 truncate text-ui font-medium text-zinc-100">{c.name || "Unnamed"}</span>
                        {isDirty(drafts, `cw:${c.id}`, draftOf(c)) && <Badge tone="warning">unsaved</Badge>}
                      </div>
                      <div className="text-ui-label text-zinc-500">
                        {plural(c.params.length, "parameter")} · {plural(c.widgets.length, "part")} · {uses ? `used ${plural(uses, "time")}` : "not used"}
                      </div>
                    </div>
                  ),
                };
              })} />
          )}
        </section>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* ...and a dropdown above it when there is not */}
          {customWidgets.length > 0 && (
            <div className="@4xl:hidden px-4 pt-3 shrink-0">
              <Field label="Custom widget">
                <Select value={cw?.id ?? ""} onChange={(e) => select("customWidgets", e.target.value)}>
                  {customWidgets.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed"}{isDirty(drafts, `cw:${c.id}`, draftOf(c)) ? " (unsaved)" : ""}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {cw
            ? <Pane key={cw.id} cw={cw} onSave={(patch) => updateCustomWidget(cw.id, patch)} onDelete={() => removeCustomWidget(cw.id)} />
            : <EmptyState title="Choose a custom widget, or make one" />}
        </section>
      </div>
    </div>
  );
}

/** Opens a custom widget on the canvas (the Screen tab), with every tool a page has. */
export function useOpenOnCanvas() {
  const activate = useWorkspace((s) => s.activate);
  const open = useProject((s) => s.openCustomWidgetOnCanvas);
  return (id: string) => { open(id); activate(SCREEN_TAB.id); };
}

function Pane({ cw, onSave, onDelete }: { cw: CustomWidget; onSave: (patch: CustomWidgetDraft) => void; onDelete: () => void }) {
  const { value: draft, dirty, set, revert } = useDraft(`cw:${cw.id}`, draftOf(cw));
  const project = useProject((s) => s.project);
  const usage = useMemo(() => customWidgetUsage(project, cw.id), [project, cw.id]);
  const [confirm, setConfirm] = useState(false);
  const openOnCanvas = useOpenOnCanvas();
  const stack = cw.layout?.mode === "stack";

  const places = [
    ...usage.pages.map((p) => `${p.name}${p.count > 1 ? ` (${p.count})` : ""}`),
    ...usage.customWidgets.map((n) => `inside ${n}`),
    ...(usage.frame ? [`pinned to a screen edge${usage.frame > 1 ? ` (${usage.frame})` : ""}`] : []),
  ];

  return (
    <>
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0 space-y-2">
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Name" className="w-56 shrink-0">
            <Input value={draft.name} onChange={(e) => set((d) => ({ ...d, name: e.target.value }))} />
          </Field>
          <Field label="Description" className="flex-1 min-w-48">
            <Input value={draft.description ?? ""} placeholder="Optional" onChange={(e) => set((d) => ({ ...d, description: e.target.value || undefined }))} />
          </Field>
          <Button variant="primary" disabled={!dirty || !draft.name.trim()} icon={<CheckIcon size={14} />}
            onClick={() => { onSave({ ...draft, name: draft.name.trim() }); revert(); }}>Save changes</Button>
          <Button disabled={!dirty} onClick={revert}>Revert</Button>
          {confirm ? (
            <>
              <Button variant="danger" onClick={onDelete}>Delete</Button>
              <Button onClick={() => setConfirm(false)}>Keep</Button>
            </>
          ) : <Button variant="ghost" icon={<DeleteIcon size={14} />} onClick={() => setConfirm(true)}>Delete</Button>}
        </div>
        <div className={`text-ui-label ${confirm && usage.total ? "text-red-500" : "text-zinc-400"}`}>
          {confirm && usage.total
            ? `Deleting this leaves an empty box where it is used: ${places.join(", ")}.`
            : places.length ? `Used on: ${places.join(", ")}.` : "Not used anywhere yet."}
          {dirty && " Your changes are not saved."}
        </div>
      </div>
      {stack || draft.layout?.mode === "stack" ? <CustomWidgetEditor id={cw.id} draft={draft} update={set} /> : (
        <div className="flex-1 min-h-0 overflow-auto p-6 flex flex-col items-start gap-3">
          <div className="text-ui text-zinc-200">
            {cw.width && cw.height ? `Designed at ${cw.width} × ${cw.height} px, ` : "No designed size yet (it gets one when opened), "}
            {plural(cw.widgets.length, "part")}, {plural(cw.params.length, "parameter")}.
          </div>
          <div className="text-ui-label text-zinc-400 max-w-xl leading-relaxed">
            Build it on the canvas like a page, with every widget and tool: place parts freely, give buttons actions such as Go to page, and set
            each part's anchors. Placed on a page it is scaled to fit the place you give it; pinned to a screen edge its parts follow their anchors.
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => openOnCanvas(cw.id)}>Edit on the canvas</Button>
            <Button title="Its parts in a row or a column that adapts to the screen size, as the built-in header is"
              onClick={() => set((d) => ({ ...d, layout: { mode: "stack", direction: "row", gap: 8, padding: 8, align: "stretch" } }))}>Lay it out as a stack instead</Button>
          </div>
        </div>
      )}
    </>
  );
}
