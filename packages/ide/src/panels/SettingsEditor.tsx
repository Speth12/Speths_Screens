// Draws the settings a widget manifest declares (@speths-screens/widgets),
// one control per field kind. Replaces the hand-written editor per widget.
import { useRef } from "react";
import { SYMBOLS, SymbolSVG, type Field } from "@speths-screens/widgets";
import type { Widget } from "../store/projectStore";
import { useProject } from "../store/projectStore";
import { BindingInput } from "./BindingInput";

type Config = Record<string, unknown>;

export const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
const numInp = `${inp} font-mono`;
const pick = (active: boolean) =>
  `px-2 py-0.5 rounded text-[10px] border transition-colors ${
    active ? "bg-blue-700 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`;
const colorBox = "h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0";

function Label({ text }: { text: string }) {
  return <div className="text-[10px] text-zinc-500 mb-0.5">{text}</div>;
}

/** The stored value of a field: its key, else its alias; "" counts as unset. */
export function fieldValue(f: Field, config: Config): unknown {
  const v = config[f.key] ?? (f.alias ? config[f.alias] : undefined);
  return v === "" ? undefined : v;
}

/** A text box's content: a number when it reads as one, otherwise the text. */
export function parseValue(s: string): number | string {
  return s.trim() !== "" && !isNaN(Number(s)) ? Number(s) : s;
}

/** The settings of one widget (or one list item), in manifest order. */
export function SettingsFields({ fields, config, set, w }: {
  fields: Field[];
  config: Config;
  set: (key: string, value: unknown) => void;
  w: Widget;
}) {
  const shown = fields.filter((f) => !f.showIf || f.showIf(config));
  // Consecutive half fields share a row.
  const rows: Field[][] = [];
  for (const f of shown) {
    const last = rows.at(-1);
    if (f.half && last && last.length === 1 && last[0]!.half) last.push(f);
    else rows.push([f]);
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.map((f) => f.key).join("+")} className={row.length === 2 ? "grid grid-cols-2 gap-2" : ""}>
          {row.map((f) => <FieldControl key={f.key} f={f} config={config} set={set} w={w} />)}
        </div>
      ))}
    </div>
  );
}

function FieldControl({ f, config, set, w }: { f: Field; config: Config; set: (key: string, value: unknown) => void; w: Widget }) {
  const v = fieldValue(f, config);
  const put = (value: unknown) => set(f.key, value);
  const note = f.note && <div className="text-[10px] text-zinc-600 mt-0.5">{f.note}</div>;

  switch (f.kind) {
    case "number":
      return (
        <div>
          <Label text={f.label} />
          <input type="number" aria-label={f.label} min={f.min} max={f.max} step={f.step}
            value={(v as number | undefined) ?? f.default ?? ""} placeholder={f.blank}
            onChange={(e) => put(e.target.value === "" ? undefined : Number(e.target.value))}
            className={numInp} />
          {note}
        </div>
      );
    case "text":
      return (
        <div>
          <Label text={f.label} />
          <input aria-label={f.label} value={(v as string | undefined) ?? f.default ?? ""} placeholder={f.placeholder}
            onChange={(e) => put(e.target.value === "" ? undefined : e.target.value)} className={inp} />
          {note}
        </div>
      );
    case "value":
      return (
        <div>
          <Label text={f.label} />
          <input aria-label={f.label} value={String(v ?? f.default ?? "")} placeholder={f.placeholder}
            onChange={(e) => put(e.target.value === "" ? undefined : parseValue(e.target.value))}
            className={numInp} />
          {note}
        </div>
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" aria-label={f.label} checked={(v as boolean | undefined) ?? f.default ?? false}
            onChange={(e) => put(e.target.checked)} className="accent-blue-500" />
          <span className="text-xs text-zinc-300">{f.label}</span>
        </label>
      );
    case "color": {
      const cur = v as string | undefined;
      const isNone = cur === "none" || (f.none !== undefined && cur === f.none);
      const custom = cur !== undefined && !isNone;
      const picker = (value: string) => (
        <div className="flex gap-1 items-center flex-1 min-w-0">
          <input type="color" aria-label={f.label} value={value} onChange={(e) => put(e.target.value)} className={colorBox} />
          <input value={value} onChange={(e) => put(e.target.value || undefined)} className={`${inp} font-mono text-[10px]`} />
        </div>
      );
      if (!f.optional) {
        return <div><Label text={f.label} />{picker(cur ?? f.default ?? "#000000")}{note}</div>;
      }
      return (
        <div>
          <Label text={f.label} />
          <div className="flex gap-1.5 flex-wrap items-center">
            <button onClick={() => put(undefined)} className={pick(cur === undefined)}>default</button>
            {f.none !== undefined && <button onClick={() => put(f.none)} className={pick(isNone)}>none</button>}
            <button onClick={() => !custom && put(f.default ?? "#ffffff")} className={pick(custom)}>custom</button>
            {custom && picker(cur)}
          </div>
          {note}
        </div>
      );
    }
    case "choice": {
      const cur = (v as string | undefined) ?? f.default ?? "";
      if (f.display === "select") {
        return (
          <div>
            <Label text={f.label} />
            <select aria-label={f.label} value={cur} onChange={(e) => put(e.target.value)} className={inp}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
            </select>
            {note}
          </div>
        );
      }
      if (f.display === "swatches") {
        return (
          <div>
            <Label text={f.label} />
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {f.options.map((o) => (
                <button key={o.value} title={o.label ?? o.value} aria-label={`${f.label} ${o.value}`} onClick={() => put(o.value)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${cur === o.value ? "border-white scale-110" : "border-zinc-700 hover:border-zinc-400"}`}
                  style={{ backgroundColor: o.swatch }} />
              ))}
            </div>
            {note}
          </div>
        );
      }
      return (
        <div>
          <Label text={f.label} />
          <div className="flex gap-1 flex-wrap">
            {f.options.map((o) => (
              <button key={o.value} onClick={() => put(o.value === "" ? undefined : o.value)} className={pick(cur === o.value)}>
                {o.label ?? o.value}
              </button>
            ))}
          </div>
          {note}
        </div>
      );
    }
    case "page":
      return <PagePicker f={f} value={v as string | undefined} put={put} />;
    case "binding":
      return (
        <div>
          <Label text={f.label} />
          <BindingInput value={(v as string | undefined) ?? ""} onChange={(s) => put(s || undefined)}
            placeholder={f.placeholder ?? "ns:plant.tag or datasource:path"} className={`${inp} font-mono w-full`} />
          {note}
        </div>
      );
    case "image":
      return <ImagePicker value={(v as string | undefined) ?? ""} put={put} />;
    case "symbol": {
      const sym = SYMBOLS.find((s) => s.id === v);
      return (
        <div>
          <Label text={f.label} />
          <div className="flex gap-2 items-center">
            {sym && <SymbolSVG svg={sym.svg} size={28} />}
            <select aria-label={f.label} value={(v as string | undefined) ?? ""} onChange={(e) => put(e.target.value || undefined)} className={inp}>
              <option value="">— select symbol —</option>
              {SYMBOLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      );
    }
    case "faceplate":
      return <FaceplatePicker f={f} value={v as string | undefined} put={put} />;
    case "faceplateParams":
      return <FaceplateParams f={f} faceplateId={config.faceplateId as string | undefined}
        value={(v as Record<string, string> | undefined) ?? {}} put={put} />;
    case "list": {
      const items = (v as Config[] | undefined) ?? f.seed?.(w) ?? [];
      const update = (i: number, key: string, value: unknown) =>
        put(items.map((it, j) => (j === i ? withKey(it, key, value) : it)));
      return (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label text={f.label} />
            {(f.max === undefined || items.length < f.max) && (
              <button onClick={() => put([...items, f.newItem(items)])}
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700">+ add</button>
            )}
          </div>
          {items.length === 0 && f.empty && <div className="text-[10px] text-zinc-600 italic">{f.empty}</div>}
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="border border-zinc-700/50 rounded p-1.5 relative">
                <button aria-label={`Remove ${f.label} ${i + 1}`} onClick={() => put(items.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-1 text-zinc-600 hover:text-red-400 text-xs">×</button>
                <SettingsFields fields={f.item} config={it} set={(key, value) => update(i, key, value)} w={w} />
              </div>
            ))}
          </div>
          {note}
        </div>
      );
    }
  }
}

/** Sets key on a copy of obj; undefined removes it. */
function withKey(obj: Config, key: string, value: unknown): Config {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function PagePicker({ f, value, put }: { f: Field; value?: string; put: (v: unknown) => void }) {
  const pages = useProject((s) => s.project.pages);
  return (
    <div>
      <Label text={f.label} />
      <select aria-label={f.label} value={value ?? ""} onChange={(e) => put(e.target.value || undefined)} className={inp}>
        <option value="">— select page —</option>
        {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

function FaceplatePicker({ f, value, put }: { f: Field; value?: string; put: (v: unknown) => void }) {
  const faceplates = useProject((s) => s.project.faceplates) ?? [];
  return (
    <div>
      <Label text={f.label} />
      <select aria-label={f.label} value={value ?? ""} onChange={(e) => put(e.target.value || undefined)} className={inp}>
        <option value="">— select faceplate —</option>
        {faceplates.map((fp) => <option key={fp.id} value={fp.id}>{fp.name}</option>)}
      </select>
    </div>
  );
}

function FaceplateParams({ f, faceplateId, value, put }: {
  f: Field; faceplateId?: string; value: Record<string, string>; put: (v: unknown) => void;
}) {
  const fp = useProject((s) => s.project.faceplates?.find((x) => x.id === faceplateId));
  if (!fp) return null;
  if (fp.params.length === 0) return <div className="text-[10px] text-zinc-600 italic">This faceplate has no parameters.</div>;
  return (
    <div className="space-y-1.5">
      <Label text={f.label} />
      {fp.params.map((p) => (
        <div key={p.name}>
          <div className="text-[10px] text-zinc-400 font-mono">{`{${p.name}}`}{p.description && <span className="text-zinc-600 ml-1 font-sans">{p.description}</span>}</div>
          <BindingInput value={value[p.name] ?? ""} placeholder="value or tag path"
            onChange={(s) => put(withKey(value, p.name, s || undefined))} className={`${inp} font-mono w-full`} />
        </div>
      ))}
    </div>
  );
}

function ImagePicker({ value: src, put }: { value: string; put: (v: unknown) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const images = useProject((s) => s.project.images) ?? [];

  const isLib = src.startsWith("lib:");
  const libId = isLib ? src.slice(4) : null;
  const libAsset = libId ? images.find((i) => i.id === libId) : null;
  const previewSrc = isLib ? (libAsset?.dataUrl ?? null) : (src || null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => put(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div>
          <Label text="From image library" />
          <div className="grid grid-cols-3 gap-1 mt-1 max-h-40 overflow-auto">
            {images.map((img) => (
              <button key={img.id} onClick={() => put(`lib:${img.id}`)} title={img.name}
                className={`rounded border p-0.5 transition-colors ${
                  libId === img.id ? "border-blue-500 bg-blue-950/30" : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40"}`}>
                <img src={img.dataUrl} alt={img.name} className="w-full object-contain rounded" style={{ height: 40 }} />
              </button>
            ))}
          </div>
          <div className="text-[9px] text-zinc-600 mt-1">Click to select · or use URL / upload below</div>
        </div>
      )}
      <div>
        <Label text="Image URL" />
        <input value={isLib ? "" : src} onChange={(e) => put(e.target.value || undefined)}
          placeholder="https://… or leave blank" className={`mt-1 ${inp}`} />
      </div>
      <button onClick={() => fileRef.current?.click()}
        className="w-full py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 border-dashed">
        Upload from file…
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {previewSrc && (
        <div className="space-y-1">
          <img src={previewSrc} alt="" className="w-full max-h-24 object-contain rounded border border-zinc-700 bg-zinc-950" />
          {libAsset && <div className="text-[10px] text-zinc-500 text-center">{libAsset.name} · {libAsset.width}×{libAsset.height}</div>}
          <button onClick={() => put(undefined)} className="text-[10px] text-red-500 hover:text-red-400">Remove image</button>
        </div>
      )}
    </div>
  );
}
