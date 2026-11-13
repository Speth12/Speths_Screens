// The project's own fonts (Project properties, Fonts): add a font file, name it, remove it. A font is
// kept in the project, so the runtime and a panel with no internet show it; it is then offered
// wherever a font is chosen, after the bundled ones.
import { useRef, useState } from "react";
import { FONTS, fontStack } from "@speths-screens/widgets";
import type { FontAsset } from "@speths-screens/shared-types";
import { useProject } from "../store/projectStore";
import { Button, Input } from "../ui";
import { CloseIcon } from "../ui/icons";

const TYPES: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
/** A font file larger than this is refused: every screen that opens the project downloads it. */
export const MAX_FONT_BYTES = 2 * 1024 * 1024;

/** An id for a font from its file name: small letters, digits and dashes, not one already taken. */
export function fontIdFor(fileName: string, taken: readonly string[]): string {
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "font";
  const used = new Set<string>([...taken, ...Object.keys(FONTS), "mono", "sans", "serif"]);
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Why a file cannot be added as a font, or undefined when it can. */
export function fontFileProblem(name: string, size: number): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!TYPES[ext]) return `${name} is not a font file (TTF, OTF, WOFF or WOFF2).`;
  if (size > MAX_FONT_BYTES) return `${name} is ${(size / 1024 / 1024).toFixed(1)} MB; a font can be 2 MB at most (a WOFF2 file is the smallest).`;
  return undefined;
}

function readAsDataUrl(file: File, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    // The browser often gives a font no type; the data URL says what it is.
    r.onload = () => resolve(String(r.result).replace(/^data:[^;,]*/, `data:${mime}`));
    r.readAsDataURL(file);
  });
}

export function FontLibrary() {
  const fonts = useProject((s) => s.project.fonts) ?? [];
  const setFonts = useProject((s) => s.setFonts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string>();

  const add = async (files: FileList | null) => {
    if (!files) return;
    let next: FontAsset[] = fonts, said: string | undefined;
    for (const file of Array.from(files)) {
      const bad = fontFileProblem(file.name, file.size);
      if (bad) { said = bad; continue; }
      const ext = file.name.split(".").pop()!.toLowerCase();
      const dataUrl = await readAsDataUrl(file, TYPES[ext]!);
      next = [...next, { id: fontIdFor(file.name, next.map((f) => f.id)), name: file.name.replace(/\.[^.]+$/, ""), dataUrl, size: file.size }];
    }
    setProblem(said);
    if (next !== fonts) setFonts(next);
  };

  return (
    <div data-testid="font-library" className="p-3 space-y-2 text-ui-label">
      <p className="text-zinc-500 leading-relaxed">
        {Object.keys(FONTS).length - 1} fonts come with Speth's Screens. Add your own here (TTF, OTF, WOFF or WOFF2): it is kept in the
        project and offered wherever a font is chosen. You need the font's license to use it on your screens.
      </p>
      {fonts.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          <Input aria-label={`Name of ${f.id}`} value={f.name} onChange={(e) => setFonts(fonts.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
          <span className="shrink-0 text-ui text-zinc-300" style={{ fontFamily: fontStack(f.id) }} title={`Drawn in ${f.name}`}>Abc 123</span>
          <button aria-label={`Remove ${f.name}`} title="Remove this font. Text that uses it falls back to the device's font." onClick={() => setFonts(fonts.filter((x) => x.id !== f.id))}
            className="text-zinc-600 hover:text-red-400 px-1"><CloseIcon size={14} /></button>
        </div>
      ))}
      <input ref={fileRef} type="file" aria-label="Font files" accept=".ttf,.otf,.woff,.woff2" multiple className="hidden"
        onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      <Button size="sm" onClick={() => fileRef.current?.click()}>Add a font file…</Button>
      {problem && <p role="alert" className="text-amber-400">{problem}</p>}
    </div>
  );
}
