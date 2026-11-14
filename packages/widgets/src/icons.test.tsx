import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ICON_NAMES, Icon } from "./icons";
import { ICON_NODES } from "./iconData";

const schema = JSON.parse(readFileSync(resolve(__dirname, "../../../schema.json"), "utf8")) as { $defs: { PageIcon: { enum: string[] } } };

describe("icons", () => {
  it("the icons a project can name are exactly the ones that are drawn", () => {
    expect([...ICON_NAMES].sort()).toEqual([...schema.$defs.PageIcon.enum].sort());
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES)("%s draws lines in a 24 by 24 box", (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toMatch(/<(path|circle|rect|line|polyline|polygon|ellipse) /);
  });

  it("a drawing from the icon set holds only shapes and their geometry", () => {
    for (const [name, nodes] of Object.entries(ICON_NODES)) {
      for (const [tag, attrs] of nodes) {
        expect(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"], name).toContain(tag);
        for (const k of Object.keys(attrs)) expect(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points"], `${name}.${k}`).toContain(k);
      }
    }
  });
});
