import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FONTS, THEMES, TYPE_SCALE, themeVars, type FontId } from "./tokens";

describe("type scale", () => {
  it("every theme writes the scale as --type-* properties", () => {
    for (const t of THEMES) {
      const vars = themeVars(t);
      for (const k of Object.keys(TYPE_SCALE)) expect(vars[`--type-${k}`], `${t.id} --type-${k}`).toBe(t.type.scale[k as keyof typeof TYPE_SCALE]);
    }
  });

  it("grows from one step to the next, and the smallest text is at least 12px", () => {
    const px = Object.values(TYPE_SCALE).map((v) => parseFloat(v) * 16);
    expect(px[0]).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < px.length; i++) expect(px[i]!).toBeGreaterThan(px[i - 1]!);
  });
});

describe("fonts", () => {
  const fontsDir = resolve(__dirname, "../fonts");
  const fontsCss = readFileSync(resolve(fontsDir, "fonts.css"), "utf8");
  const bundled: FontId[] = ["inter", "roboto", "open-sans", "noto-sans"];

  /** The font files fonts.css names for a family: the text between url("./ and the next quote. */
  function filesOf(family: string): string[] {
    const files: string[] = [];
    for (const block of fontsCss.split("@font-face").slice(1)) {
      if (!block.includes(`font-family: "${family}"`)) continue;
      const start = block.indexOf('url("./') + 'url("./'.length;
      files.push(block.slice(start, block.indexOf('"', start)));
    }
    return files;
  }

  it("every stack ends in a generic family, so a missing font still gives sans-serif text", () => {
    for (const [id, f] of Object.entries(FONTS)) expect(f.stack.endsWith("sans-serif"), id).toBe(true);
  });

  it("the default theme uses Inter", () => {
    expect(THEMES[0]!.type.fontSans).toBe(FONTS.inter.stack);
  });

  it.each(bundled)("%s has Latin and Latin Extended files in fonts.css, and they exist", (id) => {
    const files = filesOf(FONTS[id].name);
    expect(files.sort()).toEqual([`${id}-latin-ext.woff2`, `${id}-latin.woff2`]);
    for (const f of files) expect(readFileSync(resolve(fontsDir, f)).length, f).toBeGreaterThan(10_000);
  });

  it.each(bundled)("%s has its license beside the files", (id) => {
    expect(readFileSync(resolve(fontsDir, `licenses/${id}-OFL.txt`), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });
});
