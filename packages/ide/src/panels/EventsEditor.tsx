// Edits a widget's events (w.events): what it does on click, on press and on
// release. Press and release write at once (a momentary button); click
// actions go through the write confirmation.
import type { Action, ActionType, Widget, WidgetEvents } from "../store/projectStore";
import { useProject } from "../store/projectStore";
import { BindingInput } from "./BindingInput";
import { inp, parseValue } from "./SettingsEditor";
import { CloseIcon } from "../ui/icons";

type EventName = keyof WidgetEvents;

export const EVENTS: { name: EventName; label: string }[] = [
  { name: "onClick", label: "On click" },
  { name: "onPress", label: "On press" },
  { name: "onRelease", label: "On release" },
];

export const ACTION_TYPES: { type: ActionType; label: string }[] = [
  { type: "write", label: "Write a value" },
  { type: "toggle", label: "Toggle" },
  { type: "increment", label: "Increment" },
  { type: "navigate", label: "Go to page" },
  { type: "openUrl", label: "Open URL" },
  { type: "openPopup", label: "Open popup" },
  { type: "closePopup", label: "Close popup" },
];

const writesTag = (t: ActionType) => t === "write" || t === "toggle" || t === "increment";
const small = "text-[10px] text-zinc-500 mb-0.5";
const numInp = `${inp} font-mono`;

/** Returns events without empty lists; undefined when nothing is left. */
export function cleanEvents(e: WidgetEvents): WidgetEvents | undefined {
  const out: WidgetEvents = {};
  for (const { name } of EVENTS) if (e[name]?.length) out[name] = e[name];
  return Object.keys(out).length ? out : undefined;
}

export function EventsEditor({ w, onChange }: { w: Widget; onChange: (events: WidgetEvents | undefined) => void }) {
  const events = w.events ?? {};
  const setList = (name: EventName, list: Action[]) => onChange(cleanEvents({ ...events, [name]: list }));

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Events</div>
      <div className="text-[10px] text-zinc-600 mb-2">Press and release write at once; a click may ask the operator to confirm.</div>
      <div className="space-y-2">
        {EVENTS.map(({ name, label }) => {
          const list = events[name] ?? [];
          return (
            <div key={name}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-300">{label}</span>
                <select aria-label={`Add action ${label}`} value=""
                  onChange={(e) => e.target.value && setList(name, [...list, { type: e.target.value as ActionType }])}
                  className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300">
                  <option value="">+ action</option>
                  {ACTION_TYPES.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 mt-1">
                {list.map((a, i) => (
                  <ActionCard key={i} a={a} label={`${label} ${i + 1}`}
                    onChange={(next) => setList(name, list.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => setList(name, list.filter((_, j) => j !== i))} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sets key on a copy of a, removing it for undefined. */
function withField(a: Action, key: keyof Action, value: unknown): Action {
  const next = { ...a } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as Action;
}

function ActionCard({ a, label, onChange, onRemove }: {
  a: Action; label: string; onChange: (a: Action) => void; onRemove: () => void;
}) {
  const pages = useProject((s) => s.project.pages);
  const customWidgets = useProject((s) => s.project.customWidgets) ?? [];
  const popup = customWidgets.find((c) => c.id === a.customWidgetId);
  const setParam = (name: string, v: string) => {
    const params = { ...(a.params ?? {}) };
    if (v) params[name] = v;
    else delete params[name];
    set("params", Object.keys(params).length ? params : undefined);
  };
  const px = (key: "width" | "height", title: string, placeholder: number | undefined) => (
    <div>
      <div className={small}>{title}</div>
      <input aria-label={`${label} ${title}`} type="number" min={40} max={4000} value={a[key] ?? ""} placeholder={placeholder ? String(placeholder) : "its own"}
        onChange={(e) => set(key, e.target.value === "" ? undefined : Math.max(40, Math.min(4000, Math.round(Number(e.target.value)) || 40)))} className={numInp} />
    </div>
  );
  const set = (key: keyof Action, value: unknown) => onChange(withField(a, key, value));
  const value = (key: "value" | "on" | "off", placeholder: string, title: string) => (
    <div>
      <div className={small}>{title}</div>
      <input aria-label={`${label} ${title}`} value={a[key] === undefined ? "" : String(a[key])} placeholder={placeholder}
        onChange={(e) => set(key, e.target.value === "" ? undefined : parseValue(e.target.value))} className={numInp} />
    </div>
  );
  return (
    <div className="border border-zinc-700/60 rounded p-1.5 space-y-1.5 relative">
      <button aria-label={`Remove ${label}`} onClick={onRemove}
        className="absolute top-0.5 right-1 text-zinc-600 hover:text-red-400 text-xs"><CloseIcon size={14} /></button>
      <select aria-label={`${label} type`} value={a.type}
        onChange={(e) => onChange({ type: e.target.value as ActionType })} className={inp}>
        {ACTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
      </select>
      {writesTag(a.type) && (
        <div>
          <div className={small}>Tag</div>
          <BindingInput value={a.tag ?? ""} onChange={(v) => set("tag", v || undefined)}
            placeholder="blank: the widget's tag" className={`${inp} font-mono text-[10px] w-full`} />
        </div>
      )}
      {a.type === "write" && value("value", "1", "Value")}
      {a.type === "toggle" && (
        <div className="grid grid-cols-2 gap-1.5">
          {value("on", "1", "On value")}
          {value("off", "0", "Off value")}
        </div>
      )}
      {a.type === "increment" && (
        <div>
          <div className={small}>Step</div>
          <input aria-label={`${label} step`} type="number" value={a.step ?? ""} placeholder="1"
            onChange={(e) => set("step", e.target.value === "" ? undefined : Number(e.target.value))} className={numInp} />
        </div>
      )}
      {a.type === "navigate" && (
        <select aria-label={`${label} page`} value={a.page ?? ""} onChange={(e) => set("page", e.target.value || undefined)} className={inp}>
          <option value="">— select page —</option>
          {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {a.type === "openUrl" && (
        <input aria-label={`${label} URL`} value={a.url ?? ""} placeholder="https://…"
          onChange={(e) => set("url", e.target.value || undefined)} className={inp} />
      )}
      {a.type === "openPopup" && (
        <>
          <select aria-label={`${label} custom widget`} value={a.customWidgetId ?? ""} onChange={(e) => set("customWidgetId", e.target.value || undefined)} className={inp}>
            <option value="">— select custom widget —</option>
            {customWidgets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {customWidgets.length === 0 && <div className="text-[10px] text-zinc-500">Make a custom widget first (Custom widgets); it is what the popup shows.</div>}
          {popup?.params.map((prm) => (
            <div key={prm.name}>
              <div className={small}>{`{${prm.name}}`}{prm.description ? ` ${prm.description}` : ""}</div>
              <BindingInput value={a.params?.[prm.name] ?? ""} onChange={(v) => setParam(prm.name, v)}
                placeholder="a tag path or a value" className={`${inp} font-mono text-[10px] w-full`} />
            </div>
          ))}
          <div>
            <div className={small}>Title</div>
            <input aria-label={`${label} title`} value={a.title ?? ""} placeholder={popup?.name ?? "the custom widget's name"}
              onChange={(e) => set("title", e.target.value || undefined)} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {px("width", "Width (px)", popup?.width)}
            {px("height", "Height (px)", popup?.height)}
          </div>
          <select aria-label={`${label} position`} value={a.position ?? "center"} onChange={(e) => set("position", e.target.value === "center" ? undefined : e.target.value)} className={inp}>
            <option value="center">In the middle of the screen</option>
            <option value="widget">Next to this widget</option>
          </select>
        </>
      )}
      {a.type === "closePopup" && <div className="text-[10px] text-zinc-500">Closes the popup this widget is in.</div>}
    </div>
  );
}
