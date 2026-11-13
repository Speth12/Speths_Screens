// Fetches the bundled fonts from the Fontsource packages on npm and writes packages/widgets/fonts
// (the WOFF2 files, fonts.css and each license) and packages/widgets/src/fontList.ts.
//
//   node scripts/fonts/fetch.mjs
//
// Latin and Latin Extended only (a family without Latin Extended gets Latin alone). A family with a variable font gets one file per subset covering its
// whole weight range; a family without one gets a file per weight (300 to 700 of what it has). Run it
// again to add a family: add it to FAMILIES below. The files are committed, so a build needs no network.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(root, "packages/widgets/fonts");

// id (the Fontsource package name), and the kind that picks the fallback fonts.
const FAMILIES = [
  ["inter", "sans"], ["roboto", "sans"], ["open-sans", "sans"], ["noto-sans", "sans"],
  ["source-sans-3", "sans"], ["ibm-plex-sans", "sans"], ["lato", "sans"], ["montserrat", "sans"],
  ["poppins", "sans"], ["nunito", "sans"], ["work-sans", "sans"], ["barlow", "sans"],
  ["roboto-condensed", "condensed"], ["barlow-condensed", "condensed"], ["oswald", "condensed"],
  ["jetbrains-mono", "mono"], ["roboto-mono", "mono"], ["ibm-plex-mono", "mono"],
  ["roboto-slab", "serif"], ["merriweather", "serif"], ["orbitron", "display"],
];
const STATIC_WEIGHTS = [300, 400, 500, 600, 700];
const SUBSETS = ["latin-ext", "latin"];

const tmp = mkdtempSync(join(tmpdir(), "fonts-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function unpack(pkg) {
  try {
    const name = execFileSync(npm, ["pack", pkg, "--silent", "--pack-destination", tmp], { cwd: tmp, encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/).pop();
    const dir = join(tmp, name.replace(/\.tgz$/, ""));
    mkdirSync(dir);
    execFileSync("tar", ["-xzf", name, "-C", name.replace(/\.tgz$/, "")], { cwd: tmp });
    return join(dir, "package");
  } catch { return null; }
}

/** The unicode-range of the @font-face block in a package's CSS whose file name holds `needle`. */
function rangeOf(css, needle) {
  for (const block of css.split("@font-face").slice(1)) {
    if (!block.includes(needle)) continue;
    const m = /unicode-range:\s*([^;]+);/.exec(block);
    if (m) return m[1].trim();
  }
  throw new Error(`no unicode-range for ${needle}`);
}

const list = [];
let css = `/* Fonts bundled with the widget library, so a screen looks the same on a PLC with no internet.
 * Latin and Latin Extended (Western and Central European languages). Written by scripts/fonts/fetch.mjs;
 * each family's license is in fonts/licenses and must stay with the files. See fonts/README.md. */\n`;
const face = (family, weight, file, range) =>
  `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("./${file}") format("woff2");\n  unicode-range: ${range};\n}\n`;

for (const old of readdirSync(out)) if (old.endsWith(".woff2")) rmSync(join(out, old));
mkdirSync(join(out, "licenses"), { recursive: true });

for (const [id, kind] of FAMILIES) {
  let pkg = unpack(`@fontsource-variable/${id}`);
  let meta = pkg && JSON.parse(readFileSync(join(pkg, "metadata.json"), "utf8"));
  const variable = !!pkg && existsSync(join(pkg, "files", `${id}-latin-wght-normal.woff2`));
  let weights;
  if (variable) {
    const { min, max } = meta.variable.wght;
    weights = [Number(min), Number(max)];
    const pcss = readFileSync(join(pkg, "wght.css"), "utf8");
    for (const subset of SUBSETS.filter((x) => meta.subsets.includes(x))) {
      const src = `${id}-${subset}-wght-normal.woff2`, file = `${id}-${subset}.woff2`;
      copyFileSync(join(pkg, "files", src), join(out, file));
      css += face(meta.family, `${min} ${max}`, file, rangeOf(pcss, src));
    }
  } else {
    pkg = unpack(`@fontsource/${id}`);
    if (!pkg) throw new Error(`no Fontsource package for ${id}`);
    meta = JSON.parse(readFileSync(join(pkg, "metadata.json"), "utf8"));
    weights = STATIC_WEIGHTS.filter((w) => meta.weights.includes(w));
    for (const w of weights) {
      const pcss = readFileSync(join(pkg, `${w}.css`), "utf8");
      for (const subset of SUBSETS.filter((x) => meta.subsets.includes(x))) {
        const src = `${id}-${subset}-${w}-normal.woff2`, file = `${id}-${subset}-${w}.woff2`;
        copyFileSync(join(pkg, "files", src), join(out, file));
        css += face(meta.family, w, file, rangeOf(pcss, src));
      }
    }
  }
  const license = meta.license.type.startsWith("OFL") ? "OFL" : meta.license.type.replace(/[^A-Za-z0-9]+/g, "-");
  const licenseFile = join(out, "licenses", `${id}-${license}.txt`);
  if (!existsSync(licenseFile)) copyFileSync(join(pkg, "LICENSE"), licenseFile);
  list.push({ id, name: meta.family, kind, variable, weights, license: meta.license.type, attribution: meta.license.attribution });
  console.log(`${meta.family}: ${variable ? `variable ${weights[0]} to ${weights[1]}` : `weights ${weights.join(", ")}`} (${meta.license.type})`);
}

writeFileSync(join(out, "fonts.css"), css);
writeFileSync(resolve(root, "packages/widgets/src/fontList.ts"),
  `// Written by scripts/fonts/fetch.mjs. DO NOT EDIT: the fonts bundled in packages/widgets/fonts.\n` +
  `// weights is [lightest, heaviest] for a variable font, or each weight there is a file for.\n` +
  `export const FONT_LIST = [\n` +
  list.map((f) => `  { id: ${JSON.stringify(f.id)}, name: ${JSON.stringify(f.name)}, kind: ${JSON.stringify(f.kind)}, variable: ${f.variable}, weights: [${f.weights.join(", ")}] },\n`).join("") +
  `] as const;\n`);
writeFileSync(join(out, "FAMILIES.md"),
  `# Bundled font families\n\nWritten by \`scripts/fonts/fetch.mjs\`.\n\n| Family | License | Copyright |\n| --- | --- | --- |\n` +
  list.map((f) => `| ${f.name} | ${f.license} | ${String(f.attribution).replace(/\|/g, "/")} |\n`).join(""));
rmSync(tmp, { recursive: true, force: true });
console.log(`${list.length} families written to packages/widgets/fonts`);
