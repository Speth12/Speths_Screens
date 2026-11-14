import { describe, expect, it } from "vitest";
import { PRESETS, backgroundCss, cardStyleOf, pageBackground, themeBackground } from "./tokens";

const noPicture = () => undefined;
const images = [{ id: "plant", dataUrl: "data:image/png;base64,AAAA" }];
const url = (id: string) => images.find((i) => i.id === id)?.dataUrl;

describe("a background as CSS", () => {
  it("none, or a solid with no color, draws nothing of its own", () => {
    expect(backgroundCss(undefined, noPicture)).toBeUndefined();
    expect(backgroundCss({ kind: "solid" }, noPicture)).toBeUndefined();
    expect(backgroundCss({ kind: "solid", color: "#102030" }, noPicture)).toEqual({ background: "#102030" });
  });

  it("a gradient runs from one color to the other, top to bottom unless told", () => {
    expect(backgroundCss({ kind: "gradient", color: "#000000", color2: "#ffffff" }, noPicture)).toEqual({ background: "linear-gradient(180deg, #000000, #ffffff)" });
    expect(backgroundCss({ kind: "gradient", color: "#000000", color2: "#ffffff", angle: 45 }, noPicture)!.background).toContain("45deg");
    expect(backgroundCss({ kind: "gradient" }, noPicture)!.background).toBe("linear-gradient(180deg, var(--background), var(--secondary))");
  });

  it("each pattern draws its own marks over the page color", () => {
    const seen = new Set<string>();
    for (const pattern of ["dots", "squares", "stripes"] as const) {
      const css = backgroundCss({ kind: "pattern", pattern }, noPicture)!;
      expect(css.backgroundColor).toBe("var(--background)");
      seen.add(String(css.backgroundImage));
    }
    expect(seen.size).toBe(3);
    expect(backgroundCss({ kind: "pattern", color2: "#ff0000" }, noPicture)!.backgroundImage).toContain("#ff0000");
  });

  it("a picture fills the page, and fading lays the page color over it", () => {
    const plain = backgroundCss({ kind: "picture", picture: "plant" }, url)!;
    expect(plain.backgroundImage).toBe('url("data:image/png;base64,AAAA")');
    expect(plain.backgroundSize).toBe("cover");
    const faded = backgroundCss({ kind: "picture", picture: "plant", dim: 0.5 }, url)!;
    expect(faded.backgroundImage).toMatch(/^linear-gradient\(color-mix\(in srgb, var\(--background\) 50%, transparent\).*url\("data:/);
    expect(faded.backgroundSize).toBe("auto, cover");
    expect(backgroundCss({ kind: "picture", picture: "plant", fit: "tile" }, url)!.backgroundRepeat).toBe("repeat");
  });

  it("a picture that is missing draws nothing, so the page keeps its color", () => {
    expect(backgroundCss({ kind: "picture", picture: "gone" }, url)).toBeUndefined();
    expect(backgroundCss({ kind: "picture" }, url)).toBeUndefined();
  });

  it("a token names a theme color", () => {
    expect(backgroundCss({ kind: "solid", color: "token:alarm-critical" }, noPicture)!.background).toBe("var(--alarm-critical)");
  });
});

describe("what is behind a page", () => {
  it("the page's own background wins, then its color, then the theme's, then nothing", () => {
    const theme = { preset: "calm" as const, background: { kind: "solid" as const, color: "#111111" } };
    expect(pageBackground({ background: { kind: "solid", color: "#222222" }, backgroundColor: "#333333" }, theme, images)).toEqual({ background: "#222222" });
    expect(pageBackground({ backgroundColor: "#333333" }, theme, images)).toEqual({ background: "#333333" });
    expect(pageBackground({}, theme, images)).toEqual({ background: "#111111" });
    expect(pageBackground({}, { preset: "calm" }, images)).toBeUndefined();
  });

  it("a preset can bring a background and a card style, which the project's own replace", () => {
    expect(themeBackground({ preset: "glass" })?.kind).toBe("gradient");
    expect(themeBackground({ preset: "glass", background: { kind: "pattern" } })?.kind).toBe("pattern");
    expect(themeBackground(undefined)).toBeUndefined();
    expect(cardStyleOf({ preset: "glass" })).toBe("glass");
    expect(cardStyleOf({ preset: "glass", cardStyle: "plain" })).toBe("plain");
    expect(cardStyleOf(undefined)).toBe("plain");
    expect(Object.keys(PRESETS)).toEqual(["calm", "clean", "modern", "industrial", "soft", "glass", "highContrast"]);
  });
});
