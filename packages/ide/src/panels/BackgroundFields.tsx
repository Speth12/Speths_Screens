// What is behind a page: nothing of its own, one color, a gradient, a picture or a pattern. Used for
// one page (its properties) and for every page (the theme).
import type { Background } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";

const inp = "w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-zinc-500";
const KINDS: [Background["kind"] | "", string][] = [["", ""], ["solid", "One color"], ["gradient", "Gradient"], ["picture", "Picture"], ["pattern", "Pattern"]];

/** The background with a field changed; a field set to nothing is removed. */
export function withBackground(bg: Background, patch: Partial<Background>): Background {
  const next = { ...bg, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "") delete next[k];
  return next as unknown as Background;
}

/** A new background of a kind, with what it needs to show something at once. */
export function newBackground(kind: Background["kind"]): Background {
  if (kind === "solid") return { kind, color: "#e8edf3" };
  if (kind === "gradient") return { kind, color: "#0f172a", color2: "#1d3a7a", angle: 150 };
  if (kind === "pattern") return { kind, pattern: "dots" };
  return { kind, fit: "fill", dim: 0.5 };
}

function Color({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <label className="block text-[10px] text-zinc-500">{label}
      <span className="flex gap-1 items-center mt-0.5">
        <input type="color" aria-label={`${label}: pick`} value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#888888"} onChange={(e) => onChange(e.target.value)}
          className="h-7 w-8 rounded border border-zinc-700 bg-zinc-900 cursor-pointer shrink-0" />
        <input aria-label={label} value={value ?? ""} placeholder="the theme's" onChange={(e) => onChange(e.target.value.trim() || undefined)} className={`${inp} font-mono text-[10px]`} />
      </span>
    </label>
  );
}

export function BackgroundFields({ label, none, value, onChange }: { label: string; none: string; value: Background | undefined; onChange: (bg: Background | undefined) => void }) {
  const images = useProject((s) => s.project.images) ?? [];
  const set = (patch: Partial<Background>) => value && onChange(withBackground(value, patch));
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <label className="block text-[10px] text-zinc-500">{label}
        <select aria-label={label} value={value?.kind ?? ""} onChange={(e) => onChange(e.target.value ? newBackground(e.target.value as Background["kind"]) : undefined)} className={`${inp} mt-0.5`}>
          {KINDS.map(([k, name]) => <option key={k} value={k}>{k === "" ? none : name}</option>)}
        </select>
      </label>
      {value?.kind === "solid" && <Color label="Color" value={value.color} onChange={(color) => set({ color })} />}
      {value?.kind === "gradient" && (
        <div className="grid grid-cols-2 gap-1.5">
          <Color label="From" value={value.color} onChange={(color) => set({ color })} />
          <Color label="To" value={value.color2} onChange={(color2) => set({ color2 })} />
          <label className="block text-[10px] text-zinc-500 col-span-2">Direction ({value.angle ?? 180}°)
            <input type="range" aria-label="Gradient direction" min={0} max={360} step={15} value={value.angle ?? 180} onChange={(e) => set({ angle: Number(e.target.value) })} className="w-full" />
          </label>
        </div>
      )}
      {value?.kind === "pattern" && (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="block text-[10px] text-zinc-500 col-span-2">Marks
            <select aria-label="Pattern" value={value.pattern ?? "dots"} onChange={(e) => set({ pattern: e.target.value as Background["pattern"] })} className={`${inp} mt-0.5`}>
              <option value="dots">Dots</option><option value="squares">Squares</option><option value="stripes">Stripes</option>
            </select>
          </label>
          <Color label="Page color" value={value.color} onChange={(color) => set({ color })} />
          <Color label="Marks color" value={value.color2} onChange={(color2) => set({ color2 })} />
        </div>
      )}
      {value?.kind === "picture" && (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-zinc-500">Picture
            <select aria-label="Background picture" value={value.picture ?? ""} onChange={(e) => set({ picture: e.target.value || undefined })} className={`${inp} mt-0.5`}>
              <option value="">Choose…</option>
              {images.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          {images.length === 0 && <div className="text-[10px] text-zinc-600">Add a picture in the Images tab first.</div>}
          <label className="block text-[10px] text-zinc-500">How it fits
            <select aria-label="Picture fit" value={value.fit ?? "fill"} onChange={(e) => set({ fit: e.target.value as Background["fit"] })} className={`${inp} mt-0.5`}>
              <option value="fill">Fills the page (may be cut off)</option><option value="whole">All of it shown</option><option value="tile">Repeated</option><option value="stretch">Stretched to the page</option>
            </select>
          </label>
          <label className="block text-[10px] text-zinc-500">Faded toward the page color ({Math.round((value.dim ?? 0) * 100)}%)
            <input type="range" aria-label="Picture fade" min={0} max={0.9} step={0.05} value={value.dim ?? 0} onChange={(e) => set({ dim: Number(e.target.value) || undefined })} className="w-full" />
          </label>
          <p className="text-[10px] text-amber-400/90 leading-relaxed">Text and plain widgets sit straight on the picture. Fade it, or give them cards, so they still read; this is not checked for you.</p>
        </div>
      )}
    </div>
  );
}
