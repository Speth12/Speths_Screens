import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { FONTS, THEMES, TYPE_SCALE, fontStack, projectFontsCss, themeVars, type FontId } from "./tokens";

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
  const bundled = (Object.keys(FONTS) as FontId[]).filter((id) => id !== "system");

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

  it("every stack ends in a generic family, so a missing font still gives text of its kind", () => {
    for (const [id, f] of Object.entries(FONTS)) expect(/(sans-serif|monospace|serif)$/.test(f.stack), id).toBe(true);
    expect(FONTS["jetbrains-mono"].stack.endsWith("monospace")).toBe(true);
    expect(FONTS.merriweather.stack.endsWith(" serif")).toBe(true);
  });

  it("there are at least twenty bundled families, of every kind", () => {
    expect(bundled.length).toBeGreaterThanOrEqual(20);
    for (const kind of ["sans", "condensed", "mono", "serif", "display"]) expect(bundled.some((id) => FONTS[id].kind === kind), kind).toBe(true);
  });

  it("a font id that is not bundled is one of the project's own", () => {
    expect(fontStack("acme-brand")).toBe("'pf-acme-brand', 'Segoe UI', system-ui, sans-serif");
    expect(fontStack(undefined)).toBeUndefined();
    expect(projectFontsCss([{ id: "acme-brand", name: "Acme", dataUrl: "data:font/woff2;base64,AAAA" }])).toBe(`@font-face{font-family:'pf-acme-brand';font-display:swap;src:url("data:font/woff2;base64,AAAA")}`);
    // An id or a URL that could break out of the rule is left out.
    expect(projectFontsCss([{ id: "x'} body{", name: "x", dataUrl: "data:font/woff2;base64,AAAA" }, { id: "ok", name: "x", dataUrl: "https://example.com/f.woff2" }])).toBe("");
  });

  it("the default theme uses Inter", () => {
    expect(THEMES[0]!.type.fontSans).toBe(FONTS.inter.stack);
  });

  it.each(bundled)("%s has a Latin file for every weight it says it has, and they exist", (id) => {
    const files = filesOf(FONTS[id].name);
    const want = FONTS[id].variable ? [`${id}-latin.woff2`] : FONTS[id].weights.map((w) => `${id}-latin-${w}.woff2`);
    for (const f of want) expect(files, f).toContain(f);
    for (const f of files) expect(readFileSync(resolve(fontsDir, f)).length, f).toBeGreaterThan(5_000);
  });

  it.each(bundled)("%s has its license beside the files", (id) => {
    const file = readdirSync(resolve(fontsDir, "licenses")).find((f) => f.startsWith(`${id}-`) && !bundled.some((other) => other !== id && other.startsWith(`${id}-`) && f.startsWith(`${other}-`)));
    expect(file, id).toBeDefined();
    expect(readFileSync(resolve(fontsDir, "licenses", file!), "utf8")).toMatch(/SIL OPEN FONT LICENSE|Apache License/i);
  });
});
