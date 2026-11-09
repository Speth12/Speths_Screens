// Builds the release files into dist/<version>/: the operator screen, then the runtime for Windows, Linux (x86-64)
// and the WP 6000 panel (Linux ARM64), the panel package, the sample projects and SHA256SUMS.
//
//   node scripts/release/build.mjs [--version=v0.8.0] [--targets=windows/amd64,linux/arm64,linux/amd64]
//
// The operator screen is embedded in each binary when it is built, so the operator is built first. The version
// defaults to `git describe`. Needs Go and Node (the repository's own), and `tar` (Windows 10 and later have one).
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.join("=") || "true"]; }));
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: root, stdio: "inherit", ...opts });
const out = (cmd, a) => execFileSync(cmd, a, { cwd: root, encoding: "utf8" }).trim();

const git = (a, fallback = "") => { try { return out("git", a); } catch { return fallback; } };
const version = args.version ?? git(["describe", "--tags", "--always", "--dirty"], "dev");
const commit = git(["rev-parse", "--short=7", "HEAD"]);
const targets = (args.targets ?? "windows/amd64,linux/arm64,linux/amd64").split(",").map((t) => t.split("/"));
const dist = join(root, "dist", version);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

console.log(`\n== speths-screens ${version} (${commit || "no commit"})\n`);
execSync("npm run build --workspace=packages/operator", { cwd: root, stdio: "inherit" });

const files = [];
for (const [goos, goarch] of targets) {
  const name = `speths-screens-${version}-${goos}-${goarch}${goos === "windows" ? ".exe" : ""}`;
  console.log(`\n== ${goos}/${goarch}`);
  run("go", ["build", "-trimpath", "-ldflags", `-s -w -X main.version=${version} -X main.commit=${commit}`, "-o", join(dist, name), "./cmd/speths-screens"],
    { env: { ...process.env, CGO_ENABLED: "0", GOOS: goos, GOARCH: goarch } });
  files.push(name);
  if (goos === "linux" && goarch === "arm64") {
    // The WP 6000 panel package: the binary, the three scripts and a sample project, in one folder.
    const pkg = join(dist, "panel");
    mkdirSync(pkg, { recursive: true });
    copyFileSync(join(dist, name), join(pkg, "speths-screens"));
    for (const f of ["install-service.sh", "run-test.sh", "uninstall-service.sh"]) copyFileSync(join(root, "scripts/panel", f), join(pkg, f));
    copyFileSync(join(root, "samples/design-directions.screens.json"), join(pkg, "design-directions.screens.json"));
    const tgz = `speths-screens-${version}-panel-linux-arm64.tar.gz`;
    // relative paths with cwd: GNU tar reads "C:\..." as a remote host
    execFileSync("tar", ["-czf", tgz, "-C", "panel", "."], { cwd: dist, stdio: "inherit" });
    rmSync(pkg, { recursive: true, force: true });
    files.push(tgz);
  }
}

// The sample projects, as plain files next to the binaries.
for (const f of ["demo.screens.json", "samples/design-directions.screens.json", "samples/feature-tour.screens.json", "samples/plc-demo.screens.json"]) {
  const name = f.split("/").pop();
  copyFileSync(join(root, f), join(dist, name));
  files.push(name);
}

// Building the operator rewrites the tracked index.html in the embed folder; put it back.
try { execFileSync("git", ["checkout", "--", "cmd/speths-screens/ui/index.html"], { cwd: root, stdio: "ignore" }); } catch { /* not a git checkout */ }

const sums = files.map((f) => `${createHash("sha256").update(readFileSync(join(dist, f))).digest("hex")}  ${f}`).join("\n") + "\n";
writeFileSync(join(dist, "SHA256SUMS"), sums);
console.log(`\n== ${dist}\n${sums}`);
