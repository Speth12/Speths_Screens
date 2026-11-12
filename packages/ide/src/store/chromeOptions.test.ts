import { describe, expect, it } from "vitest";
import { contrastRatio } from "@speths-screens/widgets";
import type { Shell } from "@speths-screens/shared-types";
import { chromeWarnings, patchHeader, patchHeaderStyle, patchNavOptions, patchNavStyle, withNav } from "./chromeOptions";

describe("changing the built-in header and navigation", () => {
  it("a choice is stored, and taking the last one back leaves no shell at all", () => {
    const one = patchHeader(undefined, { clock: "none" });
    expect(one).toEqual({ header: { clock: "none" } });
    expect(patchHeader(one, { clock: undefined })).toBeUndefined();
  });

  it("keeps what else the shell holds", () => {
    const shell: Shell = { nav: "sidebar", chrome: "builtin", header: { alarms: true } };
    expect(patchHeader(shell, { logo: "none" })).toEqual({ nav: "sidebar", chrome: "builtin", header: { alarms: true, logo: "none" } });
    expect(patchNavOptions(shell, { width: 240 })).toEqual({ ...shell, navOptions: { width: 240 } });
    expect(patchHeader(shell, { alarms: undefined })).toEqual({ nav: "sidebar", chrome: "builtin" });
  });

  it("an emptied text is no choice", () => {
    expect(patchHeader({ header: { logoText: "PX" } }, { logoText: "" })).toBeUndefined();
  });

  it("the look is a part of its own, removed when empty", () => {
    const a = patchHeaderStyle(undefined, { background: "#000000" });
    expect(a).toEqual({ header: { style: { background: "#000000" } } });
    const b = patchHeaderStyle(a, { bold: true });
    expect(b).toEqual({ header: { style: { background: "#000000", bold: true } } });
    expect(patchHeaderStyle(patchHeaderStyle(b, { bold: undefined }), { background: undefined })).toBeUndefined();
    expect(patchNavStyle({ nav: "sidebar" }, { activeBackground: "#f59e0b" })).toEqual({ nav: "sidebar", navOptions: { style: { activeBackground: "#f59e0b" } } });
  });

  it("the navigation style is set beside the choices, not in place of them", () => {
    const shell: Shell = { header: { clock: "none" } };
    expect(withNav(shell, "sidebar")).toEqual({ header: { clock: "none" }, nav: "sidebar" });
    expect(withNav({ nav: "sidebar" }, undefined)).toBeUndefined();
  });
});

describe("what the editor warns about", () => {
  const warn = (shell: Shell | undefined, mode?: string) => chromeWarnings(shell, mode, contrastRatio);
  const cases: { name: string; shell: Shell | undefined; mode?: string; says: RegExp | null }[] = [
    { name: "nothing chosen", shell: undefined, says: null },
    { name: "the user menu off with logins on", shell: { header: { showUser: false } }, mode: "login", says: /user menu stays/ },
    { name: "the user menu off with security off", shell: { header: { showUser: false } }, mode: "none", says: null },
    { name: "no Settings entry", shell: { navOptions: { showSettings: false } }, says: /cannot change the language/ },
    { name: "no navigation", shell: { nav: "none" }, says: /every page needs a button/ },
    { name: "a picture logo with no picture", shell: { header: { logo: "image" } }, says: /Choose a picture/ },
    { name: "an alarm count with no page", shell: { header: { alarms: true } }, says: /does nothing when clicked/ },
    { name: "an alarm count with a page", shell: { header: { alarms: true, alarmsPage: "p2" } }, says: null },
    { name: "grey text on white", shell: { header: { style: { textColor: "#999999", background: "#ffffff" } } }, says: /header text is hard to read.*2\.8 to 1/ },
    { name: "black text on white", shell: { header: { style: { textColor: "#000000", background: "#ffffff" } } }, says: null },
    { name: "a color it cannot work out is not judged", shell: { header: { style: { textColor: "token:alarm-info", background: "#ffffff" } } }, says: null },
    { name: "the navigation's current page", shell: { navOptions: { style: { activeTextColor: "#ffff00", activeBackground: "#ffffff" } } }, says: /navigation's current page is hard to read/ },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const got = warn(c.shell, c.mode);
      if (c.says === null) expect(got).toEqual([]);
      else { expect(got).toHaveLength(1); expect(got[0]).toMatch(c.says); }
    });
  }
});
