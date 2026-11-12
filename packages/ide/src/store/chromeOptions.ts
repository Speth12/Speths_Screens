// Changing what the built-in header and navigation show and how they look (shell.header,
// shell.navOptions). A choice that is the default is not stored, and a part with nothing left in it
// is removed, so a project that takes every option back is the project it was before.
import type { Shell, ShellHeader, ShellNav, ShellNavOptions, ShellStyle } from "@speths-screens/shared-types";

/** `o` without the keys that are undefined or an empty text; undefined when nothing is left. */
function compact<T extends object>(o: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") out[k] = v;
  return Object.keys(out).length ? (out as T) : undefined;
}

/** The shell with a part replaced; an empty shell is no shell. */
function withPart<K extends keyof Shell>(shell: Shell | undefined, key: K, value: Shell[K] | undefined): Shell | undefined {
  return compact({ ...(shell ?? {}), [key]: value } as Shell);
}

export function patchHeader(shell: Shell | undefined, patch: Partial<ShellHeader>): Shell | undefined {
  return withPart(shell, "header", compact({ ...(shell?.header ?? {}), ...patch }));
}

export function patchNavOptions(shell: Shell | undefined, patch: Partial<ShellNavOptions>): Shell | undefined {
  return withPart(shell, "navOptions", compact({ ...(shell?.navOptions ?? {}), ...patch }));
}

export function patchHeaderStyle(shell: Shell | undefined, patch: Partial<ShellStyle>): Shell | undefined {
  return patchHeader(shell, { style: compact({ ...(shell?.header?.style ?? {}), ...patch }) });
}

export function patchNavStyle(shell: Shell | undefined, patch: Partial<ShellStyle>): Shell | undefined {
  return patchNavOptions(shell, { style: compact({ ...(shell?.navOptions?.style ?? {}), ...patch }) });
}

/** The navigation style; tabs is what a project with none named gets, so it is not stored. */
export function withNav(shell: Shell | undefined, nav: ShellNav | undefined): Shell | undefined {
  return withPart(shell, "nav", nav);
}

/** What the editor warns about in the choices, in words for the person choosing. */
export function chromeWarnings(shell: Shell | undefined, securityMode: string | undefined, ratio: (a?: string, b?: string) => number | undefined): string[] {
  const out: string[] = [];
  const h = shell?.header, n = shell?.navOptions;
  if (h?.showUser === false && securityMode === "login") out.push("This project asks for logins, so the user menu stays: it is the way to log out.");
  if (n?.showSettings === false) out.push("Without the Settings entry operators cannot change the language, switch light and dark, or lock the screen.");
  if (shell?.nav === "none") out.push("With no navigation, every page needs a button that goes to the others.");
  if (h?.logo === "image" && !h.logoImage) out.push("Choose a picture for the logo, or no logo is shown.");
  if (h?.alarms && !h.alarmsPage) out.push("The alarm count does nothing when clicked until you choose the page it opens.");
  const low = (s: ShellStyle | undefined, what: string) => {
    const r = ratio(s?.textColor, s?.background);
    if (r !== undefined && r < 4.5) out.push(`The ${what} text is hard to read on its background (contrast ${r.toFixed(1)} to 1; 4.5 or more reads well).`);
    const a = ratio(s?.activeTextColor, s?.activeBackground);
    if (a !== undefined && a < 4.5) out.push(`The ${what}'s current page is hard to read (contrast ${a.toFixed(1)} to 1; 4.5 or more reads well).`);
  };
  low(h?.style, "header");
  low(n?.style, "navigation");
  return out;
}
