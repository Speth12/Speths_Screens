import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MANIFESTS } from "@speths-screens/widgets";
import { CloseIcon, WIDGET_ICONS, WidgetIcon } from "./icons";

afterEach(cleanup);

describe("icons", () => {
  it("an icon is decoration: hidden from screen readers and not a Tab stop", () => {
    const { container } = render(<CloseIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
  });

  it.each([
    ["the default", {}, "16"],
    ["a size of its own", { size: 12 }, "12"],
  ])("draws at %s", (_, props, want) => {
    const { container } = render(<CloseIcon {...props} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe(want);
  });

  it("keeps its place on the text line when given a class", () => {
    const { container } = render(<CloseIcon className="text-red-500" />);
    const cls = container.querySelector("svg")!.getAttribute("class")!;
    expect(cls).toContain("inline-block");
    expect(cls).toContain("text-red-500");
  });

  it("has an icon for every widget type", () => {
    const missing = MANIFESTS.map((m) => m.type).filter((t) => !WIDGET_ICONS[t]);
    expect(missing).toEqual([]);
    const { container } = render(<WidgetIcon type="gauge" size={14} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("14");
  });
});

// Symbols typed as text used to stand in for icons. They draw differently on every machine, cannot
// be sized or colored like the rest, and are read out by screen readers ("black diamond").
describe("the editor's source", () => {
  const GLYPHS = "▪✓✗✕▾▸◆▣⊕⚠↺🔒🔓⬛🔴◑▊⇔◈📈⊞🖼▦↩↪⚙⬡☀☾⬆↗◀▶✎⌫⬤▲▼↔↕↑↓";
  const src = join(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

  it("draws icons from ui/icons, not from symbols typed as text", () => {
    const found: string[] = [];
    for (const f of walk(src).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const hit = [...line].filter((ch) => GLYPHS.includes(ch));
        if (hit.length || />×<\/button>/.test(line)) found.push(`${relative(src, f).split("\\").join("/")}:${i + 1} ${hit.join("") || "×"}`);
      });
    }
    expect(found).toEqual([]);
  });
});
